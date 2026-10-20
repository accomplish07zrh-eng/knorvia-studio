// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy：包内注册面（合同 interface.md §四 冻结）。
//
// 冻结的导出（名字与签名不得改动）：
//   LegacyMethodOutcome / LegacyExecutionRequest / LegacyExecutionPort
//   registerLegacyExecutionPort(port) => 解绑函数
//   LegacyHostRequestOptions / LegacyHostChannel
//
// 依赖方向固定：kernel-bridge-02/03 → 本包（注册函数），本包不得反向 import。

import type { Context } from "@deepseek-ai/cordis";

/** 旧协议方法的执行结果：result 或既有协议错误。 */
export type LegacyMethodOutcome =
  | { readonly kind: "result"; readonly result: unknown }
  | {
      readonly kind: "error";
      /** 既有错误码族；不得新增。 */
      readonly code: number;
      readonly message: string;
      readonly data?: unknown;
    };

/** 执行端口收到的请求（参数已通过共享 schema 校验）。 */
export interface LegacyExecutionRequest {
  readonly method: string;
  readonly params: unknown;
  /** 调用方 trace（客户端 request.trace 原样透传）。 */
  readonly trace?: Readonly<Record<string, unknown>>;
}

/**
 * 回合类方法的执行端口。由 kernel-bridge-02/03 在组合根注册。
 * 未注册时由本包按 capability 缺席语义返回（behavior B10）。
 */
export interface LegacyExecutionPort {
  /**
   * 执行一个回合类方法。抛错表示内部失败（桥折叠为 -32603），
   * 返回 {kind:"error"} 表示业务错误（桥原样透传）。
   */
  execute(request: LegacyExecutionRequest): Promise<LegacyMethodOutcome>;
}

/** 反向请求选项：signal / 超时 / 重发现，语义与旧运行时一致。 */
export interface LegacyHostRequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly reannounceIntervalMs?: number;
  readonly trace?: Readonly<Record<string, unknown>>;
}

/** 反向请求通道：向 Host 发起反向 request / 发送 CLI→Host 通知。 */
export interface LegacyHostChannel {
  request<T>(
    method: string,
    params: unknown,
    resultSchema: { parse(value: unknown): T },
    options?: LegacyHostRequestOptions,
  ): Promise<T>;
  notify(method: string, params: unknown, trace?: Readonly<Record<string, unknown>>): void;
}

/**
 * 执行端口唯一所有者：模块级单例。
 *
 * 为什么模块级而不是 Context 上：interface.md §四 把 `registerLegacyExecutionPort`
 * 冻结成无 context 参数的函数（02/03 在组合根调用），因此登记处只能是模块级。
 * 组合根在一个进程内只建一个桥，与「每个进程只启动一个 DSH host」同一条约束。
 */
let ownedPort: LegacyExecutionPort | undefined;

/**
 * 注册执行端口；返回解绑函数。重复注册抛错（唯一所有者）。
 * 端口注册是启动期一次动作，运行期不动态增删（interface.md §四 注册面约束）。
 */
export function registerLegacyExecutionPort(port: LegacyExecutionPort): () => void {
  if (ownedPort !== undefined && ownedPort !== port) {
    throw new Error("kernel-bridge-legacy: execution port is already registered");
  }
  ownedPort = port;
  return () => {
    if (ownedPort === port) ownedPort = undefined;
  };
}

/** 当前执行端口；未注册时 undefined（B10 走 capability 缺席）。 */
export function currentLegacyExecutionPort(): LegacyExecutionPort | undefined {
  return ownedPort;
}

/**
 * Context → 桥实例的登记表。
 *
 * 为什么要这张表：`routeLegacyMethod(context, ...)` 是合同冻结的签名（entry.ts 只有
 * `options.context`，没有桥句柄），而桥实例持有会话登记表等状态。因此 `runBridge`
 * 建桥时把实例登记到自己的 context 上，路由时按 context 取回。
 * WeakMap 保证 context 回收后不留引用。
 */
export interface LegacyBridgeHandle {
  /** 路由器依赖集合（路由与测试直驱用）。 */
  readonly deps: import("./router-deps.js").LegacyRouterDeps;
  route(
    method: string,
    params: unknown,
    trace?: Readonly<Record<string, unknown>>,
  ): Promise<LegacyMethodOutcome | undefined>;
  settleHostRequest(id: string | number, payload: { result?: unknown; error?: unknown }): boolean;
  attach(
    sink: { write(message: Readonly<Record<string, unknown>>): void },
    connected?: boolean,
  ): void;
  detach(): void;
  dispose(): void;
}

const bridges = new WeakMap<Context, LegacyBridgeHandle>();

/** 仅供桥启动路径：把实例登记到它的 context 上（幂等覆盖）。 */
export function bindLegacyBridge(context: Context, bridge: LegacyBridgeHandle): void {
  bridges.set(context, bridge);
}

/** 取 context 上的桥实例；未建桥时 undefined（路由回落到 -32601）。 */
export function legacyBridgeFor(context: Context): LegacyBridgeHandle | undefined {
  return bridges.get(context);
}

/** 解绑（桥收尾时调用，避免 WeakMap 在 context 存活期内留着已 dispose 的实例）。 */
export function unbindLegacyBridge(context: Context, bridge: LegacyBridgeHandle): void {
  if (bridges.get(context) === bridge) bridges.delete(context);
}
