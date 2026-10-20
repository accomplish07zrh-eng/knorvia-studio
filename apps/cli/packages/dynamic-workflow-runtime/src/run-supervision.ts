// SPDX-License-Identifier: Apache-2.0
// 收尾监督。一个 run 有四个可能的终结来源：引擎自身结算、子进程退出、墙钟超时、abort 信号。
// 四者都可能先到，于是收敛规则只有一条——第一个到达的结算生效，其余全部作废；随后统一清理
// （清 timer、摘监听、关 reader、kill 子进程）。清理与结算是同一件事的两半，所以放在一个
// 小对象里，由它持有「已收敛」这个闩锁。
import type { ChildProcess } from "node:child_process";
import type { Interface } from "node:readline";
import { WorkflowError, type RunSettlement } from "@knorvia/dynamic-workflow";
import type { ChildMessage } from "./protocol.js";
import type { SupervisionInput } from "./supervision-types.js";

export type { SupervisionInput } from "./supervision-types.js";

/** stderr 的观测上限：只留尾部 64 KiB，够归因又不至于把 journal 撑爆。 */
const STDERR_TAIL_BYTES = 64 * 1024;

/** abort reason 的两种具名取值；其余一律按用户取消处理。 */
const HOST_CLOSED = "interrupted";
const MODEL_STOP = "model";

/** 起监督并返回结算 promise。 */
export function runSupervision(input: SupervisionInput): Promise<RunSettlement> {
  return new RunWatch(input).begin();
}

/**
 * 一次 run 的收尾闸门。
 */
class RunWatch {
  readonly #input: SupervisionInput;
  #settled = false;
  #stderr = "";
  #timer: ReturnType<typeof setTimeout> | undefined;
  #resolve!: (settlement: RunSettlement) => void;

  constructor(input: SupervisionInput) {
    this.#input = input;
  }

  begin(): Promise<RunSettlement> {
    const { workflow } = this.#input;
    const finished = new Promise<RunSettlement>((resolve) => {
      this.#resolve = resolve;
    });
    // 一切结算（complete / fail / stop / 引擎内部 cap 失败）都经 engine.settled 冒到这里。
    void workflow.settled.then((settlement) => this.settle(settlement));
    this.#armCancel(this.#input.cancelSignal);
    this.#armDeadline(this.#input.wallClockMs);
    this.#watchSandbox();
    this.#watchLines(this.#input.lines);
    return finished;
  }

  /**
   * 收敛到某个结算：闩锁只放行第一个，随后清理定时器、监听、reader 与子进程。
   * kill 只在子进程仍活着时发，避免对已退出的进程补刀。
   */
  settle(settlement: RunSettlement): void {
    if (this.#settled) return;
    this.#settled = true;
    const { sandbox, lines, cancelSignal } = this.#input;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    if (cancelSignal !== undefined) cancelSignal.removeEventListener("abort", this.#onAbort);
    lines.close();
    if (sandbox.exitCode === null && sandbox.signalCode === null) sandbox.kill();
    this.#resolve(settlement);
  }

  /**
   * 宿主侧故障（沙箱崩溃 / 超时 / 协议损坏）一律 stopped(interrupted)：它不是脚本的错误，
   * 重跑很可能就好，因此带可 resume 的失败编码。run 的裁决归引擎所有，这里只转达。
   */
  #hostFault(message: string, cause?: unknown): void {
    if (this.#settled) return;
    this.#input.workflow.stop(
      "interrupted",
      new WorkflowError("Interrupted", message, cause === undefined ? undefined : { cause }),
    );
  }

