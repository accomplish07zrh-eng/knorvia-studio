// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-rewind：检查点列表、artifact 读取与恢复。
//
// 契约依据：specs/contracts/kernel-plugin-rewind/{behavior,interface}.md B8、§三.5
//
// **B8 事件即事实**：列表每次从事件重算，本模块**不持有缓存**。
// **只读路径**（list / loadArtifact）：绝不写任何东西。
//
// **⚠️ 检查点的文件内容在 artifact 里**（不是 payload 顶层字段）——
// 所以「列出检查点」只需事件，「读文件清单」要再解析 payload 里的 `artifact`。

import {
  createSessionId,
  parseWorkspaceCheckpointArtifact,
  type SessionEvent,
  type SessionEventStorePort,
} from "@knorvia/contracts";
import { collectCheckpoints, type CheckpointSummary } from "./checkpoint-events.js";
import type { CheckpointFileEntry } from "./file-rewind-plan.js";

/**
 * 列出某个会话的检查点（最新在前）。
 *
 * `sessionId` 是品牌类型 `SessionId`；字符串入参用 `createSessionId` 转换。
 *
 * @param eventStore 事件存储端口
 * @param sessionId 会话标识（字符串会被规范化为 `SessionId`）
 * @param limit 最多返回多少条
 */
export async function listCheckpoints(
  eventStore: SessionEventStorePort,
  sessionId: string,
  limit?: number,
): Promise<readonly CheckpointSummary[]> {
  const events = await eventStore.getEvents(createSessionId(sessionId));
  return collectCheckpoints(events, limit);
}

/**
 * 从检查点事件里解析出文件清单（供回退计划使用）。
 *
 * **⚠️ 两个数据契约细节**：
 * 1. `CheckpointCreatedPayload` 只带 `snapshotRef` 引用、不带文件内容，
 *    所以文件清单来自 payload 里的内联 `artifact` 字段；
 * 2. artifact 的字段名是 **`existedBefore` / `beforeContent`**（不是 `content`）——
 *    语义是「变更**之前**的状态」，正是回退要恢复的目标。
 *
 * 若 payload 里没有可解析的 artifact（历史数据形状不同），返回 `null` 而不是抛错（K8.1）。
 *
 * @param event 检查点事件
 */
export function loadCheckpointFiles(event: SessionEvent): readonly CheckpointFileEntry[] | null {
  if (event === null || typeof event !== "object") return null;
  if (!("payload" in event)) return null;
  const payload = event.payload;
  if (payload === null || typeof payload !== "object") return null;
  const artifact = (payload as Record<string, unknown>).artifact;
  if (artifact === undefined) return null;
  try {
    const parsed = parseWorkspaceCheckpointArtifact(artifact);
    return parsed.files.map((file) => ({
      path: file.path,
      // 「变更前的内容」就是回退目标；`existedBefore: false` 表示当时不存在。
      content: file.existedBefore ? (file.beforeContent ?? null) : null,
    }));
  } catch {
    // 解析失败 → 跳过（K8.1）。
    return null;
  }
}

/**
 * 找「指定检查点」的检查点事件。
 *
 * @returns 找到则返回事件；找不到返回 `undefined`
 */
export function findCheckpointEvent(
  events: readonly SessionEvent[],
  checkpointId: string,
): SessionEvent | undefined {
  for (const event of events) {
    if (event === null || typeof event !== "object") continue;
    if (!("payload" in event)) continue;
    const payload = event.payload;
    if (payload === null || typeof payload !== "object") continue;
    if ((payload as Record<string, unknown>).checkpointId === checkpointId) return event;
  }
  return undefined;
}
