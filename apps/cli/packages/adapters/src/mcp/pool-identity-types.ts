// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT
// 连接上下文的形状声明：由 pool-identity.ts 原样再导出，公开面不变。
// 字段说明（字段名是契约）：
// mcpConnectionId：连接的唯一 id，用于日志与清理。
// mcpIsolation：隔离粒度，session 或 workspace。
// sessionId：会话级隔离时存在；workspace 级隔离时刻意缺席。
// workspaceKey：workspace 级隔离时的身份键（身份优先，路径兜底）。

export interface McpConnectionContext {
  mcpConnectionId: string;
  mcpIsolation: "session" | "workspace";
  sessionId?: string;
  workspaceKey?: string;
}
