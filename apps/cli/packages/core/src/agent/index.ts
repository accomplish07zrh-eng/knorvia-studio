// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// agent 区的公开桶：回合状态机、消息历史、会话水合与三组类型。
export * from "./turn-state.js";
export * from "./turn-machine.js";
export { MessageHistoryImpl, createMessageHistory } from "./message-history.js";
export {
  activeSessionMessages,
  hydrateMessageHistoryFromSession,
} from "./session-history-hydrator.js";
export type {
  MessageHistory,
  ModelInputMessage,
  ToolCallInput,
  CacheStats,
} from "./message-history.js";
export type { SessionHistoryHydrationResult } from "./session-history-hydrator.js";
