// SPDX-License-Identifier: Apache-2.0
// 会话事件保留策略：决定「同一会话里哪些瞬时事件可以随轮次结束被淘汰」。
// 组织方式：瞬时类型是一张常量集合，sealed 轮次用一张保持插入序的 Map 记账，两个模式共用一个工厂。

import { SessionEventType, type SessionEvent } from "./session.events.js";

/** 走完一轮就没有保留价值的瞬时事件类型；历史事件不在此列，只会被落盘吞掉而不会被本策略淘汰。 */
export const TRANSIENT_SESSION_EVENT_TYPES: ReadonlySet<SessionEventType> = new Set([
  SessionEventType.ModelStreaming,
  SessionEventType.ToolCallProgress,
  SessionEventType.StreamingToolLedgerUpdated,
  SessionEventType.ModelNetworkStatus,
]);

/** sealed 轮次的瞬时段宽限期：到期后该轮的瞬时事件可被回收。 */
export const SEALED_TURN_TRANSIENT_GRACE_MS = 120_000;

/** 事件是否属于瞬时类型。 */
export function isTransientSessionEvent(event: Pick<SessionEvent, "type">): boolean {
  return TRANSIENT_SESSION_EVENT_TYPES.has(event.type);
}

export type SessionEventRetentionMode = "unbounded" | "turn-window";

/** 保留策略端口：追加时上报可淘汰轮次，到期时收走已过宽限期的轮次。 */
export interface SessionEventRetentionPolicy {
  onAppend(event: Pick<SessionEvent, "type" | "turnId">, nowMs: number): readonly string[];
  collectExpired(nowMs: number, graceMs: number): readonly string[];
}

/** 没有可淘汰项时的返回值；共用同一个冻结数组，避免每次分配。 */
const NOTHING_EVICTED: readonly string[] = [];

/** turn-window 模式的账本。 内部形状是「turnId → 首次 sealed 时间」的 Map：Map 的**插入序**就是 first-sealed 顺序， 因此淘汰顺序与「谁先结束谁先走」一致，不需要额外维护链表。同一轮重复 sealed 只记第一次的时间。 每个策略实例持有一份私有账本；方法被解构出去调用时仍共用同一份状态。 */
class TurnWindowLedger {
  private readonly sealedAtByTurn = new Map<string, number>();

  /** 记账并返回本次追加后立即可淘汰的轮次。 */
  record(event: Pick<SessionEvent, "type" | "turnId">, nowMs: number): readonly string[] {
    const turnId = event.turnId;
    if (!turnId) return NOTHING_EVICTED;

    if (event.type === SessionEventType.TurnStarted) {
      // 新轮开始意味着上一轮已经持久化完成：清空账本，并把除当前轮以外的旧轮全部交还调用方。
      const obsolete = [...this.sealedAtByTurn.keys()].filter(
        (sealedTurn) => sealedTurn !== turnId,
      );
      this.sealedAtByTurn.clear();
      return obsolete;
    }

    if (event.type === SessionEventType.TurnComplete || event.type === SessionEventType.TurnError) {
      if (!this.sealedAtByTurn.has(turnId)) this.sealedAtByTurn.set(turnId, nowMs);
    }
    return NOTHING_EVICTED;
  }

  /** 收走已过宽限期的轮次：`nowMs - sealedAt >= graceMs` 即到期，先到期的先出现在结果里。 */
  sweep(nowMs: number, graceMs: number): readonly string[] {
    const expired: string[] = [];
    for (const [turnId, sealedAt] of [...this.sealedAtByTurn]) {
      if (nowMs - sealedAt < graceMs) continue;
      expired.push(turnId);
      this.sealedAtByTurn.delete(turnId);
    }
    return expired;
  }
}

/** 建一个保留策略；`unbounded` 恒不淘汰，`turn-window` 按轮次窗口淘汰。 */
export function createSessionEventRetentionPolicy(
  mode: SessionEventRetentionMode,
): SessionEventRetentionPolicy {
  if (mode === "unbounded") {
    return { onAppend: () => NOTHING_EVICTED, collectExpired: () => NOTHING_EVICTED };
  }
  const ledger = new TurnWindowLedger();
  // 返回普通对象而不是实例：消费者解构方法后调用，私有账本仍然只有一份。
  return {
    onAppend: (event, nowMs) => ledger.record(event, nowMs),
    collectExpired: (nowMs, graceMs) => ledger.sweep(nowMs, graceMs),
  };
}
