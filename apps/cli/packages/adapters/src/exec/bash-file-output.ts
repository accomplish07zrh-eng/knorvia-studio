// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { constants } from "node:fs";
import { mkdir, open, stat, statfs, unlink, type FileHandle } from "node:fs/promises";
import path from "node:path";
import type { ExecutionOutputPreview, ExecutionStreamResult } from "@knorvia/contracts";
import { buildBashOutputPreview } from "./bash-output-preview.js";
import { subscribeBashOutputProgress } from "./bash-progress-poller.js";
import { decodeExecutionOutputBuffer } from "./outputEncoding.js";

// 体积轮询节奏、进度尾读窗口，以及产物读不回来时的固定文案。
const SIZE_WATCH_INTERVAL_MS = 5_000;
const PROGRESS_READ_WINDOW_BYTES = 4_096;
const UNREADABLE_OUTPUT_TEXT = "Output unavailable (failed to read persisted output).";

/** 有界读取结果：契约字段之外再带本次实际读到的字节数，供行数外推使用。 */
export type BashRead = ExecutionStreamResult & { bytesRead: number };

/** 每次进度轮次交给上层的两份材料：本轮读到的流式结果与由此得出的预览。 */
export type ProgressFeed = { preview: ExecutionOutputPreview; stream: ExecutionStreamResult };

/**
 * bash 输出落盘句柄的对外形状。内部实现用闭包而非类：
 * 句柄、归属标记与三类取消句柄都在闭包里，外部只能经这些成员驱动。
 */
export interface BashFileOutput {
  readonly path: string;
  /** 打开后取得的描述符；未打开时为 undefined，供 spawn 的 stdio 直接接管。 */
  readonly handleFd: number | undefined;
  /** 是否由本次执行创建（决定丢弃时能否删除文件）。 */
  readonly ownedFile: boolean;
  /** 建目录并按平台打开；重复调用不会重复打开。 */
  openStorage(): Promise<void>;
  /** 释放句柄，不动文件。 */
  releaseHandle(): Promise<void>;
  /** 释放句柄后删除本次创建的文件。 */
  dropOwnedFile(): Promise<void>;
  /** 体积监听：超过上限只回调一次，回调后自行退订。 */
  reportWhenOversized(maxBytes: number, onOversized: () => void): void;
  /** 撤销体积监听、进度订阅与尚未触发的启动定时器。 */
  silenceObservers(): void;
  /** 延迟 delayMs 后按 intervalMs 轮询尾部，把每轮材料交给 onFeed。 */
  feedProgress(maxBytes: number, delayMs: number, intervalMs: number, onFeed: FeedSink): void;
  /** 最终结果：读不回来时给可读文案与零计数，不向上抛。 */
  collect(maxBytes: number): Promise<ExecutionStreamResult>;
}

export type FeedSink = (feed: ProgressFeed) => void;

