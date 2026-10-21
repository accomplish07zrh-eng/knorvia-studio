// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 执行结果这一层的纯函数集合：状态判定、失败描述、结果装配、事件投递、工件裁剪。
//
// 设计上刻意把「判定」与「构造」分开：
//   - `statusFromExit` / `statusFailure` 只做判定，返回稳定值；
//   - 判定依据集中成表（STOP_REASON_TABLE / STATUS_TABLE），新增停止原因只需加一行，
//     不会出现「某个分支漏了某条原因」的隐性缺口。
// 所有对外函数保持原有签名 —— 它们都被同包其它模块直接 import。

import { truncate, unlink } from "node:fs/promises";
import type {
  ExecutionEvent,
  ExecutionFailure,
  ExecutionResult,
  ExecutionRunOptions,
  ExecutionStatus,
  ExecutionStreamResult,
} from "@knorvia/contracts";
import { diagnoseLostBashOutput, type BashFileOutput } from "./bash-file-output.js";
import type { ExitState, OutputPersistenceMode, StopReason } from "./execution-adapter-types.js";
import { formatTimeoutDuration } from "./execution-utils.js";

/** 一条流式输出：空文本也带正确的字节数。 */
export function emptyStream(text = ""): ExecStream {
  return { text, bytes: Buffer.byteLength(text), truncated: false };
}

/**
 * 停止原因 → 结果状态的对照表。
 * 表里只列「能直接决定状态」的原因；`spawn_error` 优先级最高，单独判。
 */
const STOP_REASON_STATUS: Record<StopReason, ExecutionStatus> = {
  timeout: "timed_out",
  cancelled: "cancelled",
  output_limit: "failed",
};

/** 失败描述的类型取值。 */
type FailureType = ExecutionFailure["type"];

/** 失败描述构造器：接收超时预算，返回失败描述。 */
type FailureBuilder = (timeoutMs: number) => ExecutionFailure;

/** 把「类型 + 文案模板」收成一条失败描述；模板里的 {d} 替换为格式化后的时长。 */
function describeFailure(type: FailureType, template: string): FailureBuilder {
  return (timeoutMs: number) => {
    const failure: ExecutionFailure = {
      type,
      message: template.replaceAll("{d}", formatTimeoutDuration(timeoutMs)),
    };
    return failure;
  };
}

/**
 * 停止原因 → 失败描述的构造器。
 * 缺省（未列出）表示「该原因不算失败」，返回 undefined。
 */
const STOP_REASON_FAILURE: Partial<Record<StopReason, FailureBuilder>> = {
  timeout: describeFailure("timeout", "Command timed out after {d}."),
  cancelled: describeFailure("cancelled", "Command was cancelled."),
  output_limit: describeFailure(
    "output_limit",
    "Execution output exceeded the persisted output limit",
  ),
};

/** 由退出状态与停止原因判定结果状态；生成错误优先于停止原因。 */
export function statusFromExit(exit: Exit, stop: Stop): ExecStatus {
  if (exit.error) return "spawn_error";
  if (stop !== undefined) return STOP_REASON_STATUS[stop] ?? "failed";
  return exit.code === 0 ? "completed" : "failed";
}

/** 由停止原因给出失败描述；未列出的原因不算失败。 */
export function statusFailure(stop: Stop, timeoutMs: number): ExecFailure | undefined {
  if (stop === undefined) return undefined;
  return STOP_REASON_FAILURE[stop]?.(timeoutMs);
}

/** 把任意抛出归一化成失败描述；原错误保留在 cause 上。 */
export function toFailure(type: ExecFailure["type"], error: unknown): ExecFailure {
  const normalized = error instanceof Error ? error : new Error(String(error));
  return { type, message: normalized.message, cause: error };
}

/** 执行结果的短别名：本文件里出现多次。 */
type ExecResult = ExecutionResult;
type ExecStatus = ExecutionStatus;
type ExecFailure = ExecutionFailure;
type ExecStream = ExecutionStreamResult;
type Stop = StopReason | undefined;
type RunOptions = ExecutionRunOptions;
type Exit = ExitState;
type ExecEvent = ExecutionEvent;

