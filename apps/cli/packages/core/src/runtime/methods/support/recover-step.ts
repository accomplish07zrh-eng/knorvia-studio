// SPDX-License-Identifier: Apache-2.0
// 模型失败后的补执行编排（有声明版）：收采 → 合成补齐 → Started → 状态重置 → 补执行 →
// 锚点三连 → 摘监听。合成补齐保证补执行表与声明表等长同序；恢复事件与补执行的持久化交错次序
// 是契约（Started 先于补执行账本，锚点三连最后）。
import { TurnMachineImpl } from "../../deps.js";
import type { MessageId, Model, ModelToolCall, TraceContext } from "../../deps.js";
import { createRuntimeAssistantEntry } from "../../../agent/message-history.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { StreamedToolExecutionResult } from "../../types.js";
import { recordModelHistoryRound, type RegularTurnLoopState } from "../turn-loop-state.js";
import { commitTurnRequestEntries } from "../turn-output-token-continuation.js";
import { executeToolCallsForModelStep } from "../turn-tools.js";
import { collectSettledExecutions, type ExecutionTable } from "./collect-results.js";
import { emitStreamRecoveryRetryEvents, emitStreamRecoveryStarted } from "./recovery-emit.js";
import { beginStreamRecoveryAttempt } from "./recovery-plan.js";
import { buildSyntheticStreamedToolResult } from "./synthetic-results.js";

/** 补执行编排的输入面。 */
export interface ModelFailureRecoveryRequest {
  /** 声明副本表（登记序）。 */
  declarations: ModelToolCall[];
  /** 已启动的执行表。 */
  executions: ExecutionTable;
  /** 触发恢复的错误。 */
  error: unknown;
  /** 助手消息创建时刻。 */
  assistantCreatedAt: number;
  /** 已丢弃的推理字节数。 */
  discardedReasoningBytes: number;
  /** 已丢弃的文本字节数。 */
  discardedTextBytes: number;
  /** 恢复事件的公共入参 + 模型。 */
  options: {
    assistantMessageId: MessageId;
    failedRequestId?: string;
    model: Model;
    traceContext: TraceContext;
  };
  /** 运行时端口面。 */
  runtime: AgentRuntimeInternal;
  /** 回合状态。 */
  state: RegularTurnLoopState;
  /** 回合 abort 监听（编排收尾时摘除）。 */
  turnAbortListener: () => void;
}

/** 有声明的补执行编排：返回恒真（调用方已做短路判定）。 */
export async function recoverWithDeclaredTools(
  request: ModelFailureRecoveryRequest,
): Promise<boolean> {
  const { declarations, executions } = request;

  // 步骤一：消耗一次恢复预算（abort 由协调器外壳先行完成）。
  const attempt = beginStreamRecoveryAttempt(request.state);

  // 步骤二：按声明序收采，未出结果的声明补合成结果（等长同序的来源）。
  const completed = await collectSettledExecutions(executions, declarations);
  const completedById = new Map<string, StreamedToolExecutionResult>(
    completed.map((result) => [String(result.toolCallId), result]),
  );
  const streamedToolResults = declarations.map(
    (toolCall) =>
      completedById.get(toolCall.id) ??
      buildSyntheticStreamedToolResult(
        toolCall,
        executions.has(toolCall.id) ? "unknown_execution_state" : "not_executed",
      ),
  );

  // 步骤三：恢复 Started 事件先于补执行的任何持久化。
  await emitStreamRecoveryStarted(
    request.runtime,
    request.state,
    request.options,
    request.error,
    attempt,
  );

  // 步骤四：回合状态重置 + provider 可见历史提交（空 assistant 文本 + 声明工具表）。
  request.state.modelResponse = "";
  request.state.modelStepCount += 1;
  recordModelHistoryRound(request.state);
  request.state.toolCallCount += streamedToolResults.length;
  commitTurnRequestEntries(request.runtime, request.state.turnRequestState, [
    createRuntimeAssistantEntry("", declarations, undefined, request.options.model),
  ]);
  request.state.turnMachine = new TurnMachineImpl(
    request.state.turnMachine.receiveModelResponse(""),
  );

  // 步骤五：补执行（含合成结果）。
  await executeToolCallsForModelStep.call(request.runtime, request.state, {
    assistantCreatedAt: request.assistantCreatedAt,
    assistantMessageId: request.options.assistantMessageId,
    modelTraceContext: request.options.traceContext,
    result: {
      finishReason: "tool-calls",
      providerMetadata: { recoveredFromStreamFailure: true },
      text: "",
      toolCalls: declarations,
      usage: {},
    } as never,
    streamedToolResults,
    toolCalls: declarations,
  });

  // 步骤六：锚点三连收尾（committedToolCallIds = 补执行表序）。
  await emitStreamRecoveryRetryEvents(request.runtime, request.state, request.options, {
    discardedReasoningBytes: request.discardedReasoningBytes,
    discardedTextBytes: request.discardedTextBytes,
    maxRetries: attempt.maxRetries,
    reason: "latest_committed_tool_result",
    retryNumber: attempt.retryNumber,
    toolCallIds: streamedToolResults.map((result) => result.toolCallId),
  });

  // 步骤七：摘 abort 监听。
  request.state.turnAbortSignal.removeEventListener("abort", request.turnAbortListener);
  return true;
}
