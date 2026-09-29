// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { createHttpClientError } from "@knorvia/contracts";

type Outcome = { ok: true; bytes: Uint8Array } | { ok: false; error: unknown; cancel: boolean };

function requestCancellation(cancel: () => Promise<void>): void {
  try {
    // producer 清理可能永不完成；只观察拒绝，不能让它拖住主结果。
    void Promise.resolve(cancel()).catch(() => {});
  } catch {
    // 同步清理失败也不能替换已经选定的错误。
  }
}

export async function readResponseBody(
  response: Response,
  maxResponseBytes: number,
  signal: AbortSignal,
  url: string,
): Promise<Uint8Array> {
  function error(code: "too_large" | "cancelled", message: string) {
    return createHttpClientError({ code, message, url, status: response.status });
  }

  function rejectSize(message: string): never {
    const primary = error("too_large", message);
    const body = response.body;
    if (body && !body.locked) requestCancellation(() => body.cancel());
    throw primary;
  }

  if (maxResponseBytes < 0) {
    rejectSize("HTTP response size limit must not be negative");
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const declared = Number.parseInt(contentLength, 10);
    if (Number.isFinite(declared) && declared > maxResponseBytes) {
      rejectSize(`HTTP response is too large: content-length=${declared}, max=${maxResponseBytes}`);
    }
  }

  const body = response.body;
  if (!body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxResponseBytes) {
      throw error(
        "too_large",
        `HTTP response is too large: bytes=${bytes.byteLength}, max=${maxResponseBytes}`,
      );
    }
    return bytes;
  }

  // 先取得所有权，保留外部锁的原生失败优先于已取消状态的边界。
  const reader = body.getReader();
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    let settled = false;

    function finish(outcome: Outcome): void {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);

      if (!outcome.ok && outcome.cancel) {
        requestCancellation(() => reader.cancel());
      }
      try {
        reader.releaseLock();
      } catch (releaseError) {
        if (outcome.ok) {
          outcome = { ok: false, error: releaseError, cancel: false };
        }
      }

      if (outcome.ok) resolve(outcome.bytes);
      else reject(outcome.error);
    }

    function onAbort(): void {
      if (settled) return;
      finish({
        ok: false,
        error: error("cancelled", "HTTP request was cancelled while reading response body"),
        cancel: true,
      });
    }

    function onReadFailure(reason: unknown): void {
      finish({ ok: false, error: reason, cancel: false });
    }

    function onRead(result: ReadableStreamReadResult<Uint8Array>): void {
      if (settled) return;
      try {
        if (result.done) {
          const bytes = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          }
          finish({ ok: true, bytes });
          return;
        }

        const chunk = result.value;
        if (chunk) {
          total += chunk.byteLength;
          if (total > maxResponseBytes) {
            finish({
              ok: false,
              error: error("too_large", `HTTP response is too large: bytes>${maxResponseBytes}`),
              cancel: true,
            });
            return;
          }
          chunks.push(chunk);
        }
        readNext();
      } catch (readError) {
        onReadFailure(readError);
      }
    }

    function readNext(): void {
      if (settled) return;
      try {
        // 读失败始终有观察者，包括取消或释放锁之后才交付的落败拒绝。
        void reader.read().then(onRead, onReadFailure);
      } catch (readError) {
        onReadFailure(readError);
      }
    }

    signal.addEventListener("abort", onAbort, { once: true });
    // 等待中的 read 本身不会保证响应 signal，必须独立监听并补查已取消状态。
    if (signal.aborted) onAbort();
    else readNext();
  });
}