/** 输出超限时的约定退出码（137 = 被 SIGKILL 终止）。 */
const OUTPUT_LIMIT_EXIT_CODE = 137;

/** 输出超限的统一文案。 */
const OUTPUT_LIMIT_MESSAGE = "Bash output exceeded the 5GB persisted output limit.";

/** 结果装配入参。 */
/** 必填的三项：状态与两个时刻。 */
type ResultCore = { status: ExecStatus; startedAt: Date; completedAt: Date };

/** 必填的两段输出。 */
type ResultStreams = { stdout: ExecStream; stderr: ExecutionStreamResult };

/** 可选的过程标识：停止原因与进程标识（进程未起来时 pid 缺席）。 */
type ResultProcessExtras = { stopReason?: StopReason; pid?: number };

/** 可选的退出产物：退出码与终止信号。 */
type ResultExitExtras = { exitCode?: number; signal?: string };

/** 可选的失败与目录信息。 */
type ResultDiagnosticExtras = { error?: ExecFailure; resolvedCwd?: string };

/** 结果装配入参：三段合成。 */
type ResultAsk = ResultCore &
  ResultStreams &
  ResultProcessExtras &
  ResultExitExtras &
  ResultDiagnosticExtras;

/** 装配执行结果：耗时取两时刻之差，且不为负（时钟回拨时兜底为 0）。 */
export function createResult(args: ResultAsk): ExecResult {
  const elapsed = args.completedAt.getTime() - args.startedAt.getTime();
  const result = {} as ExecutionResult;
  result.status = args.status;
  result.exitCode = args.exitCode;
  result.signal = args.signal;
  result.stdout = args.stdout;
  result.stderr = args.stderr;
  result.durationMs = Math.max(0, elapsed);
  result.timedOut = args.stopReason === "timeout";
  result.cancelled = args.stopReason === "cancelled";
  result.startedAt = args.startedAt;
  result.completedAt = args.completedAt;
  result.pid = args.pid;
  result.error = args.error;
  result.resolvedCwd = args.resolvedCwd;
  return result;
}

/** 被停止的两个状态（取消 / 超时）。 */
type StoppedStatus = Extract<ExecutionStatus, "cancelled" | "timed_out">;

/** 造一条「被停止」的结果：取消与超时共用一个入口。 */
export function createStoppedResult(
  startedAt: Date,
  status: StoppedStatus,
  message: string,
): ExecResult {
  const timedOut = status === "timed_out";
  const stopReason = timedOut ? "timeout" : "cancelled";

  // 逐字段赋值：字段序与 ResultAsk 的声明序一致（构造出的结果对象键序也是观测契约）。
  const ask = {} as ResultAsk;
  ask.status = status;
  ask.startedAt = startedAt;
  ask.completedAt = new Date();
  ask.stdout = emptyStream();
  ask.stderr = emptyStream();
  ask.stopReason = stopReason;
  ask.error = { type: stopReason, message };
  return createResult(ask);
}

/** 投递一个事件。回调抛错或返回被拒的 Promise 都只当作噪声，不影响结算。 */
export function emit(options: RunOptions, event: ExecEvent): void {
  let pending: unknown;
  try {
    pending = options.onEvent?.(event);
  } catch {
    // 用户回调不拥有执行结算；抛错只吞掉。
    return;
  }
  if (pending) void Promise.resolve(pending).catch(() => undefined);
}

/** 投递最终结果：生成失败走 failed 事件，其余走 completed。 */
export function emitResult(options: RunOptions, result: ExecutionResult): void {
  const at = new Date();
  if (result.status !== "spawn_error") {
    emit(options, { type: "completed", result, timestamp: at });
    return;
  }
  const failure = result.error ?? {
    type: "spawn_error" as const,
    message: "Failed to spawn command.",
  };
  emit(options, { type: "failed", error: failure, timestamp: at });
}

