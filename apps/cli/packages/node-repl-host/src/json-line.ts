// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { addAbortListener } from "node:events";
import type { Socket } from "node:net";

const LINE_FEED = 10;
const EARLY_CLOSE = "Broker closed before returning a response";

/** Incremental decoding keeps the byte budget independent of UTF-16 string length. */
class JsonLine {
  readonly #decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  readonly #limit: number;
  #size = 0;
  #parts: string[] = [];

  constructor(limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new RangeError("Broker frame limit must be a positive safe integer");
    }
    this.#limit = limit;
  }

  accept(chunk: Uint8Array): { value: unknown } | undefined {
    const boundary = chunk.indexOf(LINE_FEED);
    const complete = boundary >= 0;
    const consumed = complete ? boundary + 1 : chunk.byteLength;
    this.#size += consumed;
    if (this.#size > this.#limit) {
      throw new Error(`Broker frame exceeded ${this.#limit} bytes`);
    }
    const text = this.#decoder.decode(complete ? chunk.subarray(0, boundary) : chunk, {
      stream: !complete,
    });
    if (text) this.#parts.push(text);
    if (!complete) return undefined;
    try {
      return { value: JSON.parse(this.#parts.join("")) as unknown };
    } catch {
      // 原生 JSON 异常会引用输入片段；broker 的公开诊断不能带出凭据或请求正文。
      throw new SyntaxError("Broker returned invalid JSON");
    }
  }

  release(): void {
    this.#parts = [];
  }
}

type Completion = { ok: true; value: unknown } | { ok: false; error: unknown };

/** Owns only one read operation; the socket owner remains free to send a reply. */
export async function readFrame(
  socket: Socket,
  limit: number,
  signal: AbortSignal,
): Promise<unknown> {
  const abortReason = () => signal.reason ?? new DOMException("aborted", "AbortError");
  if (signal.aborted) throw abortReason();
  const line = new JsonLine(limit);
  return new Promise((resolve, reject) => {
    let waiting = true;
    let cancellation: ReturnType<typeof addAbortListener> | undefined;
    const finish = (result: Completion) => {
      if (!waiting) return;
      waiting = false;
      cancellation?.[Symbol.dispose]();
      for (const [event, listener] of listeners) socket.off(event, listener);
      line.release();
      if (result.ok) resolve(result.value);
      else reject(result.error);
    };
    const fail = (error: unknown) => finish({ ok: false, error });
    const ended = () => fail(new Error(EARLY_CLOSE));
    const data = (chunk: Buffer) => {
      if (!waiting) return;
      try {
        const result = line.accept(chunk);
        if (result) finish({ ok: true, value: result.value });
      } catch (error) {
        fail(error);
      }
    };
    const listeners = [
      ["data", data],
      ["error", fail],
      ["end", ended],
      ["close", ended],
    ] as const;
    // 取消是资源所有者的控制信号，不能被其他事件观察者截断。
    cancellation = addAbortListener(signal, () => fail(abortReason()));
    for (const [event, listener] of listeners) socket.on(event, listener);
    // close 可能在订阅读取前已经发生；EOF 也不能只靠等待后续 close 才结束。
    if (socket.destroyed || socket.readableEnded) ended();
  });
}