  /** abort 是唯一的「真取消」：按 reason 的原词把 initiator 交给引擎。 */
  #onAbort = (): void => {
    if (this.#settled) return;
    const reason: unknown = this.#input.cancelSignal?.reason;
    const supersededBy = readSupersededBy(reason);
    if (supersededBy !== undefined) {
      this.#input.workflow.stop("superseded", undefined, supersededBy);
      return;
    }
    // 宿主主动停下自己拥有的 run（run service 的 close()）不算用户取消：带 Interrupted 失败
    // 编码落库，与超时、沙箱崩溃同一族，可 resume；而 stopped(user) 在界面上读作「用户按了
    // 停止」。错误文本指名 run 与成因，供详情页解释这一行。
    if (reason === HOST_CLOSED) {
      this.#input.workflow.stop(
        "interrupted",
        new WorkflowError(
          "Interrupted",
          `dynamic workflow run ${this.#input.runLabel} was interrupted: the owning session closed before the run settled`,
        ),
      );
      return;
    }
    this.#input.workflow.stop(reason === MODEL_STOP ? "model" : "user");
  };

  #armCancel(signal: AbortSignal | undefined): void {
    if (signal === undefined) return;
    if (signal.aborted) {
      this.#onAbort();
      return;
    }
    signal.addEventListener("abort", this.#onAbort, { once: true });
  }

  #armDeadline(timeoutMs: number | undefined): void {
    if (timeoutMs === undefined) return;
    this.#timer = setTimeout(() => {
      this.#hostFault(
        `The workflow sandbox process exceeded its wall-clock timeout of ${timeoutMs}ms`,
      );
    }, timeoutMs);
    this.#timer.unref?.();
  }

  #watchSandbox(): void {
    const { sandbox } = this.#input;
    sandbox.stderr?.on("data", (chunk: Buffer) => {
      this.#stderr = keepTail(this.#stderr + chunk.toString("utf8"), STDERR_TAIL_BYTES);
    });
    // 子进程退出后仍可能有 response 待写：给 stdin 挂 error 监听，避免 EPIPE 冒成未捕获异常。
    sandbox.stdin?.on("error", () => undefined);
    sandbox.on("error", (error) => {
      this.#hostFault(`Could not start the workflow sandbox process: ${error.message}`, error);
    });
    sandbox.on("close", (code, signalName) => {
      if (this.#settled) return;
      // 无 complete 就退出：崩溃或被杀。有 stderr 就以它归因，否则报退出码与信号。
      const stderr = this.#stderr.trim();
      this.#hostFault(
        stderr.length > 0
          ? stderr
          : `The workflow sandbox process exited (code=${code}, signal=${signalName}) before completing`,
      );
    });
  }

  #watchLines(lines: Interface): void {
    lines.on("line", (line) => {
      const message = parseFrame(line);
      if (message === undefined) return;
      if ("invalid" in message) {
        // 子进程行 JSON 损坏：暴露而不是吞掉。
        this.#hostFault(
          `The workflow sandbox process emitted a line that is not valid NDJSON: ${line}`,
          message.invalid,
        );
        return;
      }
      this.#input.route(message.frame);
    });
  }
}

/** 一行 stdout 的判读结果：空行跳过、坏行带原因、好行带帧。 */
type LineReading = { frame: ChildMessage } | { invalid: unknown } | undefined;

/** 判读一行：空行返回 undefined，解析失败返回原因，成功返回消息帧。 */
function parseFrame(line: string): LineReading {
  if (line.trim().length === 0) return undefined;
  try {
    return { frame: JSON.parse(line) as ChildMessage };
  } catch (cause) {
    return { invalid: cause };
  }
}

/** 保留字符串尾部 limit 字节内的内容（stderr 截断）。 */
function keepTail(value: string, limit: number): string {
  const overflow = Buffer.byteLength(value, "utf8") - limit;
  return overflow > 0 ? value.slice(-overflow) : value;
}

/** abort reason 是 `{ superseded: <runId> }` 时取出后继 id；其余形状返回 undefined。 */
function readSupersededBy(reason: unknown): string | undefined {
  const holder = reason as { superseded?: unknown } | null;
  if (holder === null || typeof holder !== "object") return undefined;
  const successor = holder.superseded;
  if (typeof successor !== "string") return undefined;
  return successor.length > 0 ? successor : undefined;
}
