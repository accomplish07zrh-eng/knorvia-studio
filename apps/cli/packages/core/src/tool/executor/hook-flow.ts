// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 工具执行的 Hook 流程：把「工具调用上下文」翻译成 Hook 阶段的请求，再把结果投影回来。
//
// 四个阶段的实现同构：都从同一份调用上下文出发，差异只在阶段载荷与「无 Hook 命中时的默认值」。
// 因此内部统一走 `invokePhase`，四个导出函数保持既有的位置参数签名不变
// （调用方与行为测试都按位置参数调用，签名即契约）。
import type { CollaborationMode, PermissionBrokerResult, TraceContext } from "@knorvia/contracts";
import type { HookRunResult } from "../../hooks/index.js";
import type { PermissionDecisionResult } from "../../permission/service.js";
import type { ExecutableToolCall, ToolEntry } from "../types.js";
import type { ToolExecutorDeps } from "./types.js";
import { invokeToolHook } from "./hook-envelope.js";
import { projectPermissionHook } from "./hook-decisions.js";

export { applyPreToolPermissionDecision, formatHookAdditionalContexts } from "./hook-decisions.js";

/**
 * 空结果必须每次新建：契约要求多次调用返回互相独立的数组，
 * 否则调用方改动 one 会影响 another。共享常量会破坏这一点。
 */
const emptyHookResult = (): HookRunResult => ({ additionalContexts: [] });

/**
 * 四个阶段共用的发起步骤。
 * 参数顺序与 `invokeToolHook` 一致，避免这里再引入一层映射。
 */
const invokePhase = (
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  input: unknown,
  phase: Parameters<typeof invokeToolHook>[3],
  traceContext: TraceContext,
  signal: AbortSignal | undefined,
): ReturnType<typeof invokeToolHook> =>
  invokeToolHook(deps, toolCall, input, phase, traceContext, signal);

/** before 阶段：没有 Hook 命中时返回空结果，让执行继续。 */
export async function runPreToolUseHooks(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  input: unknown,
  entry: ToolEntry,
  mode: CollaborationMode,
  traceContext: TraceContext,
  signal?: AbortSignal,
): Promise<HookRunResult> {
  const phase = { kind: "before" as const, entry, mode };
  return invokePhase(deps, toolCall, input, phase, traceContext, signal) ?? emptyHookResult();
}

/** approval 阶段：Hook 可以接管权限决策，返回 undefined 表示沿用原决策。 */
export async function runPermissionRequestHooks(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  input: unknown,
  requestId: string,
  permissionDecision: PermissionDecisionResult,
  mode: CollaborationMode,
  traceContext: TraceContext,
  signal?: AbortSignal,
): Promise<PermissionBrokerResult | undefined> {
  const phase = { kind: "approval" as const, decision: permissionDecision, requestId, mode };
  const pending = invokePhase(deps, toolCall, input, phase, traceContext, signal);
  return pending ? projectPermissionHook(await pending) : undefined;
}

/** after 阶段：只有成功路径才走，可携带产物路径。 */
export async function runPostToolUseHooks(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  input: unknown,
  output: unknown,
  artifactPath: string | undefined,
  traceContext: TraceContext,
  signal?: AbortSignal,
): Promise<HookRunResult> {
  const phase = { kind: "after" as const, output, artifactPath };
  return invokePhase(deps, toolCall, input, phase, traceContext, signal) ?? emptyHookResult();
}

/** failure 阶段：工具已失败，Hook 只能补充上下文，不能改变失败事实。 */
export async function runPostToolUseFailureHooks(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  input: unknown,
  error: unknown,
  traceContext: TraceContext,
  signal?: AbortSignal,
): Promise<HookRunResult> {
  const phase = { kind: "failure" as const, error };
  return invokePhase(deps, toolCall, input, phase, traceContext, signal) ?? emptyHookResult();
}
