// SPDX-License-Identifier: Apache-2.0
// 单会话的事件驻留账本：序号分配、提交事实、按轮淘汰，都由这一个实例串行持有。
// 组织方式：驻留事件存成有序数组（追加即 push），读取只交出数组副本；淘汰按索引过滤重建。

import type { SessionEvent } from "./session.events.js";
import {
  isTransientSessionEvent,
  type SessionEventRetentionPolicy,
} from "./session-event-retention.js";

/** 单个会话的事件统计；字段名只在本包内使用。 */
interface JournalStats {
  events: number;
  evicted: number;
  retainedTransient: number;
}

/** 包内唯一的驻留 owner。 不变式：`highWaterMark` 只增不减——即使某轮瞬时事件被淘汰，序号也绝不回收， 因此重放端永远不会看到「同一个序号指向不同事件」。 */
export class SessionEventJournal {
  private readonly residents: SessionEvent[] = [];
  private evictedCount = 0;
  private highWaterMark = 0;

  constructor(private readonly policy: SessionEventRetentionPolicy) {}

  /** 已分配出去的最大序号；空会话为 0。 */
  get latestSequenceNumber(): number {
    return this.highWaterMark;
  }

  /** 提交一个事件：定序号 → 入账 → 交给保留策略 → 按策略结果淘汰旧轮瞬时事件。 顺序是有意的：事件与序号先落定，之后 policy 或时钟即使抛错也不会回滚已提交的事实， 否则重放端看到的历史会与真实发生过的顺序不一致。`now` 传成函数，保证时钟在入账之后才读。 */
  append(input: SessionEvent, now: () => number): SessionEvent {
    const sequenceNumber = input.sequenceNumber > 0 ? input.sequenceNumber : this.highWaterMark + 1;
    this.highWaterMark = Math.max(this.highWaterMark, sequenceNumber);

    const committed = Object.assign({}, input, { sequenceNumber });
    this.residents.push(committed);

    const staleTurns = this.policy.onAppend(committed, now());
    if (staleTurns.length > 0) this.dropTransientTurns(new Set(staleTurns));
    return committed;
  }

  /** 全量读；返回副本，调用方改动不会影响驻留事实。 */
  read(): SessionEvent[] {
    return this.residents.slice();
  }

  /** 读取序号大于给定值的事件；顺序与追加顺序一致。 */
  readAfter(sequenceNumber: number): SessionEvent[] {
    return this.residents.filter((event) => event.sequenceNumber > sequenceNumber);
  }

  /** 统计驻留条目、累计淘汰条数与当前驻留的瞬时条目数。 */
  stats(): JournalStats {
    return {
      events: this.residents.length,
      evicted: this.evictedCount,
      retainedTransient: this.countResidentTransient(),
    };
  }

  /** 按策略收走已到期轮次的瞬时事件，返回实际移除条目数。 */
  prune(nowMs: number, graceMs: number): number {
    const expiredTurns = this.policy.collectExpired(nowMs, graceMs);
    return expiredTurns.length > 0 ? this.dropTransientTurns(new Set(expiredTurns)) : 0;
  }

  private countResidentTransient(): number {
    let retained = 0;
    for (const event of this.residents) {
      if (isTransientSessionEvent(event)) retained += 1;
    }
    return retained;
  }

  /** 移除指定轮次的瞬时事件，返回移除条目数。 只动瞬时事件：同一轮的历史事件（例如 turn complete 本身）必须留下，否则第 4.1 节的 「sealed 之后才能淘汰」这条边界就形同虚设。 */
  private dropTransientTurns(turnIds: ReadonlySet<string>): number {
    const kept = this.residents.filter((event) => !this.isDroppable(event, turnIds));
    const dropped = this.residents.length - kept.length;
    if (dropped === 0) return 0;
    this.residents.length = 0;
    this.residents.push(...kept);
    this.evictedCount += dropped;
    return dropped;
  }

  private isDroppable(event: SessionEvent, turnIds: ReadonlySet<string>): boolean {
    if (!isTransientSessionEvent(event)) return false;
    return event.turnId !== undefined && turnIds.has(event.turnId);
  }
}
