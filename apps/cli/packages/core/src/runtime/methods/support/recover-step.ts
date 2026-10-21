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

/** 恢复事件的公共入参（三项标识 + 模型 + 追踪）。 */
export type RecoveryEventOptions = {
  assistantMessageId: MessageId;
  failedRequestId?: string;
  model: Model;
  traceContext: TraceContext;
};

/**
 * 合成补执行结果时的「未执行原因」判定。
 *
 * 两种原因必须区分：执行表里有过登记但没出结果 → `unknown_execution_state`；
 * 压根没登记 → `not_executed`。两者在账本里是可分辨的事实，不能合并。
 */
function unexecutedReason(
  executions: ExecutionTable,
  toolCall: ModelToolCall,
): "unknown_execution_state" | "not_executed" {
  return executions.has(toolCall.id) ? "unknown_execution_state" : "not_executed";
}

/** 恢复所需的表与端口（声明表、执行表、运行时端口面、回合状态）。 */
export type RecoveryTablesAndPorts = {
  /** 声明副本表（登记序）。 */
  declarations: ModelToolCall[];
  /** 已启动的执行表。 */
  executions: ExecutionTable;
  /** 运行时端口面。 */
  runtime: AgentRuntimeInternal;
  /** 回合状态。 */
  state: RegularTurnLoopState;
};

/** 恢复所需的放弃计数与触发原因（错误本体、助手时刻、崩溃前已丢弃的字节）。 */
export type RecoveryFailureFacts = {
  /** 触发恢复的错误。 */
  error: unknown;
  /** 助手消息创建时刻。 */
  assistantCreatedAt: number;
  /** 已丢弃的推理字节数。 */
  discardedReasoningBytes: number;
  /** 已丢弃的文本字节数。 */
  discardedTextBytes: number;
};

/** 编排收尾需要摘除的监听。 */
export type RecoveryAbortTeardown = {
  /** 回合 abort 监听（编排收尾时摘除）。 */
  turnAbortListener: () => void;
};

/**
 * 补执行编排的输入面。
 *
 * 按语义分成四组（表与端口 / 失败事实 / 事件入参 / 收尾），而不是摊平成十个同质字段：
 * 分组让「哪些是外部状态、哪些是这次失败的观测值」在类型上就分开，
 * 也避免一长串 `字段: 类型;` 的机械重复。
 */
export interface ModelFailureRecoveryRequest
  extends RecoveryTablesAndPorts, RecoveryFailureFacts, RecoveryAbortTeardown {
  /** 恢复事件的公共入参 + 模型。 */
  options: RecoveryEventOptions;
}

/**
 * 补执行的「合成模型响应」。
 *
 * 为什么是一个显式构造器而不是内联字面量：这个对象是**伪造的模型响应**（真实响应因流失败
 * 而不可得），把它单独命名能让审查者一眼看到「这里在补一个不存在的东西」，
 * 也让 `finishReason` / `providerMetadata` 这两个关键标记有明确的归属。
 */
function syntheticModelResponse(declarations: readonly ModelToolCall[]): Record<string, unknown> {
  return {
    finishReason: "tool-calls",
    providerMetadata: { recoveredFromStreamFailure: true },
    text: "",
    toolCalls: declarations,
    usage: {},
  };
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
  const streamedToolResults: StreamedToolExecutionResult[] = declarations.map(
    (toolCall) =>
      completedById.get(toolCall.id) ??
      buildSyntheticStreamedToolResult(toolCall, unexecutedReason(executions, toolCall)),
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
    result: syntheticModelResponse(declarations) as never,
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
