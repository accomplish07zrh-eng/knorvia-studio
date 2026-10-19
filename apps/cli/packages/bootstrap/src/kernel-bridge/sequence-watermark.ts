// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-01: 会话序号与水位记账（合同 B8–B11）
//
// 职责：
// - 为被投影的源事件与配置变更分配单调连续的 sequence number（从 0 开始）。
// - 严格保障帧区间为 (fromSeq, toSeq]，且 next.fromSeq === prev.toSeq。
// - 维护内存中有界增量日志（retained log），用于 base.seq 在保留窗内的 resume 续传。

import type { ConversationDelta } from "@knorvia/shared/protocol-v4";
import { coalesceConversationDeltas, PROTOCOL_V4_LIMITS } from "@knorvia/shared/protocol-v4";

export interface SequenceRange {
  readonly fromSeq: number;
  readonly toSeq: number;
}

export interface RetainedLogEntry {
  readonly seq: number;
  readonly deltas: readonly ConversationDelta[];
}

export class SequenceWatermark {
  private seq = 0;
  private floor = 0;
  private readonly retainedLog: RetainedLogEntry[] = [];
  private readonly maxRetention: number;

  constructor(
    readonly sessionId: string,
    options?: { readonly retention?: number },
  ) {
    this.maxRetention = options?.retention ?? PROTOCOL_V4_LIMITS.eventRetentionPerSession;
  }

  /** 当前会话最新事件序号水位 */
  get currentSeq(): number {
    return this.seq;
  }

  /** 保留日志下界 */
  get floorSeq(): number {
    return this.floor;
  }

  /**
   * 为下一个被投影的事件或命令原子分配序号区间 (fromSeq, toSeq]。
   * 即使产生 0 delta（如 no-op 配置命令），也必须推进序号。
   */
  allocateNextRange(): SequenceRange {
    const fromSeq = this.seq;
    this.seq += 1;
    return { fromSeq, toSeq: this.seq };
  }

  /**
   * 判定指定客户端 base 水位是否在保留窗内可无损 resume。
   */
  isResumable(baseSeq: number): boolean {
    return Number.isInteger(baseSeq) && baseSeq >= this.floor && baseSeq <= this.seq;
  }

  /**
   * 记录分配序号后的增量，用于后续基于 base.seq 的恢复重放。
   */
  recordDeltas(seq: number, deltas: readonly ConversationDelta[]): void {
    this.retainedLog.push({ seq, deltas });
    while (this.retainedLog.length > this.maxRetention) {
      const evicted = this.retainedLog.shift();
      if (evicted !== undefined) {
        this.floor = evicted.seq;
      }
    }
  }

  /**
   * 获取 (baseSeq, currentSeq] 区间内的所有历史增量并做合并。
   */
  getReplayDeltas(baseSeq: number): ConversationDelta[] {
    const matched = this.retainedLog.filter((entry) => entry.seq > baseSeq);
    const flattened = matched.flatMap((entry) => entry.deltas);
    return coalesceConversationDeltas(flattened);
  }

  /**
   * 重置或显式推进水位（仅用于测试或从存储恢复）。
   */
  advanceTo(newSeq: number): void {
    if (newSeq > this.seq) {
      this.seq = newSeq;
    }
  }
}
