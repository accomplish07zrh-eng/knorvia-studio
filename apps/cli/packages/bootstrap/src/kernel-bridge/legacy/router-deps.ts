// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy：路由器依赖面（避免 router.ts 与处理器模块循环 import）。
//
// 依赖方向：handlers → router-deps（纯类型）→ 无出边；router.ts → handlers。
// 这样处理器不需要知道路由器结构，路由器也只持有依赖集合。

import type { Logger } from "@knorvia/contracts";
import type { HostRequestBook } from "./host-request-book.js";
import type { LegacySessionRegistry } from "./session-registry.js";
import type { WorkspacePreferences } from "./workspace.js";
import type { LegacyNotifier } from "./notifications.js";

/** 路由器日志面（与 `KernelLogger` 同形，避免直接依赖 kernel 模块）。 */
export interface LegacyLogger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

/** 路由器依赖：全部由组合根注入，路由器自己不建全局状态。 */
export interface LegacyRouterDeps {
  readonly sessions: LegacySessionRegistry;
  readonly preferences: WorkspacePreferences;
  readonly hostRequests: HostRequestBook;
  readonly logger?: LegacyLogger;
  /** 领域模块（plugins / skills）要的 contracts `Logger`；由 `domainLoggerOf` 适配得出。 */
  readonly domainLogger?: Logger;
  /** CLI→Host 通知发射器（B13/B14）；未 attach 时缺席。 */
  readonly notify?: LegacyNotifier;
  /** 生成新的 traceId（会话创建时用）。 */
  readonly newTraceId: () => string;
}
