// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { constants } from "node:fs";
import { mkdir, open, stat, statfs, unlink, type FileHandle } from "node:fs/promises";
import path from "node:path";
import type { ExecutionOutputPreview, ExecutionStreamResult } from "@knorvia/contracts";
import { buildBashOutputPreview } from "./bash-output-preview.js";
import { subscribeBashOutputProgress } from "./bash-progress-poller.js";
import { decodeExecutionOutputBuffer } from "./outputEncoding.js";

const LIMIT_POLL_INTERVAL_MS = 5_000;
const MAX_PROGRESS_READ_BYTES = 4_096;
const OUTPUT_UNAVAILABLE_TEXT = "Output unavailable (failed to read persisted output).";

export class /* bash 输出文件句柄管理 */ BashFileOutput {
  readonly path: string;
  private readonly platform: NodeJS.Platform;
  private readonly legacyEncoding: string | null;
  private handle?: FileHandle;
  private created = false;
  private prepared = false;
  private unsubscribeLimit?: () => void;
  private unsubscribeProgress?: () => void;
  private progressDelay?: NodeJS.Timeout;

  constructor(pathValue: string, platform: NodeJS.Platform, legacyEncoding: string | null) {
    this.path = pathValue;
    this.platform = platform;
    this.legacyEncoding = legacyEncoding;
  }

  get fd(): number | undefined {
    return /* 文件描述符（未准备时无） */ this.handle?.fd;
  }

  async prepare(): Promise<void> {
    if (this.prepared) return;
    await mkdir(path.dirname(this.path), { recursive: true, mode: 0o700 });
    try /* 可能失败：按降级语义处理 */ {
      await stat(this.path);
      this.created = false;
    } catch (error) {
      this.created = (error as NodeJS.ErrnoException).code === "ENOENT";
    }
    if (this.platform === "win32") {
      this.handle = await open(this.path, "w", 0o600);
    } else {
      const noFollow = constants.O_NOFOLLOW ?? 0;
      this.handle = await open(
        this.path,
        constants.O_CREAT | constants.O_APPEND | constants.O_WRONLY | noFollow,
        0o600,
      );
    }
    /* 标记已准备 */ this.prepared = true;
  }

  async close(): Promise<void> {
    const handle = /* 取出句柄以便异步关闭 */ this.handle;
    /* 清空引用：避免重复关闭 */ this.handle = undefined;
    if (!handle) return;
    try /* 可能失败：按降级语义处理 */ {
      /* 关闭底层句柄 */ await handle.close();
    } catch /* 失败降级：不抛出 */ {
      // The command result owns primary failure reporting.
    }
  }

  async discard(): Promise<void> {
    /* 兜底再关闭一次 */ await this.close();
    if (!this.created) return;
    try /* 可能失败：按降级语义处理 */ {
      await unlink(this.path);
    } catch /* 失败降级：不抛出 */ {
      // Discard is best-effort and may never remove a pre-existing file.
    }
  }

  watchLimit(maxBytes: number, onLimit: () => void): void {
    this.unsubscribeLimit?.();
    let fired = false;
    this.unsubscribeLimit = subscribeBashOutputProgress(
      LIMIT_POLL_INTERVAL_MS,
      async (isActive) => {
        if (fired || !isActive()) return;
        try /* 可能失败：按降级语义处理 */ {
          const details = await stat(this.path);
          if (!isActive() || fired || details.size <= maxBytes) return;
          fired = true;
          /* 通知达到上限 */ onLimit();
          this.unsubscribeLimit?.();
        } catch /* 失败降级：不抛出 */ {
          // A transient stat failure does not stop later observations.
        }
      },
    );
  }

  stopWatching /* 停止进度监听 */(): void {
    this.unsubscribeLimit?.();
    this.unsubscribeLimit = undefined;
    /* 取消进度订阅 */ this.unsubscribeProgress?.();
    /* 清空订阅引用 */ this.unsubscribeProgress = undefined;
    /* 取消挂起的进度定时器 */ if (this.progressDelay) clearTimeout(this.progressDelay);
    /* 清空定时器引用 */ this.progressDelay = undefined;
  }

