// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-rewind：检查点与回退事件读写。
//
// 契约依据：specs/contracts/kernel-plugin-rewind/{behavior,known-differences}.md B8、K8
//
// **K8 是数据契约兼容（高危项）**：事件类型与 payload 形状必须与旧实现一致，
// 否则旧会话里已有的检查点读不到。
//
// **⚠️ 两个维度必须分清**（核实旧实现后确认）：
//   ① **事件类型**（`SessionEventType`）—— 事件流里的判别字段：
//      `SessionEventType.CheckpointCreated` / `SessionEventType.RewindTriggered`
//   ② **session entry 类型**（`SESSION_ENTRY_*`）—— 持久化副本的入口类型：
//      `SESSION_ENTRY_WORKSPACE_CHECKPOINT` / `SESSION_ENTRY_WORKSPACE_FILE_REWIND`
//
// 旧实现是**双写**：事件流写 `CheckpointCreated`，同时写一条
// `SESSION_ENTRY_WORKSPACE_CHECKPOINT` 的 session entry 作为持久化副本；
// 读取时先按事件流算，再用 entry 补回「事件丢失但 entry 还在」的检查点。
//
// **本模块只处理事件流**（`SessionEventType`）；entry 副本的补回逻辑归
// 组合根或后续的持久化适配层（因为 `SessionEventStorePort` 只暴露事件，不暴露 entry）。
//
// **K8.1 容错行为**：不合格的历史事件**返回 null（跳过）而非抛错** ——
// 这是旧实现的可观测行为；改成抛错会让一条脏数据毁掉整个检查点列表。
//
// **B8 事件即事实**：不在本包内维护「第二份检查点列表」——
// 每次列表都从事件重算，避免「事件与缓存不一致」。

import {
  parseCheckpointCreatedPayload,
  parseRewindTriggeredPayload,
  RewindScope,
  SessionEventType,
  type SessionEvent,
  type SessionEventStorePort,
} from "@knorvia/contracts";

/**
 * 检查点摘要（列表与创建操作的返回）。
 *
 * **⚠️ 字段来源严格对应 `CheckpointCreatedPayload` 的 schema**
 * （`contracts/src/rewind/payload-schemas.ts`）：
 * 它**没有 `paths` 字段** —— 文件内容在 `snapshotRef` 指向的 artifact 里，
 * 由 `parseWorkspaceCheckpointArtifact` 单独解析。
 * 所以摘要只带「引用」与「计数」，不带路径清单。
 */
export interface CheckpointSummary {
  readonly checkpointId: string;
  readonly messageId: string;
  readonly scope: string;
  /** artifact 引用；文件内容在这里。 */
  readonly snapshotRef: string;
  readonly diffRef?: string;
  /** 文件数（schema 里是可选的）。 */
  readonly fileCount?: number;
  readonly createdAt: number;
  readonly coveredByCompact?: boolean;
}

/**
 * 旧实现的事件数据校验形状。
 *
 * **⚠️ 六项类型检查，任一不符返回 null**（K8.1）——
 * 与旧实现的可观测行为一致：跳过脏数据，而不是让整个列表失败。
 */
interface PersistedWorkspaceEventData {
  readonly eventId: string;
  readonly payload: unknown;
  readonly sequenceNumber: number;
  readonly traceId: string;
  readonly turnId?: string;
}

/**
 * 校验一条历史事件的形状。
 *
 * @returns 合格则返回规范化的数据；不合格返回 `null`（**不抛错**，K8.1）
 */
export function validatePersistedEvent(event: SessionEvent): PersistedWorkspaceEventData | null {
  if (event === null || typeof event !== "object") return null;
  if (typeof event.id !== "string" || event.id.length === 0) return null;
  if (typeof event.sequenceNumber !== "number" || !Number.isFinite(event.sequenceNumber)) {
    return null;
  }
  if (typeof event.traceId !== "string" || event.traceId.length === 0) return null;
  if (event.turnId !== undefined && typeof event.turnId !== "string") return null;
  if (!("payload" in event)) return null;
  return {
    eventId: event.id,
    payload: event.payload,
    sequenceNumber: event.sequenceNumber,
    traceId: event.traceId,
    ...(event.turnId === undefined ? {} : { turnId: event.turnId }),
  };
}

