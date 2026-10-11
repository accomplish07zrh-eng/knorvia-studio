// SPDX-License-Identifier: Apache-2.0
// 内存事件存储：给运行时用的对照实现与测试替身。
// 组织方式：store 只做 session → journal 的注册表，事件、序号、统计全部下沉到 journal。

import type { SessionEventStorePort, SessionEventStoreStats } from "../interfaces/session.port.js";
import type { SessionId } from "../interfaces/shared.js";
import type { SessionEvent } from "./session.events.js";
import { SessionEventJournal } from "./session-event-journal.js";
import {
  createSessionEventRetentionPolicy,
  SEALED_TURN_TRANSIENT_GRACE_MS,
  type SessionEventRetentionMode,
  type SessionEventRetentionPolicy,
} from "./session-event-retention.js";

export interface InMemorySessionEventStoreOptions {
  /** 保留模式，或每个 session 各建一个策略的工厂；缺省按轮次驻留。 */
  retention?: SessionEventRetentionMode | (() => SessionEventRetentionPolicy);
  /** 时钟注入点；缺省用 `Date.now`。淘汰判定与时间戳都取这里。 */
  now?: () => number;
}

/** 内存实现：一个 session 一个 journal，注册表只负责创建与删除。 */
export class InMemorySessionEventStore implements SessionEventStorePort {
  private readonly journals = new Map<SessionId, SessionEventJournal>();
  private readonly createRetentionPolicy: () => SessionEventRetentionPolicy;
  private readonly now: () => number;

  constructor(options: InMemorySessionEventStoreOptions = {}) {
    const retention = options.retention ?? "turn-window";
    this.createRetentionPolicy =
      typeof retention === "function"
        ? retention
        : () => createSessionEventRetentionPolicy(retention);
    this.now = options.now ?? (() => Date.now());
  }

  async append(event: SessionEvent): Promise<SessionEvent> {
    const journal = this.ensureJournal(event.sessionId);
    // 时钟以闭包形式交给 journal：这样「入账之后才读时间」这条边界不会因为参数求值顺序被打乱。
    return journal.append(event, () => this.now());
  }

  async getEvents(sessionId: SessionId): Promise<SessionEvent[]> {
    return this.journalFor(sessionId)?.read() ?? [];
  }

  async getEventsAfter(sessionId: SessionId, sequenceNumber: number): Promise<SessionEvent[]> {
    return this.journalFor(sessionId)?.readAfter(sequenceNumber) ?? [];
  }

  async getLatestSequenceNumber(sessionId: SessionId): Promise<number> {
    return this.journalFor(sessionId)?.latestSequenceNumber ?? 0;
  }

  async deleteSession(sessionId: SessionId): Promise<void> {
    this.journals.delete(sessionId);
  }

  /** 汇总各 journal 的统计；无 session 时全为 0。逐字段累加，避免把可选统计字段当必填。 */
  getStats(): SessionEventStoreStats {
    const totals = {
      sessions: this.journals.size,
      events: 0,
      evictedEvents: 0,
      retainedTransient: 0,
    };
    for (const journal of this.journals.values()) {
      const current = journal.stats();
      totals.events += current.events;
      totals.evictedEvents += current.evictedEvents;
      totals.retainedTransient += current.retainedTransient;
    }
    return totals;
  }

  /** 收走所有 session 里已到期轮次的瞬时事件，返回移除总数。 */
  pruneTransientEvents(
    nowMs: number = this.now(),
    graceMs: number = SEALED_TURN_TRANSIENT_GRACE_MS,
  ): number {
    let removed = 0;
    for (const journal of this.journals.values()) removed += journal.prune(nowMs, graceMs);
    return removed;
  }

  /** 读路径：取不到就返回 undefined，绝不为读操作凭空造出 session。 */
  private journalFor(sessionId: SessionId): SessionEventJournal | undefined {
    return this.journals.get(sessionId);
  }

  /** 写路径：首次追加时才创建 journal，并用注入的工厂建它的保留策略。 */
  private ensureJournal(sessionId: SessionId): SessionEventJournal {
    const existing = this.journals.get(sessionId);
    if (existing !== undefined) return existing;
    const created = new SessionEventJournal(this.createRetentionPolicy());
    this.journals.set(sessionId, created);
    return created;
  }
}

export function createInMemorySessionEventStore(
  options?: InMemorySessionEventStoreOptions,
): InMemorySessionEventStore {
  return new InMemorySessionEventStore(options);
}