/** 打开前该路径还不存在，才记为「本次创建」，丢弃时才有权删除。 */
async function absentBeforeOpen(target: string): Promise<boolean> {
  try {
    await stat(target);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

/** win32 独占重写：上一次的残留内容不参与本次输出。 */
function openForRewrite(target: string): Promise<FileHandle> {
  return open(target, "w", 0o600);
}

/** POSIX 追加写，并且拒绝跟随符号链接。 */
function openForAppendNoFollow(target: string): Promise<FileHandle> {
  const flags =
    constants.O_CREAT | constants.O_APPEND | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0);
  return open(target, flags, 0o600);
}

function openForPlatform(target: string, platform: NodeJS.Platform): Promise<FileHandle> {
  return platform === "win32" ? openForRewrite(target) : openForAppendNoFollow(target);
}

export function createBashFileOutput(
  target: string,
  platform: NodeJS.Platform,
  legacyEncoding: string | null,
): BashFileOutput {
  let opened: FileHandle | undefined;
  let owned = false;
  let alreadyOpened = false;
  let cancelOversize: (() => void) | undefined;
  let cancelProgress: (() => void) | undefined;
  let kickoff: NodeJS.Timeout | undefined;

  async function releaseHandle(): Promise<void> {
    const current = opened;
    opened = undefined;
    if (!current) return;
    try {
      await current.close();
    } catch {
      // 命令结果才是主失败通道，关闭失败只记在这里。
    }
  }

  function silenceObservers(): void {
    cancelOversize?.();
    cancelOversize = undefined;
    cancelProgress?.();
    cancelProgress = undefined;
    if (kickoff) clearTimeout(kickoff);
    kickoff = undefined;
  }

  return {
    path: target,

    get handleFd(): number | undefined {
      return opened?.fd;
    },

    get ownedFile(): boolean {
      return owned;
    },

    async openStorage(): Promise<void> {
      if (alreadyOpened) return;
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      owned = await absentBeforeOpen(target);
      opened = await openForPlatform(target, platform);
      alreadyOpened = true;
    },

    releaseHandle,

    async dropOwnedFile(): Promise<void> {
      await releaseHandle();
      if (!owned) return;
      try {
        await unlink(target);
      } catch {
        // 丢弃是尽力而为，权限或竞态都可能让它失败。
      }
    },

    reportWhenOversized(maxBytes: number, onOversized: () => void): void {
      cancelOversize?.();
      let settled = false;
      cancelOversize = subscribeBashOutputProgress(SIZE_WATCH_INTERVAL_MS, async (isActive) => {
        if (settled || !isActive()) return;
        let size: number;
        try {
          size = (await stat(target)).size;
        } catch {
          // 单次 stat 失败不影响后续轮次。
          return;
        }
        if (!isActive() || settled || size <= maxBytes) return;
        settled = true;
        onOversized();
        cancelOversize?.();
      });
    },

    silenceObservers,

    /**
     * 延迟 kickoff 后按 intervalMs 轮询尾部。每次重入都递增代号，
     * 上一代已排队的回调会在代号比较处被丢弃。
     */
    feedProgress(maxBytes: number, delayMs: number, intervalMs: number, onFeed: FeedSink): void {
      cancelProgress?.();
      if (kickoff) clearTimeout(kickoff);
      let seenLines = 0;
      let generation = 0;
      const mine = ++generation;
      kickoff = setTimeout(
        () => {
          cancelProgress = subscribeBashOutputProgress(intervalMs, async (isActive) => {
            if (!isActive() || mine !== generation) return;
            let stream: BashRead;
            try {
              stream = await readBashOutput(
                target,
                Math.min(maxBytes, PROGRESS_READ_WINDOW_BYTES),
                true,
                legacyEncoding,
              );
            } catch {
              // 进度读取只作参考，不影响最终结果。
              return;
            }
            if (!isActive() || mine !== generation) return;
            const preview = buildBashOutputPreview({
              text: stream.text,
              bytesRead: stream.bytesRead,
              totalBytes: stream.bytes,
              previousLines: seenLines,
            });
            seenLines = preview.totalLines;
            onFeed({ preview, stream });
          });
        },
        Math.max(0, delayMs),
      );
      kickoff.unref();
    },

    async collect(maxBytes: number): Promise<ExecutionStreamResult> {
      try {
        return await readBashOutput(target, maxBytes, false, legacyEncoding);
      } catch {
        return {
          text: UNREADABLE_OUTPUT_TEXT,
          bytes: 0,
          truncated: false,
          artifactPath: target,
          artifactBytes: 0,
          artifactTruncated: false,
        };
      }
    },
  };
}

/** 按本次读到的字节组装契约形状，把字段顺序集中在一处。 */
function makeRead(
  bytes: Buffer,
  size: number,
  pathValue: string,
  bytesRead: number,
  legacyEncoding: string | null,
): BashRead {
  const read: BashRead = {} as BashRead;
  read.text = decodeExecutionOutputBuffer(bytes.subarray(0, bytesRead), legacyEncoding);
  read.bytes = size;
  read.bytesRead = bytesRead;
  read.truncated = bytesRead < size;
  read.artifactPath = pathValue;
  read.artifactBytes = size;
  read.artifactTruncated = false;
  return read;
}

/**
 * 有界读取：tail 为真时读末尾，否则读开头。
 * 返回体的 bytes 始终是文件总长，bytesRead 才是本次读到的量。
 */
export async function readBashOutput(
  pathValue: string,
  maxBytes: number,
  tail: boolean,
  legacyEncoding: string | null,
): Promise<BashRead> {
  const source = await open(pathValue, "r");
  try {
    const size = (await source.stat()).size;
    const wanted = Math.min(size, Math.max(0, Math.floor(maxBytes)));
    if (wanted === 0) return makeRead(Buffer.alloc(0), size, pathValue, 0, legacyEncoding);
    const chunk = Buffer.alloc(wanted);
    const offset = tail ? size - wanted : 0;
    const { bytesRead } = await source.read(chunk, 0, wanted, offset);
    return makeRead(chunk, size, pathValue, bytesRead, legacyEncoding);
  } finally {
    try {
      await source.close();
    } catch {
      // 成功读取之后的关闭失败属次要问题。
    }
  }
}

/** 输出丢失时的归因：先看剩余空间，再看 inode，都正常就返回 undefined。 */
export async function diagnoseLostBashOutput(outputPath: string): Promise<string | undefined> {
  const headroom = await readFilesystemHeadroom(path.dirname(outputPath));
  if (headroom.failed) return undefined;
  if (headroom.availableBlocks <= 0)
    return "Bash output could not be written because the output filesystem is full.";
  if (headroom.freeInodes <= 0)
    return "Bash output could not be written because the output filesystem has no free inodes.";
  return undefined;
}

/** 读文件系统余量；读不到时用 failed 标记，与「余量为零」区分开。 */
async function readFilesystemHeadroom(directory: string): Promise<{
  failed: boolean;
  availableBlocks: number;
  freeInodes: number;
}> {
  try {
    const stats = await statfs(directory);
    return { failed: false, availableBlocks: stats.bavail, freeInodes: stats.ffree };
  } catch {
    return { failed: true, availableBlocks: 0, freeInodes: 0 };
  }
}
