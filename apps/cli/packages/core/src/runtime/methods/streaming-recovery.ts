// SPDX-License-Identifier: Apache-2.0
// 流恢复入口：预算/尝试/耗尽错误在 support/recovery-plan.ts，事件组与失败分类在
// support/recovery-emit.ts，部分输出恢复编排在 support/recovery-orchestration.ts。
// 这里保持兼容导出面（含固定文案常量）。
import type { MessageId, Model, ToolCallId, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";
import {
  emitStreamRecoveryRetryEvents as deliverRetryEvents,
  emitStreamRecoveryStarted as deliverRecoveryStarted,
} from "./support/recovery-emit.js";
import { recoverPartialAssistantOutputFailure as recoverPartialOutput } from "./support/recovery-orchestration.js";
import {
  beginStartPlanBusyAdmissionRetryAttempt as beginBusyAdmissionAttempt,
  beginStreamRecoveryAttempt as beginRecoveryAttempt,
  buildBusyExhaustedError,
  busyAdmissionDelayMs,
  BUSY_EXHAUSTED_TEXT,
  hasStreamRecoveryBudget as hasRecoveryBudget,
  isBusyFailure,
} from "./support/recovery-plan.js";

/** 耗尽错误的固定文案（逐字兼容导出）。 */
export const START_PLAN_BUSY_AUTO_RETRY_EXHAUSTED_MESSAGE = BUSY_EXHAUSTED_TEXT;

/** 尝试序号（短别名）。 */
type AttemptOrdinal = number;

/** 尝试记账结果（兼容返回面）。 */
interface AttemptFacts {
  maxRetries: AttemptOrdinal;
  retryNumber: AttemptOrdinal;
}

export function hasStreamRecoveryBudget(state: RegularTurnLoopState): boolean {
  return hasRecoveryBudget(state);
}

export function beginStreamRecoveryAttempt(state: RegularTurnLoopState): AttemptFacts {
  return beginRecoveryAttempt(state);
}

export function beginStartPlanBusyAdmissionRetryAttempt(state: RegularTurnLoopState): AttemptFacts {
  return beginBusyAdmissionAttempt(state);
}

export function isStartPlanBusyStreamRecoveryFailure(error: unknown): boolean {
  return isBusyFailure(error);
}

export function createStartPlanBusyAutoRetryExhaustedError(error: unknown): Error {
  return buildBusyExhaustedError(error);
}

export function getStartPlanBusyAdmissionRetryDelayMs(input: {
  error: unknown;
  providerId: string;
  state: RegularTurnLoopState;
  turnNumber: number;
}): number | undefined /* 准入退避毫秒 */ {
  return busyAdmissionDelayMs(input);
}

export async function emitStreamRecoveryStarted(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: { assistantMessageId: MessageId; failedRequestId?: string; traceContext: TraceContext },
  error: unknown,
  recoveryAttempt: AttemptFacts,
): Promise<void> {
  await deliverRecoveryStarted(runtime, state, options, error, recoveryAttempt);
}

export async function emitStreamRecoveryRetryEvents(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: { assistantMessageId: MessageId; failedRequestId?: string; traceContext: TraceContext },
  recovery: {
    discardedReasoningBytes: number;
    discardedTextBytes: number;
    maxRetries: number;
    reason: "latest_committed_tool_result" | "no_tool_committed";
    retryNumber: AttemptOrdinal;
    toolCallIds: ToolCallId[];
  },
): Promise<void> {
  await deliverRetryEvents(runtime, state, options, recovery);
}

export async function recoverPartialAssistantOutputFailure(input: {
  abortController: AbortController;
  assistantCreatedAt: number;
  discardedReasoningBytes: number;
  discardedTextBytes: number;
  error: unknown;
  options: {
    assistantMessageId: MessageId;
    failedRequestId?: string;
    model: Model;
    traceContext: TraceContext;
  };
  runtime: AgentRuntimeInternal;
  state: RegularTurnLoopState;
  turnAbortListener: () => void;
}): Promise<boolean> {
  return recoverPartialOutput(input);
}
