// SPDX-License-Identifier: Apache-2.0

import type { PersistedWorkspaceSessionEntry } from "./protocol.js";

// 产生从起始索引开始、回绕遍历整个列表长度的下标生成器
function* createCircularIndexSequence(
  length: number,
  start: number,
): Generator<number, void, undefined> {
  for (let offset = 0; offset < length; offset += 1) {
    yield (start + offset) % length;
  }
}

// 判定会话记录是否为可支持本地预热的目标类型
function isLocalWorkspaceSession(entry: PersistedWorkspaceSessionEntry | undefined): boolean {
  return entry !== undefined && entry.kind === "local";
}

// 将传入的上次活跃索引安全约束在会话列表下标区间
function clampActiveTabIndex(lastActiveIndex: number | undefined, count: number): number {
  if (lastActiveIndex === undefined || lastActiveIndex < 0) {
    return 0;
  }
  if (lastActiveIndex >= count) {
    return count - 1;
  }
  return lastActiveIndex;
}

// 启动时决策首个可预热的本地会话索引。
// 优先从上次活跃位向后检索，若未命中则自动绕回列表头部继续寻找本地会话。
export function resolveStartupLocalWorkspaceSessionIndex(
  persistedSessions: readonly PersistedWorkspaceSessionEntry[],
  lastActiveTabIndex: number | undefined,
): number | null {
  const sessionCount = persistedSessions.length;
  if (sessionCount === 0) {
    return null;
  }

  const startCursor = clampActiveTabIndex(lastActiveTabIndex, sessionCount);

  for (const idx of createCircularIndexSequence(sessionCount, startCursor)) {
    if (isLocalWorkspaceSession(persistedSessions[idx])) {
      return idx;
    }
  }

  return null;
}