/** 把结果改写成「因输出超限而取消」：137 是被 SIGKILL 终止的约定值。 */
function markOutputLimitCancelled(result: ExecResult): ExecResult {
  const rewritten = { ...result };
  rewritten.status = "cancelled";
  rewritten.exitCode = OUTPUT_LIMIT_EXIT_CODE;
  rewritten.cancelled = true;
  rewritten.error = { type: "output_limit", message: OUTPUT_LIMIT_MESSAGE };
  return rewritten;
}

/** 需要诊断「输出去哪了」的三个前提：零字节、非 137 退出、非输出超限。 */
function needsLostOutputDiagnosis(exit: Exit, stop: Stop): boolean {
  const abnormalExit = typeof exit.code === "number" && exit.code !== 137;
  return abnormalExit && stop !== "output_limit";
}

/** 读 bash 输出；异常退出且零字节时补一次「输出丢失」诊断作为文本。 */
export async function readBashResult(
  src: BashFileOutput,
  inlineCap: number,
  exit: Exit,
  stop: Stop,
): Promise<ExecStream> {
  const output = await src.collect(inlineCap);
  if (output.bytes !== 0) return output;
  if (!needsLostOutputDiagnosis(exit, stop)) return output;

  const diagnosis = await diagnoseLostBashOutput(src.path);
  if (diagnosis) output.text = diagnosis;
  return output;
}

/** 落盘上限被撞到时的结果改写：视为取消 + 137，并给出 output_limit 失败。 */
/**
 * 落盘上限被撞到时的结果改写。
 *
 * 不是「超限」就原样返回；超限则视为「被取消 + 137」并给出 output_limit 失败，
 * 让上层按「取消」而非「失败」处理（避免重试时再次撞上限）。
 */
export function normalizeBashOutputLimitResult(
  result: ExecResult,
  persistedLimitReached: boolean,
): ExecResult {
  if (!persistedLimitReached) return result;
  return markOutputLimitCancelled(result);
}

/** 流式结果里三个「工件」字段的键名（去掉它们即得到内联结果）。 */
const ARTIFACT_KEYS = ["artifactPath", "artifactBytes", "artifactTruncated"] as const;

/** 删掉工件文件并剥掉工件字段；ENOENT 以外的删除失败则原样返回。 */
async function removeArtifact(stream: ExecutionStreamResult): Promise<ExecStream> {
  const artifactPath = stream.artifactPath;
  if (artifactPath !== undefined) {
    try {
      await unlink(artifactPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") return stream;
    }
  }

  const inline = {} as ExecutionStreamResult;
  for (const [key, value] of Object.entries(stream)) {
    if ((ARTIFACT_KEYS as readonly string[]).includes(key)) continue;
    (inline as unknown as Record<string, unknown>)[key] = value;
  }
  return inline;
}

/** 前景执行的工件保留策略：always 恒留；on_truncate 只在被截断时留。 */
export async function applyForegroundArtifactPolicy(
  stream: ExecStream,
  persistOutput: OutputPersistenceMode,
): Promise<ExecStream> {
  const retain =
    persistOutput === "always" || (persistOutput === "on_truncate" && stream.truncated);
  if (retain) return stream;
  return removeArtifact(stream);
}

/** 把工件裁到上限；没工件、没上限或未超上限都原样返回，裁剪失败也原样返回。 */
export async function capArtifactStream(
  stream: ExecStream,
  maxBytes: number | undefined,
): Promise<ExecStream> {
  const artifactPath = stream.artifactPath;
  const cappable = artifactPath !== undefined && maxBytes !== undefined && maxBytes >= 0;
  if (!cappable) return stream;
  if ((stream.artifactBytes ?? 0) <= maxBytes) return stream;

  try {
    await truncate(artifactPath, maxBytes);
    return { ...stream, artifactBytes: maxBytes, artifactTruncated: true };
  } catch {
    // 裁剪失败不影响结果可用性。
    return stream;
  }
}
