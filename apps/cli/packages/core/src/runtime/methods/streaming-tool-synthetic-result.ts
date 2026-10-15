// SPDX-License-Identifier: Apache-2.0
// 合成工具结果入口：构造与错误事件在 support/synthetic-results.ts，这里保持兼容导出面。
import type { ModelToolCall, SessionEvent, ToolExecutionResult, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { StreamedToolExecutionResult } from "../types.js";
import {
  buildSyntheticStreamedToolResult as makeSyntheticResult,
  deliverSyntheticStreamedToolError as deliverSyntheticError,
} from "./support/synthetic-results.js";

export function createSyntheticStreamedToolResult(
  toolCall: ModelToolCall,
  reason: "not_executed" | "unknown_execution_state",
): StreamedToolExecutionResult {
  return makeSyntheticResult(toolCall, reason);
}

export async function emitSyntheticStreamedToolError(
  runtime: AgentRuntimeInternal,
  events: SessionEvent[],
  traceContext: TraceContext,
  result: ToolExecutionResult,
): Promise<void> {
  await deliverSyntheticError({ events, result, runtime, traceContext });
}
