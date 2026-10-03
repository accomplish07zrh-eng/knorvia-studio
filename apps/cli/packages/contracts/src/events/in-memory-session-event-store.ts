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
  /** 默认按 turn 驻留；每个 session 独立创建策略，自定义工厂保持原接口。 */
  retention?: SessionEventRetentionMode | (() => SessionEventRetentionPolicy);
  now?: () => number;
}

/** Session 注册表只负责 journal 的创建与删除，事件及序号均由同一 journal 持有。 */
export class InMemorySessionEventStore implements SessionEventStorePort {
  private readonly sessions = new Map<SessionId, SessionEventJournal>();
  private readonly createPolicy: () => SessionEventRetentionPolicy;
  private readonly now: () => number;

  constructor(options: InMemorySessionEventStoreOptions = {}) {
    const retention = options.retention ?? "turn-window";
    this.createPolicy = typeof retention === "function"
      ? retention
      : () => createSessionEventRetentionPolicy(retention);
    this.now = options.now ?? (() => Date.now());
  }

  async append(event: SessionEvent): Promise<SessionEvent> {
    const sessionId = event.sessionId;
    let journal = this.sessions.get(sessionId);
    if (journal === undefined) {
      journal = new SessionEventJournal(this.createPolicy());
      this.sessions.set(sessionId, journal);
    }
    // 时钟仍通过 store 调用，保留自定义函数 receiver 与驻留后才读时钟的边界。
    return journal.append(event, () => this.now());
  }

  async getEvents(sessionId: SessionId): Promise<SessionEvent[]> {
    return this.sessions.get(sessionId)?.read() ?? [];
  }

  async getEventsAfter(sessionId: SessionId, sequenceNumber: number): Promise<SessionEvent[]> {
    return this.sessions.get(sessionId)?.readAfter(sequenceNumber) ?? [];
  }

  async getLatestSequenceNumber(sessionId: SessionId): Promise<number> {
    return this.sessions.get(sessionId)?.latestSequenceNumber ?? 0;
  }

  async deleteSession(sessionId: SessionId): Promise<void> {
    this.sessions.delete(sessionId);
  }

  getStats(): SessionEventStoreStats {
    let events = 0;
    let evictedEvents = 0;
    let retainedTransient = 0;
    for (const journal of this.sessions.values()) {
      const current = journal.stats();
      events += current.events;
      evictedEvents += current.evictedEvents;
      retainedTransient += current.retainedTransient;
    }
    return { sessions: this.sessions.size, events, evictedEvents, retainedTransient };
  }

  pruneTransientEvents(
    nowMs: number = this.now(),
    graceMs: number = SEALED_TURN_TRANSIENT_GRACE_MS,
  ): number {
    let removed = 0;
    for (const journal of this.sessions.values()) {
      removed += journal.prune(nowMs, graceMs);
    }
    return removed;
  }
}

export function createInMemorySessionEventStore(
  options?: InMemorySessionEventStoreOptions,
): InMemorySessionEventStore {
  return new InMemorySessionEventStore(options);
}
