// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { CollaborationMode, PermissionBrokerResult, TraceContext } from "@knorvia/contracts";
import type { HookRunResult } from "../../hooks/index.js";
import type { PermissionDecisionResult } from "../../permission/service.js";
import type { ExecutableToolCall, ToolEntry } from "../types.js";
import type { ToolExecutorDeps } from "./types.js";
import { invokeToolHook } from "./hook-envelope.js";
import { projectPermissionHook } from "./hook-decisions.js";
export { applyPreToolPermissionDecision, formatHookAdditionalContexts } from "./hook-decisions.js";

export async function runPreToolUseHooks(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  input: unknown,
  entry: ToolEntry,
  mode: CollaborationMode,
  traceContext: TraceContext,
  signal?: AbortSignal,
): Promise<HookRunResult> {
  return (
    invokeToolHook(
      deps,
      toolCall,
      input,
      { kind: "before", entry, mode },
      traceContext,
      signal,
    ) ?? { additionalContexts: [] }
  );
}

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
  const pending = invokeToolHook(
    deps,
    toolCall,
    input,
    {
      kind: "approval",
      decision: permissionDecision,
      requestId,
      mode,
    },
    traceContext,
    signal,
  );
  return pending ? projectPermissionHook(await pending) : undefined;
}

export async function runPostToolUseHooks(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  input: unknown,
  output: unknown,
  artifactPath: string | undefined,
  traceContext: TraceContext,
  signal?: AbortSignal,
): Promise<HookRunResult> {
  return (
    invokeToolHook(
      deps,
      toolCall,
      input,
      { kind: "after", output, artifactPath },
      traceContext,
      signal,
    ) ?? { additionalContexts: [] }
  );
}

export async function runPostToolUseFailureHooks(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  input: unknown,
  error: unknown,
  traceContext: TraceContext,
  signal?: AbortSignal,
): Promise<HookRunResult> {
  return (
    invokeToolHook(deps, toolCall, input, { kind: "failure", error }, traceContext, signal) ?? {
      additionalContexts: [],
    }
  );
}
