import type { SessionEvent } from "./session.events.js";
import {
  isTransientSessionEvent,
  type SessionEventRetentionPolicy,
} from "./session-event-retention.js";

interface ResidentEvent {
  event: SessionEvent;
  next?: ResidentEvent;
}

/** 包内驻留 owner；读取只生成数组投影，不暴露或复制链节点。 */
export class SessionEventJournal {
  private first?: ResidentEvent;
  private last?: ResidentEvent;
  private residentCount = 0;
  private discardedCount = 0;
  private sequenceHighWater = 0;

  constructor(private readonly policy: SessionEventRetentionPolicy) {}

  get latestSequenceNumber(): number {
    return this.sequenceHighWater;
  }

  append(input: SessionEvent, now: () => number): SessionEvent {
    const sequenceNumber = input.sequenceNumber > 0
      ? input.sequenceNumber
      : this.sequenceHighWater + 1;
    this.sequenceHighWater = Math.max(this.sequenceHighWater, sequenceNumber);
    const event = { ...input, sequenceNumber };
    const resident: ResidentEvent = { event };
    if (this.last) {
      this.last.next = resident;
    } else {
      this.first = resident;
    }
    this.last = resident;
    this.residentCount += 1;

    // 旧 store 在 policy/时钟失败时已提交事件与序号；不能以异常回滚改变 replay 事实。
    const obsoleteTurns = this.policy.onAppend(event, now());
    if (obsoleteTurns.length > 0) {
      this.removeTransientTurns(new Set(obsoleteTurns));
    }
    return event;
  }

  read(): SessionEvent[] {
    const snapshot: SessionEvent[] = [];
    let cursor = this.first;
    while (cursor) {
      snapshot.push(cursor.event);
      cursor = cursor.next;
    }
    return snapshot;
  }

  readAfter(sequenceNumber: number): SessionEvent[] {
    const snapshot: SessionEvent[] = [];
    let cursor = this.first;
    while (cursor) {
      if (cursor.event.sequenceNumber > sequenceNumber) {
        snapshot.push(cursor.event);
      }
      cursor = cursor.next;
    }
    return snapshot;
  }

  stats(): { events: number; evictedEvents: number; retainedTransient: number } {
    const events = this.residentCount;
    const evictedEvents = this.discardedCount;
    let retainedTransient = 0;
    let cursor = this.first;
    while (cursor) {
      if (isTransientSessionEvent(cursor.event)) retainedTransient += 1;
      cursor = cursor.next;
    }
    return { events, evictedEvents, retainedTransient };
  }

  prune(nowMs: number, graceMs: number): number {
    const expired = this.policy.collectExpired(nowMs, graceMs);
    return expired.length > 0 ? this.removeTransientTurns(new Set(expired)) : 0;
  }

  private removeTransientTurns(turnIds: ReadonlySet<string>): number {
    let previous: ResidentEvent | undefined;
    let cursor = this.first;
    let removed = 0;
    while (cursor) {
      const event = cursor.event;
      if (isTransientSessionEvent(event) && event.turnId && turnIds.has(event.turnId)) {
        if (previous) {
          previous.next = cursor.next;
        } else {
          this.first = cursor.next;
        }
        if (this.last === cursor) this.last = previous;
        this.residentCount -= 1;
        this.discardedCount += 1;
        removed += 1;
      } else {
        previous = cursor;
      }
      cursor = cursor.next;
    }
    return removed;
  }
}
