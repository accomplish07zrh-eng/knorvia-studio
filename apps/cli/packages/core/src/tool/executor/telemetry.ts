// SPDX-License-Identifier: Apache-2.0
// 工具调用的遥测包装：为一次执行开一个 span，并在执行器自身收口失败时补记终态。
//
// 正常路径不在这里收口：业务执行器在每个返回分支都按事实结束 span。这里只兜住
// 「连 ToolCallStarted / ToolCallError 事件发布都直接抛出」的非结构化异常，
// 否则 span 最终只能停在 missing_terminal，观测上无法区分「没结束」与「失败」。

import type { ToolExecutionSpanWriter } from "@knorvia/contracts";
import type { ExecutableToolCall, ToolExecutionResult } from "../types.js";
import type { ToolExecuteOptions, ToolExecutorDeps } from "./types.js";

/** 执行器依赖集合。 */
type ExecutorDeps = ToolExecutorDeps;
/** 一次工具调用。 */
type ToolCall = ExecutableToolCall;
/** 可缺省的执行选项。 */
type OptionalExecuteOptions = ToolExecuteOptions | undefined;

const ABORT_REASON = "abort_signal";
const UNHANDLED_OUTCOME = "unhandled";
const UNKNOWN_FAILURE_KIND = "unknown";

type ToolCallExecutor = (
  telemetry: ToolExecutionSpanWriter | undefined,
) => Promise<ToolExecutionResult>;

export async function runToolCallWithTelemetry(
  deps: ExecutorDeps,
  toolCall: ToolCall,
  options: OptionalExecuteOptions,
  execute: ToolCallExecutor,
): Promise<ToolExecutionResult> {
  const scope = deps.agentTelemetry?.startTool({
    registeredToolName: toolCall.name,
    toolCallId: toolCall.id,
  });
  if (scope === undefined) return execute(undefined);

  return scope.run(async () => {
    const outcome = execute(scope);
    return outcome.catch((error: unknown) => {
      finishAbortedOrFailed(scope, options?.signal?.aborted === true, error);
      throw error;
    });
  });
}

// 取消与失败分开记账：前者是调用方主动中止，后者是未结构化异常。
function finishAbortedOrFailed(
  scope: ToolExecutionSpanWriter,
  aborted: boolean,
  error: unknown,
): void {
  if (aborted) {
    scope.finishCancelled(ABORT_REASON);
    return;
  }
  scope.finishFailed(UNHANDLED_OUTCOME, UNKNOWN_FAILURE_KIND, error);
}
