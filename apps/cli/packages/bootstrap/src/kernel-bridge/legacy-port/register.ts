// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-02：把回合执行器接到 kernel-bridge-legacy 的执行端口（C2）。
//
// 这一步把 C2 从「端口对象写好了」变成「端口已注册、旧协议方法真的能执行」。
//
// 方向固定：**bridge-02 → legacy**。本模块 import legacy 的注册面
// （`registerLegacyExecutionPort`，其 interface.md §四 的冻结签名），legacy 不 import 本包。
//
// 关闭顺序（组合根用它时）：**先 `release()` 解绑端口，再让 legacy 桥 `detach()`**。
// 理由：端口是本包向 legacy 注入的能力；先撤能力再断输出面，任何仍在途的旧协议
// 请求都会在「端口已缺席」的确定状态下收到 capability 缺席，而不是断流之后
// 等一个永远不来的应答。

import type { Context } from "@deepseek-ai/cordis";
import { registerLegacyExecutionPort } from "../legacy/index.js";
import { createLegacyTurnPort } from "./index.js";
import type { KernelTurnExecutor, TurnExecutorHost } from "../turn-executor.js";

/** DSH 没有「前台执行 id」概念：用常量表达「不提供」，而不是散落一个裸 undefined。 */
const NO_FOREGROUND_EXECUTION_ID = undefined;

/** 已接上的 C2 执行端口：一个能撤销注册的句柄。 */
export interface RegisteredTurnPort {
  /** 解绑执行端口（幂等）。字段式函数而不是方法签名，避免与既有类的形状撞。 */
  readonly release: () => void;
}

/**
 * 把回合执行器注册成 legacy 的执行端口。
 *
 * 只应在启动期调用一次：legacy 的 `registerLegacyExecutionPort` 是单一所有者，
 * 重复注册会抛错——那正是我们要的，一个进程只允许一个端口所有者。
 *
 * @param executor - 与 v4 命令路径**同一个**执行器实例（C2 的实质要求）。
 * @returns 解绑句柄。
 */
export function registerTurnExecutionPort(executor: KernelTurnExecutor): RegisteredTurnPort {
  const undoRegistration = registerLegacyExecutionPort(createLegacyTurnPort(executor));
  const registered: RegisteredTurnPort = { release: undoRegistration };
  // 解绑函数来自 legacy 的注册面；包成句柄后交给调用方在关闭路径上使用。
  return Object.freeze(registered);
}

/** DSH `agents` 服务的最小形状（只用到按 id 取与状态）。 */
interface AgentsLookup {
  get(id: string): { readonly status: "idle" | "running" } | undefined;
}

/**
 * 造一个按会话查 Agent 的宿主实现，供 `DefaultKernelTurnExecutor` 使用。
 *
 * 关于 `foregroundExecutionIdFor`：DSH **没有**「前台执行 id」的公开概念，
 * 所以这里不提供执行 id；效果是 `stop` 走「无过期校验」分支（合同 B6 允许：
 * `expectedForegroundExecutionId` 是可选的防误杀手段）。这比伪造一个永远不匹配的
 * id 更诚实——伪造会让所有 Stop 都被判为过期。
 *
 * @param context - DSH 根 context（从中取 `agents`）。
 * @returns 回合执行器需要的宿主。
 */
export function createAgentLookupHost(context: Context): TurnExecutorHost {
  const lookup = (): AgentsLookup | undefined => context.get("agents") as AgentsLookup | undefined;
  const host: TurnExecutorHost = {
    agentFor(sessionId) {
      return lookup()?.get(sessionId) as never;
    },
    foregroundExecutionIdFor: () => NO_FOREGROUND_EXECUTION_ID,
    isRunning(sessionId) {
      return lookup()?.get(sessionId)?.status === "running";
    },
    registerSession() {
      // 会话登记归 BridgeEngine（它持有 projection 的会话表），本宿主不做第二份。
    },
  };
  return host;
}
