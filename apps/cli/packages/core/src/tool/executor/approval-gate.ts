// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { traceContextToLogContext, type TraceContext } from "@knorvia/contracts";
import type { ExecutableToolCall, ToolEntry } from "../types.js";
import type { ToolExecutorDeps } from "./types.js";
import { AskProjection, type ResolvedToolApproval } from "./approval/ask-projection.js";

const PREVIEW_FAILURE = "Tool approval preview failed; asking without a preview";
const PREVIEW_EVENT = "tool.permission.approval_preview_failed";
const EXECUTOR_MODULE = "core.tool.executor";

export function resolveToolApproval(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  entry: ToolEntry,
  executionInput: unknown,
  traceContext: TraceContext,
): ResolvedToolApproval {
  const projection = new AskProjection(entry.permission?.askOptions?.allowAlways);
  if (!entry.prepareApproval) return projection.ask();
  try {
    return projection.project(entry.prepareApproval(executionInput));
  } catch (error) {
    // 预览失败不能成为执行许可；保留本次已捕获策略，只降级预览并报告原因。
    deps.logger?.warn(PREVIEW_FAILURE, {
      ...traceContextToLogContext(traceContext),
      error: error instanceof Error ? error.message : String(error),
      event: PREVIEW_EVENT,
      module: EXECUTOR_MODULE,
      status: "failed",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
    });
    return projection.ask();
  }
}
