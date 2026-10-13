// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 建立过程的形状声明：由 client-lifecycle.ts 原样再导出，公开面不变。
// 字段说明：name/config/generation/timeoutMs/started 是建立标识；stderr 是子进程输出捕获；
// client/transport/signal/workingDirectory 是运行期句柄；两个 DurationMs 记录阶段耗时；
// authorizationAttempted 标记本轮是否已尝试过交互式授权。

import type { Client } from "@modelcontextprotocol/client";
import type { McpServerConfig } from "@knorvia/contracts";
import type { StderrCapture } from "./client-stdio-log.js";
import type { ProtocolTransport } from "./client-state.js";

export interface Establishment {
  name: string;
  config: McpServerConfig;
  generation: number;
  timeoutMs: number;
  started: number;
  connectDurationMs?: number;
  listToolsDurationMs?: number;
  stderr: StderrCapture;
  client?: Client;
  transport?: ProtocolTransport;
  signal?: AbortSignal;
  workingDirectory?: string;
  authorizationAttempted?: boolean;
}
