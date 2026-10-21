// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 输出收集器：把子进程的输出分两路处理 —— **内联回显**（有上限）与**落盘工件**（可裁剪）。
//
// 数据结构上刻意把「易变状态」收成三个内聚对象，而不是十几个并列字段：
//   - `tail`    尾部预览的累积缓冲；
//   - `inline`  内联回显的段与字节数；
//   - `artifact` 落盘工件（流、字节数、是否截断、是否失败）。
// 这样做的好处是每个子系统的读写都集中在一处，不容易出现「某个字段忘了同步」。
//
// 落盘的三条边界：
// 一、**两道上限**：单文件上限（maxPersistedBytes）与跨任务聚合预算，取两者较小值；
// 二、**背压**：write 返回 false 时暂停来源，等 drain 或 error 再恢复；
// 三、**失败只标记不抛**：流建立或写入失败一律记为 artifactTruncated + persistenceFailed。

import { mkdirSync } from "node:fs";
import path from "node:path";
import { createWriteStream, type WriteStream } from "node:fs";
import type { ExecutionStreamResult } from "@knorvia/contracts";
import type { OutputPersistenceMode } from "./execution-adapter-types.js";
import { decodeExecutionOutputBuffer } from "./outputEncoding.js";

/** 跨任务共享的落盘预算。 */
/**
 * 背压：write 返回 false 时暂停来源，等 drain 或 error 后恢复。
 *
 * 两种「恢复」都要摘掉 drain 监听 —— 否则一条 error 之后 drain 还会再触发一次 resume。
 */
function holdUntilDrained(stream: WriteStream, source: NodeJS.ReadableStream | undefined): void {
  if (source?.pause === undefined) return;

  source.pause();
  const resume = (): void => {
    stream.off("drain", resume);
    source.resume?.();
  };
  stream.once("drain", resume);
  stream.once("error", resume);
}

export type AggregatePersistedOutputBudget = {
  /** 已累计写入的字节。 */
  bytes: number;
  /** 预算上限。 */
  maxBytes: number;
};

/** 尾部预览的累积缓冲。 */
type TailBuffer = { data: Buffer };

/** 内联回显状态：已收集的段与累计字节。 */
type InlineState = { chunks: Buffer[]; bytes: number };

/** 落盘工件状态。 */
type ArtifactState = {
  stream?: WriteStream;
  bytes: number;
  truncated: boolean;
  failed: boolean;
  active: boolean;
};

/** 构造收集器所需的全部限制与回调。 */
/** 三个字节上限：内联回显、单文件落盘、尾部预览。 */
type CollectorCaps = { maxInlineBytes: number; maxPersistedBytes: number; maxTailBytes: number };

/** 落盘去向与模式：遗留编码、路径（缺席则不落盘）、模式、跨任务聚合预算。 */
type CollectorEncoding = { legacyOutputEncoding: string | null };

type CollectorDestination = {
  outputPath?: string;
  persistOutput: OutputPersistenceMode;
};

type CollectorBudget = { aggregatePersistedBudget?: AggregatePersistedOutputBudget };

type CollectorSink = CollectorEncoding & CollectorDestination & CollectorBudget;

/** 达到落盘上限时的回调。 */
type CollectorHooks = { onPersistedLimit?: () => void };

/** 构造收集器所需的全部限制与回调。 */
type CollectorLimits = CollectorCaps & CollectorSink & CollectorHooks;

/** 非负化：所有上限都按「不小于 0」处理，避免负值参与比较。 */
const clampZero = (value: number): number => Math.max(0, value);

export class OutputCollector {
  readonly #inline: InlineState = { chunks: [], bytes: 0 };
  readonly #artifact: ArtifactState = { bytes: 0, truncated: false, failed: false, active: false };
  readonly #tail: TailBuffer = { data: Buffer.alloc(0) };
  readonly #limits: CollectorLimits;
  #onPersistedLimit?: () => void;
  #totalBytes = 0;
  #truncated = false;