/**
 * 从事件里解析出检查点摘要。
 *
 * **不合格的 payload 返回 `null`**（不抛错）—— 由调用方决定是跳过还是报告。
 */
export function parseCheckpointEvent(event: SessionEvent): CheckpointSummary | null {
  const persisted = validatePersistedEvent(event);
  if (persisted === null) return null;
  try {
    const payload = parseCheckpointCreatedPayload(persisted.payload);
    return {
      checkpointId: payload.checkpointId,
      messageId: payload.messageId,
      scope: payload.scope,
      snapshotRef: payload.snapshotRef,
      ...(payload.diffRef === undefined ? {} : { diffRef: payload.diffRef }),
      ...(payload.fileCount === undefined ? {} : { fileCount: payload.fileCount }),
      createdAt: event.timestamp.getTime(),
      ...(payload.coveredByCompact === undefined
        ? {}
        : { coveredByCompact: payload.coveredByCompact }),
    };
  } catch {
    // 解析失败 → 跳过该条（K8.1），不抛错。
    return null;
  }
}

/** 从事件里判断它是否是一条「工作区文件回退」事件（用于过滤）。 */
export function isWorkspaceFileRewindEvent(event: SessionEvent): boolean {
  if (event.type !== SessionEventType.RewindTriggered) return false;
  const persisted = validatePersistedEvent(event);
  if (persisted === null) return false;
  try {
    const payload = parseRewindTriggeredPayload(persisted.payload);
    return payload.scope === RewindScope.Workspace;
  } catch {
    return false;
  }
}

/**
 * 追加一个检查点事件。
 *
 * @param eventStore 事件存储端口
 * @param event 待追加的事件（调用方已构造好信封）
 */
export async function appendCheckpointEvent(
  eventStore: SessionEventStorePort,
  event: SessionEvent,
): Promise<SessionEvent> {
  // 只在类型是检查点事件时允许（避免把回退事件写进检查点通道）。
  if (event.type !== SessionEventType.CheckpointCreated) {
    throw new Error(
      `appendCheckpointEvent: expected event type "${SessionEventType.CheckpointCreated}", got "${String(event.type)}"`,
    );
  }
  return eventStore.append(event);
}

/** 追加一个工作区文件回退事件。 */
export async function appendRewindEvent(
  eventStore: SessionEventStorePort,
  event: SessionEvent,
): Promise<SessionEvent> {
  if (event.type !== SessionEventType.RewindTriggered) {
    throw new Error(
      `appendRewindEvent: expected event type "${SessionEventType.RewindTriggered}", got "${String(event.type)}"`,
    );
  }
  return eventStore.append(event);
}

/**
 * 从事件列表里挑出全部检查点摘要（**跳过不合格条目**，K8.1）。
 *
 * @param events 完整事件列表（`eventStore.getEvents` 的结果）
 * @param limit 最多返回多少条（最新的在前）
 */
export function collectCheckpoints(
  events: readonly SessionEvent[],
  limit?: number,
): readonly CheckpointSummary[] {
  const summaries: CheckpointSummary[] = [];
  for (const event of events) {
    if (event.type !== SessionEventType.CheckpointCreated) continue;
    const summary = parseCheckpointEvent(event);
    // 不合格 → 跳过（K8.1），不让一条脏数据毁掉整个列表。
    if (summary !== null) summaries.push(summary);
  }
  // 按 createdAt 倒序（最新在前），再按 limit 截断。
  summaries.sort((left, right) => right.createdAt - left.createdAt);
  return limit === undefined ? summaries : summaries.slice(0, limit);
}
