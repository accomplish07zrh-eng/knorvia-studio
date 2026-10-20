// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 工具执行的 Hook 流程：把「工具调用上下文」翻译成 Hook 阶段的请求，再把结果投影回来。
//
// 四个阶段的实现高度同构：共用同一份调用上下文，差异只在阶段载荷与「无 Hook 命中时的默认值」。
// 因此这里把共用部分收成 `ToolHookContext`，阶段差异收进一张阶段表，
// 四个导出函数只保留最小签名 —— 读调用点时不必数七八个位置参数。
import type { CollaborationMode, PermissionBrokerResult, TraceContext } from "@knorvia/contracts";
import type { HookRunResult } from "../../hooks/index.js";
import type { PermissionDecisionResult } from "../../permission/service.js";
import type { ExecutableToolCall, ToolEntry } from "../types.js";
import type { ToolExecutorDeps } from "./types.js";
import { invokeToolHook } from "./hook-envelope.js";
import { projectPermissionHook } from "./hook-decisions.js";

export { applyPreToolPermissionDecision, formatHookAdditionalContexts } from "./hook-decisions.js";

/** Hook 阶段共用的调用上下文。 */
export interface ToolHookContext {
  deps: ToolExecutorDeps;
  input: unknown;
  signal?: AbortSignal;
  toolCall: ExecutableToolCall;
  traceContext: TraceContext;
}

/** 无 Hook 时的空结果：所有阶段都可能「没有 Hook 命中」，统一用同一个形状。 */
const EMPTY_HOOK_RESULT: HookRunResult = { additionalContexts: [] };

/** 把共用上下文摊成 `invokeToolHook` 的位置参数（该函数是既有接口，不改它）。 */
const invokeInContext = (
  context: ToolHookContext,
  phase: Parameters<typeof invokeToolHook>[3],
): ReturnType<typeof invokeToolHook> =>
  invokeToolHook(
    context.deps,
    context.toolCall,
    context.input,
    phase,
    context.traceContext,
    context.signal,
  );

/** before 阶段：没有 Hook 命中时返回空结果，让执行继续。 */
export const runPreToolUseHooks = async (
  context: ToolHookContext,
  entry: ToolEntry,
  mode: CollaborationMode,
): Promise<HookRunResult> =>
  invokeInContext(context, { kind: "before", entry, mode }) ?? EMPTY_HOOK_RESULT;

/** approval 阶段：Hook 可以接管权限决策，返回 undefined 表示沿用原决策。 */
export const runPermissionRequestHooks = async (
  context: ToolHookContext,
  approval: { decision: PermissionDecisionResult; mode: CollaborationMode; requestId: string },
): Promise<PermissionBrokerResult | undefined> => {
  const pending = invokeInContext(context, { kind: "approval", ...approval });
  return pending ? projectPermissionHook(await pending) : undefined;
};

/** after 阶段：只有成功路径才走，可携带产物路径。 */
export const runPostToolUseHooks = async (
  context: ToolHookContext,
  outcome: { artifactPath: string | undefined; output: unknown },
): Promise<HookRunResult> =>
  invokeInContext(context, { kind: "after", ...outcome }) ?? EMPTY_HOOK_RESULT;

/** failure 阶段：工具已失败，Hook 只能补充上下文，不能改变失败事实。 */
export const runPostToolUseFailureHooks = async (
  context: ToolHookContext,
  error: unknown,
): Promise<HookRunResult> =>
  invokeInContext(context, { kind: "failure", error }) ?? EMPTY_HOOK_RESULT;
