// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  createChildTraceContext,
  createRootTraceContext,
  getCurrentTraceContext,
  type ToolExecutionSpanWriter,
} from "@knorvia/contracts";
import type { ExecutableToolCall, ToolEntry } from "../../types.js";
import { resolveToolEntryModelContract } from "../../model-contract.js";
import type { ToolExecuteOptions, ToolExecutorDeps } from "../types.js";

export function registeredCall(deps: ToolExecutorDeps, call: ExecutableToolCall) {
  return call.name.trim().length ? deps.registry.get(call.name) : undefined;
}
export function canonicalCall(call: ExecutableToolCall, entry?: ToolEntry) {
  return entry && call.name !== entry.metadata.name ? { ...call, name: entry.metadata.name } : call;
}

export function inspectInvocation(
  deps: ToolExecutorDeps,
  original: ExecutableToolCall,
  options: ToolExecuteOptions | undefined,
  totalStartedAt: number,
  telemetry?: ToolExecutionSpanWriter,
) {
  const parent =
    options?.traceContext ??
    getCurrentTraceContext() ??
    deps.traceContext ??
    createRootTraceContext({ sessionId: deps.sessionId, turnId: deps.turnId });
  const blank = original.name.trim().length === 0;
  const registered = blank ? undefined : deps.registry.get(original.name);
  const initialModel = options?.model ?? deps.model;
  const entry = registered && resolveToolEntryModelContract(registered, { model: initialModel });
  const call = canonicalCall(original, entry);
  const trace = createChildTraceContext(parent, {
    sessionId: deps.sessionId,
    turnId: deps.turnId,
    attributes: { toolCallId: call.id, toolName: call.name },
  });
  return {
    deps,
    original,
    options,
    totalStartedAt,
    telemetry,
    entry,
    initialModel,
    call,
    trace,
    blank,
    turnId: trace.turnId ?? deps.turnId,
  };
}
export type InvocationFacts = ReturnType<typeof inspectInvocation>;
export type RegisteredInvocation = InvocationFacts & { entry: ToolEntry };
