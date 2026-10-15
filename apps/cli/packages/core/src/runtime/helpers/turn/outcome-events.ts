// SPDX-License-Identifier: Apache-2.0
// 回合失败映射与结果事件落盘（B30 的结果半边）。
// 失败映射：外部故障 → 可恢复的 UnknownError（保留原 message 与 cause）；取消 → TurnCancelled
// 且原文已是取消错误则复用；上下文超限（核心错误或按消息识别）→ ModelContextExceeded（可重试）；
// 其余 → UnknownError + 回退文案 + wrapper 角色。
// 结果事件：取消 → 追加 TurnComplete（resultType=cancelled、用量由既有事件汇总、token/toolCall
// 归零）；否则追加 TurnError（错误类型、投影后的错误负载与栈、回合阶段）。两者都**先落事件
// 再打日志**（error 级，状态 cancelled/failed）。事件追加是顺序 await。
import {
  CoreErrorType,
  SessionEventType,
  createCoreError,
  createModelUsageSummaryFromEvents,
  isCoreError,
  traceContextToLogContext,
} from "../../deps.js";
import type { SessionEvent, TraceContext } from "../../deps.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import {
  ErrorPayloadRole,
  projectExecutionErrorPayload,
  withErrorPayloadRole,
} from "../../../errors/error-payload.js";
import { isModelContextExceededError } from "../model/failure-classification.js";
import {
  createTurnCancelledError,
  isTurnCancellationError,
  locateExternalTurnFault,
} from "./abort-scope.js";

export { projectExecutionErrorPayload } from "../../../errors/error-payload.js";

// 上下文超限的正文（逐字冻结，与 finish 错误同文案）。
const CONTEXT_WINDOW_MESSAGE = "Model request exceeded the provider context window.";

// createTurnFailureError 的「默认回退文案」也是模型错误直通的判定串（逐字冻结）。
const DEFAULT_TURN_FALLBACK = "Turn execution failed";

// 结果事件参数面（字段名是兼容接口）。
export interface TurnOutcomeEventParams {
  coreError: /* 已映射好的回合错误 */ ReturnType<typeof createTurnFailureError>;
  events: /* 调用方事件数组，落盘后压入 */ SessionEvent[];
  durationMs: /* 回合耗时 */ number;
  turnPhase: /* 回合阶段 */ string;
  inputId?: /* 本轮输入 id */ string;
  traceContext: /* 追踪上下文 */ TraceContext;
  fallbackMessage: /* 错误投影的回退文案 */ string;
  logEvent: /* 日志事件名 */ string;
  logLabel: /* 日志前缀标签 */ string;
  preserveQueueAutoDrainOnCancel?: /* 取消时保留队列自动排空 */ boolean;
  backgroundSubagentResultConsumed?: /* 后台子代理结果已消费 */ boolean;
  workflowResultConsumed?: /* 工作流结果已消费 */ boolean;
  historyRoundCount?: /* 历史轮次计数 */ number;
}

export const createTurnFailureError = (
  failure: unknown,
  abortSignal: AbortSignal | undefined,
  fallbackText: string,
): ReturnType<typeof createCoreError> => {
  const upstreamFault =
    locateExternalTurnFault(abortSignal?.reason) ?? locateExternalTurnFault(failure);
  if (upstreamFault) {
    return createCoreError(CoreErrorType.UnknownError, upstreamFault.message, {
      cause: upstreamFault,
      recoverable: true,
    });
  }
  if (isTurnCancellationError(failure, abortSignal)) {
    return createTurnCancelledError(failure);
  }
  const passthrough =
    isCoreError(failure) &&
    (failure.type === CoreErrorType.ModelContextExceeded ||
      (fallbackText === DEFAULT_TURN_FALLBACK && failure.type === CoreErrorType.ModelError));
  if (passthrough) {
    return failure;
  }
  if (isModelContextExceededError(failure)) {
    return createCoreError(CoreErrorType.ModelContextExceeded, CONTEXT_WINDOW_MESSAGE, {
      cause: failure instanceof Error ? failure : undefined,
      recoverable: true,
      retryable: true, // 超限可重试：换更短的上下文再来
    });
  }
  const wrapperContext = withErrorPayloadRole(undefined, ErrorPayloadRole.Wrapper);
  return createCoreError(CoreErrorType.UnknownError, fallbackText, {
    cause: failure instanceof Error ? failure : undefined,
    context: wrapperContext,
  });
};

// 取消载荷：token/toolCall 归零、用量从既有事件汇总，三个开关按需出现。
function cancelledTurnPayload(
  request: TurnOutcomeEventParams,
  events: SessionEvent[],
  inputId: string | undefined,
): Record<string, unknown> {
  const aggregatedUsage = createModelUsageSummaryFromEvents(events);
  return {
    response: "", // 取消无正文
    tokenCount: 0, // 取消不计 token
    usage: aggregatedUsage,
    toolCallCount: 0, // 取消不计工具调用
    historyRoundCount: request.historyRoundCount ?? 0,
    duration: request.durationMs,
    resultType: "cancelled", // 结果类型固定 cancelled
    inputId, // 本轮输入 id
    ...(request.backgroundSubagentResultConsumed ? { backgroundSubagentResultConsumed: true } : {}),
    ...(request.workflowResultConsumed ? { workflowResultConsumed: true } : {}),
    ...(request.preserveQueueAutoDrainOnCancel ? { preserveQueueAutoDrainOnCancel: true } : {}),
  };
}

// 失败载荷：错误类型（外部故障用其 code）+ 投影负载 + 栈 + 回合阶段。
function failedTurnPayload(
  request: TurnOutcomeEventParams,
  mappedFailure: ReturnType<typeof createTurnFailureError>,
  inputId: string | undefined,
): Record<string, unknown> {
  const upstreamFault = locateExternalTurnFault(mappedFailure);
  const errorSection = {
    type: upstreamFault?.code ?? mappedFailure.type,
    ...projectExecutionErrorPayload(mappedFailure, request.fallbackMessage),
    stack: mappedFailure.stack,
  };
  return {
    error: errorSection,
    turnPhase: request.turnPhase,
    inputId, // 本轮输入 id
    ...(request.backgroundSubagentResultConsumed ? { backgroundSubagentResultConsumed: true } : {}),
    ...(request.workflowResultConsumed ? { workflowResultConsumed: true } : {}),
  };
}

export const appendTurnOutcomeEvent = async (
  runtime: AgentRuntimeInternal,
  request: TurnOutcomeEventParams,
): Promise<void> => {
  const { coreError, events, traceContext: trace, turnPhase, inputId } = request;
  const isCancelled = coreError.type === CoreErrorType.TurnCancelled;
  const payload = isCancelled
    ? cancelledTurnPayload(request, events, inputId)
    : failedTurnPayload(request, coreError, inputId);
  const eventType = isCancelled ? SessionEventType.TurnComplete : SessionEventType.TurnError;
  const recorded = runtime.createEvent(eventType, payload, trace);
  // 先落事件再打日志（行为契约）。
  await runtime.appendEvent(recorded, trace);
  events.push(recorded);
  runtime.logger?.error(`${request.logLabel} failed`, coreError, {
    ...traceContextToLogContext(trace),
    event: request.logEvent,
    module: "core.runtime", // 模块归属是观测契约字段
    status: isCancelled ? "cancelled" : "failed",
    turnPhase, // 回合阶段进日志
  });
};
