// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createWriteStream, type WriteStream } from "node:fs";
import type { ExecutionStreamResult } from "@knorvia/contracts";
import type { OutputPersistenceMode } from "./execution-adapter-types.js";
import { decodeExecutionOutputBuffer } from "./outputEncoding.js";

export interface AggregatePersistedOutputBudget {
  bytes: number;
  maxBytes: number;
}

export class OutputCollector {
  private readonly chunks: Buffer[] = [];
  private readonly maxPersistedBytes: number;
  private readonly maxInlineBytes: number;
  private readonly maxTailBytes: number;
  private readonly legacyOutputEncoding: string | null;
  private onPersistedLimit?: () => void;
  private readonly outputPath?: string;
  private readonly persistOutput: OutputPersistenceMode;
  private readonly aggregatePersistedBudget?: AggregatePersistedOutputBudget;
  private stream?: WriteStream;
  private artifactBytes = 0;
  private artifactTruncated = false;
  private inlineBytes = 0;
  private persistenceActive = false;
  private persistenceFailed = false;
  private tail = Buffer.alloc(0);
  private totalBytes = 0;
  private truncated = false;

  constructor(options: {
    maxInlineBytes: number;
    maxPersistedBytes: number;
    legacyOutputEncoding: string | null;
    maxTailBytes: number;
    onPersistedLimit?: () => void;
    outputPath?: string;
    persistOutput: OutputPersistenceMode;
    aggregatePersistedBudget?: AggregatePersistedOutputBudget;
  }) {
    this.maxInlineBytes = Math.max(0, options.maxInlineBytes);
    this.maxPersistedBytes = Math.max(0, options.maxPersistedBytes);
    this.legacyOutputEncoding = options.legacyOutputEncoding;
    this.maxTailBytes = Math.max(0, options.maxTailBytes);
    this.onPersistedLimit = options.onPersistedLimit;
    this.outputPath = options.outputPath;
    this.persistOutput = options.persistOutput;
    this.aggregatePersistedBudget = options.aggregatePersistedBudget;
  }

  append(chunk: Buffer, source?: NodeJS.ReadableStream): void {
    if (chunk.length === 0) return;
    const previousTotal = this.totalBytes;
    this.totalBytes += chunk.length;
    this.appendTail(chunk);
    const inlineRemaining = Math.max(0, this.maxInlineBytes - this.inlineBytes);
    const inlinePart = chunk.subarray(0, inlineRemaining);
    if (inlinePart.length > 0) {
      this.chunks.push(Buffer.from(inlinePart));
      this.inlineBytes += inlinePart.length;
    }
    this.truncated = this.totalBytes > this.inlineBytes;

    if (this.persistOutput === "always") {
      this.activatePersistence(false);
      this.writePersisted(chunk, source);
      return;
    }
    if (
      this.persistOutput === "on_truncate" &&
      previousTotal + chunk.length > this.maxInlineBytes
    ) {
      if (!this.persistenceActive) {
        this.activatePersistence(true);
        const prefixBeforeChunk =
          previousTotal < this.maxInlineBytes ? this.chunks.slice(0, -1) : this.chunks;
        for (const prefix of prefixBeforeChunk) this.writePersisted(prefix);
      }
      this.writePersisted(chunk, source);
    }
  }

  async close(): Promise<void> {
    const stream = this.stream;
    if (!stream || stream.closed || stream.destroyed) return;
    await new Promise<void>((resolve) => {
      const done = (): void => resolve();
      stream.once("finish", done);
      stream.once("close", done);
      stream.once("error", done);
      stream.end();
    });
  }

  result(): ExecutionStreamResult {
    const result: ExecutionStreamResult = {
      text: decodeExecutionOutputBuffer(Buffer.concat(this.chunks), this.legacyOutputEncoding),
      bytes: this.totalBytes,
      truncated: this.truncated,
    };
    if (this.stream && this.outputPath) {
      result.artifactPath = this.outputPath;
      result.artifactBytes = this.artifactBytes;
      result.artifactTruncated = this.artifactTruncated;
    }
    return result;
  }

  get bytes(): number {
    return this.totalBytes;
  }

  tailText(): string | undefined {
    return this.tail.length > 0
      ? decodeExecutionOutputBuffer(this.tail, this.legacyOutputEncoding)
      : undefined;
  }

  private appendTail(chunk: Buffer): void {
    if (this.maxTailBytes === 0) return;
    const combined = this.tail.length === 0 ? chunk : Buffer.concat([this.tail, chunk]);
    this.tail = Buffer.from(combined.subarray(Math.max(0, combined.length - this.maxTailBytes)));
  }

  private ensurePersistedStream(): WriteStream | undefined {
    if (this.stream || !this.outputPath) return this.stream;
    try {
      mkdirSync(path.dirname(this.outputPath), { recursive: true, mode: 0o700 });
      const stream = createWriteStream(this.outputPath, { flags: "w", mode: 0o600 });
      stream.on("error", () => {
        this.artifactTruncated = true;
        this.persistenceFailed = true;
      });
      this.stream = stream;
    } catch {
      this.artifactTruncated = true;
      this.persistenceFailed = true;
    }
    return this.stream;
  }

  private activatePersistence(_backfill: boolean): void {
    if (this.persistenceActive) return;
    this.persistenceActive = true;
    this.ensurePersistedStream();
  }

  private writePersisted(chunk: Buffer, source?: NodeJS.ReadableStream): void {
    const stream = this.ensurePersistedStream();
    if (!stream || this.persistenceFailed || chunk.length === 0) return;
    const streamRemaining = Math.max(0, this.maxPersistedBytes - this.artifactBytes);
    const aggregateRemaining = this.aggregatePersistedBudget
      ? Math.max(0, this.aggregatePersistedBudget.maxBytes - this.aggregatePersistedBudget.bytes)
      : Number.POSITIVE_INFINITY;
    const accepted = Math.min(chunk.length, streamRemaining, aggregateRemaining);
    if (accepted > 0) {
      const writable = chunk.subarray(0, accepted);
      this.artifactBytes += accepted;
      if (this.aggregatePersistedBudget) this.aggregatePersistedBudget.bytes += accepted;
      try {
        if (!stream.write(writable) && source?.pause && source.resume) {
          source.pause();
          const resume = (): void => {
            source.resume?.();
          };
          stream.once("drain", resume);
          stream.once("error", () => {
            stream.off("drain", resume);
            resume();
          });
        }
      } catch {
        this.artifactTruncated = true;
        this.persistenceFailed = true;
      }
    }
    if (accepted < chunk.length) {
      this.artifactTruncated = true;
      this.notifyPersistedLimit();
    }
  }

  private notifyPersistedLimit(): void {
    const callback = this.onPersistedLimit;
    if (!callback) return;
    this.onPersistedLimit = undefined;
    callback();
  }
}