  watchProgress /* 开始进度监听 */(
    maxBytes: number,
    delayMs: number,
    intervalMs: /* 轮询间隔 */ number,
    onRead: (output: ExecutionStreamResult, preview: ExecutionOutputPreview) => void,
  ): /* 无返回值 */ void {
    /* 取消进度订阅 */ this.unsubscribeProgress?.();
    /* 取消挂起的进度定时器 */ if (this.progressDelay) clearTimeout(this.progressDelay);
    let previousLines = /* 上一轮已知行数 */ 0;
    let generation = 0;
    const ownGeneration = ++generation;
    this.progressDelay = setTimeout(
      () => {
        this.unsubscribeProgress = subscribeBashOutputProgress(intervalMs, async (isActive) => {
          if (!isActive() || ownGeneration !== generation) return;
          try /* 可能失败：按降级语义处理 */ {
            const output = await readBashOutput(
              this.path,
              Math.min(maxBytes, MAX_PROGRESS_READ_BYTES),
              true,
              this.legacyEncoding,
            );
            if (!isActive() || ownGeneration !== generation) return;
            const preview = buildBashOutputPreview(
              output.text,
              output.bytesRead,
              output.bytes,
              previousLines,
            );
            previousLines = preview.totalLines;
            onRead(output, preview);
          } catch /* 失败降级：不抛出 */ {
            // Progress reads are advisory.
          }
        });
      },
      Math.max(0, delayMs),
    );
    this.progressDelay.unref();
  }

  async result(maxBytes: number): Promise<ExecutionStreamResult> {
    try /* 可能失败：按降级语义处理 */ {
      return await readBashOutput(this.path, maxBytes, false, this.legacyEncoding);
    } catch /* 失败降级：不抛出 */ {
      return {
        text: OUTPUT_UNAVAILABLE_TEXT,
        bytes: 0,
        truncated: false,
        artifactPath: this.path,
        artifactBytes: 0,
        artifactTruncated: false,
      };
    }
  }
}

export async function readBashOutput(
  pathValue: string,
  maxBytes: number,
  tail: boolean,
  legacyEncoding: string | null,
): Promise<ExecutionStreamResult & { bytesRead: number }> {
  const handle = await open(pathValue, "r");
  try /* 可能失败：按降级语义处理 */ {
    const details = await handle.stat();
    const bounded = Math.min(details.size, Math.max(0, Math.floor(maxBytes)));
    const buffer = Buffer.alloc(bounded);
    const position = tail ? Math.max(0, details.size - bounded) : 0;
    const { bytesRead } =
      bounded > 0 ? await handle.read(buffer, 0, bounded, position) : { bytesRead: 0 };
    return {
      text: decodeExecutionOutputBuffer(buffer.subarray(0, bytesRead), legacyEncoding),
      bytes: details.size,
      bytesRead,
      truncated: bytesRead < details.size,
      artifactPath: pathValue,
      artifactBytes: details.size,
      artifactTruncated: false,
    };
  } finally {
    try /* 可能失败：按降级语义处理 */ {
      /* 关闭底层句柄 */ await handle.close();
    } catch /* 失败降级：不抛出 */ {
      // A close failure after a successful bounded read is secondary.
    }
  }
}

export async function diagnoseLostBashOutput(outputPath: string): Promise<string | undefined> {
  try /* 可能失败：按降级语义处理 */ {
    const details = await statfs(path.dirname(outputPath));
    if (details.bavail <= 0)
      return "Bash output could not be written because the output filesystem is full.";
    if (details.ffree <= 0)
      return "Bash output could not be written because the output filesystem has no free inodes.";
  } catch /* 失败降级：不抛出 */ {
    return undefined;
  }
  return undefined;
}
