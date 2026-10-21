// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { Socket } from "node:net";

/** 单帧上限：1 MiB。超限按协议违约处理，不试图部分读取。 */
const MAX_FRAME_BYTES = 1024 * 1024;

/** 换行字节（LF）：帧的分隔符。 */
const FRAME_DELIMITER = 0x0a;

/** 帧超限的固定文案（调用方据此区分「太大」与「不是 JSON」）。 */
const TOO_LARGE = "Node REPL browser broker request exceeded 1 MiB";

/** 帧非法 JSON 的固定文案。原文可能含请求内容，不回显。 */
const NOT_JSON = "Node REPL browser broker request is not valid JSON";

/** 读帧所需的两个外部依赖。 */
interface FrameSource {
  readonly socket: Socket;
  readonly signal: AbortSignal;
}

/**
 * 把套接字的 `data` 事件与中止信号汇成一条**到达顺序**队列。
 *
 * 为什么用队列而不是直接 `on("data")`：数据块到达与中止事件是两条独立来源，
 * 若各自触发回调，就会出现「已结算后又被中止覆盖」的竞态。
 * 汇成一个队列后，消费端只按顺序取，天然只有一个结论。
 */
class ChunkInbox {
  /** 中止标记：与数据块同队列，保证顺序。 */
  static readonly aborted = Symbol("aborted");

  readonly #socket: Socket;
  readonly #signal: AbortSignal;
  readonly #pending: (Buffer | typeof ChunkInbox.aborted)[] = [];
  #resume: (() => void) | undefined;

  constructor(source: FrameSource) {
    this.#socket = source.socket;
    this.#signal = source.signal;
    this.#socket.on("data", this.#onData);
    this.#signal.addEventListener("abort", this.#onAbort, { once: true });
  }

  readonly #onData = (chunk: Buffer): void => {
    this.#deposit(chunk);
  };

  readonly #onAbort = (): void => {
    this.#deposit(ChunkInbox.aborted);
  };

  #deposit(item: Buffer | typeof ChunkInbox.aborted): void {
    this.#pending.push(item);
    const resume = this.#resume;
    this.#resume = undefined;
    resume?.();
  }

  /**
   * 取下一个到达项；中止时抛出信号原因。
   *
   * @returns 数据块；流结束时返回 `undefined`。
   */
  async next(): Promise<Buffer | undefined> {
    while (this.#pending.length === 0) {
      await new Promise<void>((resume) => {
        this.#resume = resume;
      });
    }
    const item = this.#pending.shift();
    if (item === ChunkInbox.aborted) {
      throw this.#signal.reason ?? new DOMException("aborted", "AbortError");
    }
    return item;
  }

  /** 解绑并清空。幂等：重复调用不会出错。 */
  dispose(): void {
    this.#socket.off("data", this.#onData);
    this.#signal.removeEventListener("abort", this.#onAbort);
    this.#pending.length = 0;
    this.#resume = undefined;
  }
}

/**
 * 从 broker 套接字读一个以换行结尾的 JSON 帧。
 *
 * 职责只有一件：**累积字节直到首个换行，然后整帧一次性解码**。
 * 旧接收器逐 chunk 解码，跨 chunk 的中文或表情会被替换成 U+FFFD，
 * 内容会静默损坏 —— 这里在切出完整帧之后才调用 `toString("utf8")`。
 *
 * @param source - 套接字与中止信号。
 * @returns 解析后的帧载荷。
 */
export async function readBrowserBrokerFrame(source: FrameSource): Promise<unknown> {
  // 中止前就已经中止的信号不会有后续事件，先抛，避免永久等待。
  source.signal.throwIfAborted();
  const inbox = new ChunkInbox(source);
  let buffered = 0;
  const collected: Buffer[] = [];
  try {
    for (let chunk = await inbox.next(); chunk !== undefined; chunk = await inbox.next()) {
      const boundary = chunk.indexOf(FRAME_DELIMITER);
      buffered += boundary < 0 ? chunk.length : boundary + 1;
      if (buffered > MAX_FRAME_BYTES) throw new Error(TOO_LARGE);
      if (boundary < 0) {
        collected.push(chunk);
      } else {
        collected.push(chunk.subarray(0, boundary));
        return parseFrame(Buffer.concat(collected));
      }
    }
    // 生成器正常结束只可能发生在套接字关闭且无换行：按「帧不完整」处理。
    throw new Error(NOT_JSON);
  } finally {
    // 无论正常返回、抛错还是被中止，都解绑监听，避免泄漏到下一个请求。
    inbox.dispose();
  }
}

/**
 * 把整帧字节解码成载荷。
 *
 * 单独成函数是为了让「解码失败」这一支与读循环分开：
 * 解析失败时绝不回显原文（可能含凭据或源码）。
 *
 * @param frame - 已切出的完整帧字节。
 * @returns 解析结果。
 */
function parseFrame(frame: Buffer): unknown {
  try {
    return JSON.parse(frame.toString("utf8"));
  } catch {
    throw new Error(NOT_JSON);
  }
}
