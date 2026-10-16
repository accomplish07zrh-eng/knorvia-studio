// SPDX-License-Identifier: Apache-2.0

import type { PersistedWorkspaceSessionEntry } from "./protocol.js";

// 会话种类常量定义
const LOCAL_SESSION_KIND = "local" as const;

// 遍历检查指定索引区间的会话列表，发现并返回首个本地会话的下标
function findFirstLocalSessionIndex(
  sessionPool: readonly PersistedWorkspaceSessionEntry[],
  startIndex: number,
  boundaryIndex: number,
): number | null {
  for (let cursor = startIndex; cursor < boundaryIndex; cursor += 1) {
    const item = sessionPool[cursor];
    if (item?.kind === LOCAL_SESSION_KIND) {
      return cursor;
    }
  }
  return /* 该区间内不存在本地会话 */ null;
}

// 根据持久化会话数组与记录的上次活跃索引，定位可作为启动预热目标的本地会话下标
export function resolveStartupLocalWorkspaceSessionIndex(
  /* 已持久化的全部会话快照集合 */
  persistedSessions: readonly PersistedWorkspaceSessionEntry[],
  /* 界面记录的上一个活跃 Tab 下标 */
  lastActiveTabIndex: number | undefined,
): number | null {
  const sessionTotal = persistedSessions.length;
  if (sessionTotal <= 0) {
    return /* 空会话表无可选目标 */ null;
  }

  // 约束起始搜索点至有效下标区间
  const safeBaseIndex = Math.max(0, Math.min(lastActiveTabIndex ?? 0, sessionTotal - 1));

  // 1. 首选阶段：从上次活跃位置向后检索直至列表末尾
  const primaryHit = findFirstLocalSessionIndex(persistedSessions, safeBaseIndex, sessionTotal);
  if (primaryHit !== null) {
    return primaryHit;
  }

  // 2. 备选回绕阶段：远程会话无法在本地预热，从列表首项向前检索至起始点之前
  return findFirstLocalSessionIndex(persistedSessions, 0, safeBaseIndex);
}
