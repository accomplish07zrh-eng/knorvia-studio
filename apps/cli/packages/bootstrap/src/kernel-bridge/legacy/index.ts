// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy：包内入口（组合根与 entry.ts 唯一的接线面）。
//
// 生命周期：`createLegacyBridge(context)` 在桥启动时建一次，`dispose()` 在桥收尾时调用一次。
// 唯一所有者：会话登记表、workspace 偏好、反向请求登记表都由桥实例持有，
// 不落模块级可变全局（AGENTS.md「没有隐藏的全局状态」）。
//
// 与 entry.ts 的接缝（interface.md §五）：
//   1. `route()` default 分支调用 `routeLegacyMethod(context, method, params)`；
//   2. 桥启动时 `attach()` 交出 stdout 写入口，桥收尾时 `detach()`。
//   3. `handleLine` 里客户端发来的 response 交给 `settleHostRequest`（反向请求应答）。

import { randomUUID } from "node:crypto";
import type { Context } from "@deepseek-ai/cordis";
import { HostRequestBook } from "./host-request-book.js";
import { LegacySessionRegistry } from "./session-registry.js";
import { WorkspacePreferences } from "./workspace.js";
import { routeWithDeps } from "./router.js";
import { domainLoggerOf } from "./logger-adapter.js";
import { createLegacyNotifier, type LegacyNotifier } from "./notifications.js";
import type { LegacyRouterDeps } from "./router-deps.js";
import type { LegacyMethodOutcome } from "./types.js";
import { bindLegacyBridge, unbindLegacyBridge, type LegacyBridgeHandle } from "./types.js";

/** stdout 写入口：桥持有 stdio，本包不直接触碰。 */
export interface LegacyTransportSink {
  write(message: Readonly<Record<string, unknown>>): void;
}

export interface LegacyBridgeOptions {
  readonly logger?: {
    debug(message: string, fields?: Record<string, unknown>): void;
    info(message: string, fields?: Record<string, unknown>): void;
    warn(message: string, fields?: Record<string, unknown>): void;
    error(message: string, fields?: Record<string, unknown>): void;
  };
  readonly newTraceId?: () => string;
}

/** legacy 桥实例：一个 app-server 进程一个。 */
export class LegacyBridge implements LegacyBridgeHandle {
  private readonly sessions = new LegacySessionRegistry();
  private readonly preferences = new WorkspacePreferences();
  private readonly hostRequests = new HostRequestBook();
  private disposed = false;
  private notifier: LegacyNotifier | undefined;
  /** 路由器依赖集合（`routeWithDeps` 与测试直驱用）。 */
  readonly deps: LegacyRouterDeps;

  constructor(
    readonly context: Context,
    options: LegacyBridgeOptions = {},
  ) {
    this.deps = {
      sessions: this.sessions,
      preferences: this.preferences,
      hostRequests: this.hostRequests,
      ...(options.logger !== undefined
        ? { logger: options.logger, domainLogger: domainLoggerOf(options.logger) }
        : {}),
      newTraceId: options.newTraceId ?? (() => randomUUID()),
    };
    bindLegacyBridge(context, this);
  }

  /**
   * 通知发射器接进依赖集合：`attach` 之后处理器才能发 B13 的进度通知。
   *
   * 为什么不在构造函数里定死：通知要写 stdout，而 stdout 由 `runBridge` 在
   * `attach()` 时交出。构造函数期还没有输出面。
   */
  refreshNotifierDeps(): void {
    Object.defineProperty(this.deps, "notify", {
      value: this.notifier,
      configurable: true,
      enumerable: true,
      writable: true,
    });
  }

  /** 桥启动：接上 stdout 与「连接可用」状态。 */
  attach(sink: LegacyTransportSink, connected = true): void {
    this.notifier = createLegacyNotifier({
      write: (message) => sink.write(message),
    });
    this.refreshNotifierDeps();
    this.hostRequests.setChannel({
      connected,
      write: (message) => sink.write(message),
    });
  }

  /** stdin 结束：反向请求全部按「无客户端」失败并清定时器（B11 资源释放）。 */
  detach(): void {
    this.hostRequests.setChannel(undefined);
    this.notifier = undefined;
    this.refreshNotifierDeps();
  }

  /** 通知发射器（B13/B14）；未 attach 时为 undefined（无输出面可写）。 */
  get notifications(): LegacyNotifier | undefined {
    return this.notifier;
  }

  /** 旧协议路由（entry.ts 用 `routeLegacyMethod(context, ...)`，此处供测试直驱）。 */
  route(
    method: string,
    params: unknown,
    trace?: Readonly<Record<string, unknown>>,
  ): Promise<LegacyMethodOutcome | undefined> {
    return routeWithDeps(this.deps, method, params, trace);
  }

  /**
   * 消费客户端发来的一行 response（反向请求的应答）。
   *
   * @returns 是否命中了在途反向请求；未命中 false（晚到应答是无害幂等操作，B12）。
   */
  settleHostRequest(id: string | number, payload: { result?: unknown; error?: unknown }): boolean {
    return this.hostRequests.settleFromClient(String(id), payload);
  }

  /** 当前在途反向请求数（收尾自检与测试用）。 */
  pendingHostRequests(): number {
    return this.hostRequests.pendingCount();
  }

  /** 会话登记表只读句柄（测试与诊断用）。 */
  get sessionRegistry(): LegacySessionRegistry {
    return this.sessions;
  }

  /** 收尾：清空在途反向请求并解绑（幂等）。 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hostRequests.dispose();
    unbindLegacyBridge(this.context, this);
  }
}

/** 建一个 legacy 桥实例并登记到它的 context 上。组合根在桥启动时调用一次。 */
export function createLegacyBridge(
  context: Context,
  options: LegacyBridgeOptions = {},
): LegacyBridge {
  return new LegacyBridge(context, options);
}

export { routeLegacyMethod } from "./router.js";
export { SERVER_NOTIFICATIONS, COMPUTER_USE_OPERATION_EVENT } from "./method-table.js";
export { LEGACY_METHOD_SCHEMAS } from "./contracts.js";
export { registerLegacyExecutionPort, currentLegacyExecutionPort } from "./types.js";
export { capabilityAbsent, LEGACY_ERROR_CODES } from "./errors.js";
export type {
  LegacyBridgeHandle,
  LegacyExecutionPort,
  LegacyExecutionRequest,
  LegacyHostChannel,
  LegacyHostRequestOptions,
  LegacyMethodOutcome,
} from "./types.js";
export type { LegacyRouterDeps } from "./router-deps.js";
