import { SessionEventType, type SessionEvent } from "./session.events.js";

export const TRANSIENT_SESSION_EVENT_TYPES: ReadonlySet<SessionEventType> = new Set([
  SessionEventType.ModelStreaming,
  SessionEventType.ToolCallProgress,
  SessionEventType.StreamingToolLedgerUpdated,
  SessionEventType.ModelNetworkStatus,
]);

export const SEALED_TURN_TRANSIENT_GRACE_MS = 120_000;

export function isTransientSessionEvent(event: Pick<SessionEvent, "type">): boolean {
  return TRANSIENT_SESSION_EVENT_TYPES.has(event.type);
}

export type SessionEventRetentionMode = "unbounded" | "turn-window";

export interface SessionEventRetentionPolicy {
  onAppend(event: Pick<SessionEvent, "type" | "turnId">, nowMs: number): readonly string[];
  collectExpired(nowMs: number, graceMs: number): readonly string[];
}

interface SealedTurn {
  turnId: string;
  at: number;
  next?: SealedTurn;
}

const NO_EVICTION: readonly string[] = [];

/** 只保存尚未消费的 sealed entries；没有另一个 open-turn 状态来源。 */
class TurnWindowRetention {
  private first?: SealedTurn;
  private last?: SealedTurn;
  private readonly byTurn = new Map<string, SealedTurn>();

  append(event: Pick<SessionEvent, "type" | "turnId">, nowMs: number): readonly string[] {
    const turnId = event.turnId;
    if (!turnId) return NO_EVICTION;
    const type = event.type;

    if (type === SessionEventType.TurnStarted) {
      const obsolete: string[] = [];
      let cursor = this.first;
      while (cursor) {
        if (cursor.turnId !== turnId) obsolete.push(cursor.turnId);
        cursor = cursor.next;
      }
      // 下一 turn 是持久化已完成的边界；重新打开当前 turn 也消费其旧 seal。
      this.first = undefined;
      this.last = undefined;
      this.byTurn.clear();
      return obsolete;
    }

    if (type === SessionEventType.TurnComplete || type === SessionEventType.TurnError) {
      if (!this.byTurn.has(turnId)) {
        const entry: SealedTurn = { turnId, at: nowMs };
        this.byTurn.set(turnId, entry);
        if (this.last) this.last.next = entry;
        else this.first = entry;
        this.last = entry;
      }
    }
    return NO_EVICTION;
  }

  expire(nowMs: number, graceMs: number): readonly string[] {
    const expired: string[] = [];
    let previous: SealedTurn | undefined;
    let cursor = this.first;
    while (cursor) {
      if (nowMs - cursor.at >= graceMs) {
        expired.push(cursor.turnId);
        this.byTurn.delete(cursor.turnId);
        if (previous) previous.next = cursor.next;
        else this.first = cursor.next;
        if (this.last === cursor) this.last = previous;
      } else {
        previous = cursor;
      }
      cursor = cursor.next;
    }
    return expired;
  }
}

export function createSessionEventRetentionPolicy(
  mode: SessionEventRetentionMode,
): SessionEventRetentionPolicy {
  if (mode === "unbounded") {
    return { onAppend: () => NO_EVICTION, collectExpired: () => NO_EVICTION };
  }
  const window = new TurnWindowRetention();
  // 保留普通对象的 own methods；消费者解构方法后调用仍使用同一份私有状态。
  return {
    onAppend: (event, nowMs) => window.append(event, nowMs),
    collectExpired: (nowMs, graceMs) => window.expire(nowMs, graceMs),
  };
}
