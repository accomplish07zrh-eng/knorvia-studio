// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { Socket } from "node:net";

const MAX_FRAME_BYTES = 1024 * 1024;

export function readBrowserBrokerFrame(socket: Socket, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let length = 0;
    let done = false;
    const segments: Buffer[] = [];
    const detach = () => {
      socket.off("data", receive);
      socket.off("error", fail);
      signal.removeEventListener("abort", cancel);
      segments.length = 0;
    };
    const fail = (error: unknown) => {
      if (done) return;
      done = true;
      detach();
      reject(error);
    };
    const cancel = () => fail(signal.reason ?? new DOMException("aborted", "AbortError"));
    const receive = (chunk: Buffer) => {
      if (done) return;
      const newline = chunk.indexOf(10);
      const frameBytes = newline < 0 ? chunk.length : newline + 1;
      length += frameBytes;
      if (length > MAX_FRAME_BYTES) {
        fail(new Error("Node REPL browser broker request exceeded 1 MiB"));
        return;
      }
      segments.push(newline < 0 ? chunk : chunk.subarray(0, newline));
      if (newline < 0) return;
      // 旧接收器逐 chunk 解码，会把跨 chunk 的中文/表情字节替换为 U+FFFD。
      const source = Buffer.concat(segments).toString("utf8");
      done = true;
      detach();
      try {
        resolve(JSON.parse(source));
      } catch {
        // JSON.parse 的原始文本可能包含请求内容；诊断不回显凭据或源码。
        reject(new Error("Node REPL browser broker request is not valid JSON"));
      }
    };
    socket.on("data", receive).once("error", fail);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
  });
}
