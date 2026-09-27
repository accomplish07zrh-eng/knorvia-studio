// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { CoreErrorType, createCoreError, traceContextToLogContext } from "@knorvia/contracts";
import type { ExecutableToolCall, ToolExecutionResult } from "../types.js";
import type { BackgroundTaskTracker } from "./background-tasks.js";
import { createErrorResult } from "./errors.js";
import { emitToolCallError } from "./events.js";
import { runToolCallWithTelemetry } from "./telemetry.js";
import type { ToolExecuteOptions, ToolExecutorDeps } from "./types.js";
import {
  canonicalCall,
  inspectInvocation,
  registeredCall,
  type InvocationFacts,
} from "./invocation/identity.js";
import { Invocation } from "./invocation/invocation.js";

export async function executeToolCall(
  deps: ToolExecutorDeps,
  backgroundTasks: BackgroundTaskTracker,
  toolCall: ExecutableToolCall,
  options?: ToolExecuteOptions,
): Promise<ToolExecutionResult> {
  const started = Date.now();
  const registration = registeredCall(deps, toolCall);
  // 模型给出的未知名称不能进入遥测枚举；业务错误仍保留原名用于配对与修正。
  const measured = registration
    ? canonicalCall(toolCall, registration)
    : { ...toolCall, name: "unknown" };
  return runToolCallWithTelemetry(deps, measured, options, async (telemetry) => {
    const facts = inspectInvocation(deps, toolCall, options, started, telemetry);
    if (!facts.entry) return rejectUnknown(facts);
    return new Invocation({ ...facts, entry: facts.entry }, backgroundTasks).run();
  });
}

async function rejectUnknown(facts: InvocationFacts): Promise<ToolExecutionResult> {
  const { deps, original, trace, turnId, telemetry, blank } = facts;
  const result = createErrorResult(
    original,
    createCoreError(
      CoreErrorType.ToolNotFound,
      blank
        ? "Model returned an invalid tool call: tool name is empty."
        : `Tool not found: ${original.name}`,
      { context: { toolCallId: original.id, toolName: original.name }, recoverable: false },
    ),
  );
  if (blank)
    result.modelContent = `<tool_use_error>Error: No such tool available: ${original.name}</tool_use_error>`;
  await emitToolCallError(deps, original.id, trace, turnId, result.error);
  deps.logger?.warn("Tool call rejected because the tool is not registered", {
    ...traceContextToLogContext(trace),
    event: "tool.call.not_found",
    module: "core.tool.executor",
    status: "failed",
    toolCallId: original.id,
    toolName: original.name,
  });
  telemetry?.finishFailed("lookup", "configuration", result.error);
  return result;
}