  constructor(limits: CollectorLimits) {
    this.#limits = {
      maxInlineBytes: clampZero(limits.maxInlineBytes),
      maxPersistedBytes: clampZero(limits.maxPersistedBytes),
      legacyOutputEncoding: limits.legacyOutputEncoding,
      maxTailBytes: clampZero(limits.maxTailBytes),
      persistOutput: limits.persistOutput,
      ...(limits.onPersistedLimit === undefined
        ? {}
        : { onPersistedLimit: limits.onPersistedLimit }),
      ...(limits.outputPath === undefined ? {} : { outputPath: limits.outputPath }),
      ...(limits.aggregatePersistedBudget === undefined
        ? {}
        : { aggregatePersistedBudget: limits.aggregatePersistedBudget }),
    };
    this.#onPersistedLimit = limits.onPersistedLimit;
  }

  /** 追加一段输出：先更新总量与尾部，再决定内联与落盘各拿多少。 */
  append(chunk: Buffer, source?: NodeJS.ReadableStream): void {
    if (chunk.length === 0) return;
    const previousTotal = this.#totalBytes;
    this.#totalBytes += chunk.length;
    this.#accumulateTail(chunk);
    this.#takeInline(chunk);
    this.#truncated = this.#totalBytes > this.#inline.bytes;
    this.#route(chunk, previousTotal, source);
  }

  /** 按持久化模式分流：always 直接写；on_truncate 等到首次超限才开流并回填前缀。 */
  #route(chunk: Buffer, previousTotal: number, source?: NodeJS.ReadableStream): void {
    const mode = this.#limits.persistOutput;
    if (mode === "always") {
      this.#activatePersistence();
      this.#write(chunk, source);
      return;
    }
    if (mode !== "on_truncate") return;
    if (previousTotal + chunk.length <= this.#limits.maxInlineBytes) return;

    if (!this.#artifact.active) {
      this.#activatePersistence();
      const prefix =
        previousTotal < this.#limits.maxInlineBytes
          ? this.#inline.chunks.slice(0, -1)
          : this.#inline.chunks;
      for (const segment of prefix) this.#write(segment);
    }
    this.#write(chunk, source);
  }

  /** 只保留内联上限内的字节。 */
  #takeInline(chunk: Buffer): void {
    const remaining = clampZero(this.#limits.maxInlineBytes - this.#inline.bytes);
    const accepted = chunk.subarray(0, remaining);
    if (accepted.length === 0) return;
    this.#inline.chunks.push(Buffer.from(accepted));
    this.#inline.bytes += accepted.length;
  }

  /** 尾部预览只留最近 maxTailBytes 个字节。 */
  #accumulateTail(chunk: Buffer): void {
    const limit = this.#limits.maxTailBytes;
    if (limit === 0) return;
    const merged = this.#tail.data.length === 0 ? chunk : Buffer.concat([this.#tail.data, chunk]);
    this.#tail.data = Buffer.from(merged.subarray(Math.max(0, merged.length - limit)));
  }

  async close(): Promise<void> {
    const stream = this.#artifact.stream;
    if (!stream || stream.closed || stream.destroyed) return;
    await new Promise<void>((resolve) => {
      const settle = (): void => resolve();
      stream.once("finish", settle);
      stream.once("close", settle);
      stream.once("error", settle);
      stream.end();
    });
  }

  /** 汇总当前收集到的内容。 */
  result(): ExecutionStreamResult {
    const text = decodeExecutionOutputBuffer(
      Buffer.concat(this.#inline.chunks),
      this.#limits.legacyOutputEncoding,
    );
    const summary: ExecutionStreamResult = {
      text,
      bytes: this.#totalBytes,
      truncated: this.#truncated,
    };
    const outputPath = this.#limits.outputPath;
    if (this.#artifact.stream !== undefined && outputPath !== undefined) {
      summary.artifactPath = outputPath;
      summary.artifactBytes = this.#artifact.bytes;
      summary.artifactTruncated = this.#artifact.truncated;
    }
    return summary;
  }

  get bytes(): number {
    return this.#totalBytes;
  }

  /** 尾部预览文本；没有尾部内容时返回 undefined。 */
  tailText(): string | undefined {
    if (this.#tail.data.length === 0) return undefined;
    return decodeExecutionOutputBuffer(this.#tail.data, this.#limits.legacyOutputEncoding);
  }

  /** 建立落盘流；失败只标记，不抛出。 */
  #ensureStream(): WriteStream | undefined {
    if (this.#artifact.stream !== undefined) return this.#artifact.stream;
    const outputPath = this.#limits.outputPath;
    if (outputPath === undefined) return undefined;
    try {
      mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
      const stream = createWriteStream(outputPath, { flags: "w", mode: 0o600 });
      stream.on("error", () => {
        this.#artifact.truncated = true;
        this.#artifact.failed = true;
      });
      this.#artifact.stream = stream;
    } catch {
      this.#artifact.truncated = true;
      this.#artifact.failed = true;
    }
    return this.#artifact.stream;
  }

  /** 激活落盘（幂等）。 */
  #activatePersistence(): void {
    if (this.#artifact.active) return;
    this.#artifact.active = true;
    this.#ensureStream();
  }

  /** 本次还能落盘多少字节：单文件剩余与聚合预算剩余取小。 */
  #writableAllowance(): number {
    const fileRemaining = clampZero(this.#limits.maxPersistedBytes - this.#artifact.bytes);
    const budget = this.#limits.aggregatePersistedBudget;
    if (budget === undefined) return fileRemaining;
    return Math.min(fileRemaining, clampZero(budget.maxBytes - budget.bytes));
  }

  /** 写一段到落盘流，按额度裁剪并处理背压。 */
  #write(chunk: Buffer, source?: NodeJS.ReadableStream): void {
    const stream = this.#ensureStream();
    if (stream === undefined || this.#artifact.failed || chunk.length === 0) return;

    const accepted = Math.min(chunk.length, this.#writableAllowance());
    if (accepted > 0) {
      this.#artifact.bytes += accepted;
      const budget = this.#limits.aggregatePersistedBudget;
      if (budget !== undefined) budget.bytes += accepted;
      this.#push(stream, chunk.subarray(0, accepted), source);
    }
    if (accepted >= chunk.length) return;
    this.#artifact.truncated = true;
    this.#notifyLimit();
  }

  /** 写入并处理背压。 */
  #push(stream: WriteStream, slice: Buffer, source?: NodeJS.ReadableStream): void {
    try {
      if (!stream.write(slice)) holdUntilDrained(stream, source);
    } catch {
      this.#artifact.truncated = true;
      this.#artifact.failed = true;
    }
  }

  /** 落盘上限回调只触发一次。 */
  #notifyLimit(): void {
    const callback = this.#onPersistedLimit;
    if (callback === undefined) return;
    this.#onPersistedLimit = undefined;
    callback();
  }
}
