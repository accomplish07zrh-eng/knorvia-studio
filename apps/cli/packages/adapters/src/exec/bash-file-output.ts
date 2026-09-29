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

export class BashFileOutput {
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
    return this.handle?.fd;
  }

  async prepare(): Promise<void> {
    if (this.prepared) return;
    await mkdir(path.dirname(this.path), { recursive: true, mode: 0o700 });
    try {
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
    this.prepared = true;
  }

  async close(): Promise<void> {
    const handle = this.handle;
    this.handle = undefined;
    if (!handle) return;
    try {
      await handle.close();
    } catch {
      // The command result owns primary failure reporting.
    }
  }

  async discard(): Promise<void> {
    await this.close();
    if (!this.created) return;
    try {
      await unlink(this.path);
    } catch {
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
        try {
          const details = await stat(this.path);
          if (!isActive() || fired || details.size <= maxBytes) return;
          fired = true;
          onLimit();
          this.unsubscribeLimit?.();
        } catch {
          // A transient stat failure does not stop later observations.
        }
      },
    );
  }

  stopWatching(): void {
    this.unsubscribeLimit?.();
    this.unsubscribeLimit = undefined;
    this.unsubscribeProgress?.();
    this.unsubscribeProgress = undefined;
    if (this.progressDelay) clearTimeout(this.progressDelay);
    this.progressDelay = undefined;
  }

  watchProgress(
    maxBytes: number,
    delayMs: number,
    intervalMs: number,
    onRead: (output: ExecutionStreamResult, preview: ExecutionOutputPreview) => void,
  ): void {
    this.unsubscribeProgress?.();
    if (this.progressDelay) clearTimeout(this.progressDelay);
    let previousLines = 0;
    let generation = 0;
    const ownGeneration = ++generation;
    this.progressDelay = setTimeout(
      () => {
        this.unsubscribeProgress = subscribeBashOutputProgress(intervalMs, async (isActive) => {
          if (!isActive() || ownGeneration !== generation) return;
          try {
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
          } catch {
            // Progress reads are advisory.
          }
        });
      },
      Math.max(0, delayMs),
    );
    this.progressDelay.unref();
  }

  async result(maxBytes: number): Promise<ExecutionStreamResult> {
    try {
      return await readBashOutput(this.path, maxBytes, false, this.legacyEncoding);
    } catch {
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
  try {
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
    try {
      await handle.close();
    } catch {
      // A close failure after a successful bounded read is secondary.
    }
  }
}

export async function diagnoseLostBashOutput(outputPath: string): Promise<string | undefined> {
  try {
    const details = await statfs(path.dirname(outputPath));
    if (details.bavail <= 0)
      return "Bash output could not be written because the output filesystem is full.";
    if (details.ffree <= 0)
      return "Bash output could not be written because the output filesystem has no free inodes.";
  } catch {
    return undefined;
  }
  return undefined;
}
