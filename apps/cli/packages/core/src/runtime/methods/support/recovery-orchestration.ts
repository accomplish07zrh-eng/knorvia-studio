// SPDX-License-Identifier: Apache-2.0
// 部分输出失败的恢复编排：短路（无可丢弃内容或不可重试）直接放弃；否则按「abort → 记账 →
// Started → 丢弃标记 → 状态重置 → 锚点三连 → 摘监听」推进，任一步失败原样冒泡不回滚。
import {
  STREAM_RECOVERY_DISCARDED_ERROR_NAME,
  STREAM_RECOVERY_DISCARDED_FINISH,
  TurnMachineImpl,
} from "../../deps.js";
import type { MessageId, Model, TraceContext } from "../../deps.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import { recordModelHistoryRound, type RegularTurnLoopState } from "../turn-loop-state.js";
import { beginStreamRecoveryAttempt } from "./recovery-plan.js";
import {
  emitStreamRecoveryRetryEvents,
  emitStreamRecoveryStarted as deliverRecoveryStarted,
  isRetryableFailure,
} from "./recovery-emit.js";

/** 丢弃标记的固定文案（逐字常量）。 */
const DISCARDED_MESSAGE = "Partial assistant output was discarded before a streaming retry.";

/** 丢弃标记的错误名与收尾串（引用契约常量，取值不变）。 */
const DISCARDED_ERROR_NAME = STREAM_RECOVERY_DISCARDED_ERROR_NAME;
const DISCARDED_FINISH = STREAM_RECOVERY_DISCARDED_FINISH;

/** 助手消息标识（短别名）。 */
type AssistantId = MessageId;

/** 流中断控制器（短别名）。 */
type StreamAbort = AbortController;

/** 毫秒时刻（短别名）。 */
type EpochMillis = number;

/** 字节计数（短别名）。 */
type ByteCount = number;

/** 故障载荷（短别名）。 */
type Fault = unknown;

/** 请求标识（短别名）。 */
type RequestTag = string;

/** 已选模型（短别名）。 */
type SelectedModel = Model;

/** 追踪上下文句柄（短别名）。 */
type TraceHandle = TraceContext;

/** 运行时端口面（短别名）。 */
type RuntimePorts = AgentRuntimeInternal;

/** 回合循环状态（短别名）。 */
type LoopState = RegularTurnLoopState;

/** abort 监听（短别名）。 */
type AbortListener = () => void;

/** 无已提交工具时的空表（常量引用，语义不变）。 */
const NO_COMMITTED_CALLS = [] as never[];

/** 锚点理由串（逐字常量）。 */
const NO_TOOL_REASON = "no_tool_committed";

/** 当前毫秒时刻（单点取样入口）。 */
const stampedNow = (): EpochMillis => Date.now();

/** 恢复编排的输入面。 */
export interface PartialRecoveryRequest {
  /** 流中断控制器（编排第一步 abort）。 */
  abortController: StreamAbort;
  /** 助手消息创建时刻。 */
  assistantCreatedAt: EpochMillis;
  /** 已丢弃的推理字节数。 */
  discardedReasoningBytes: ByteCount;
  /** 已丢弃的文本字节数。 */
  discardedTextBytes: ByteCount;
  /** 触发恢复的错误。 */
  error: Fault;
  /** 恢复事件的公共入参 + 模型。 */
  options: {
    assistantMessageId: AssistantId;
    failedRequestId?: RequestTag;
    model: SelectedModel;
    traceContext: TraceHandle;
  };
  /** 运行时端口面。 */
  runtime: RuntimePorts;
  /** 回合状态。 */
  state: LoopState;
  /** 回合 abort 监听（编排收尾时摘除）。 */
  turnAbortListener: AbortListener;
}

/** 部分输出失败恢复：返回是否进入恢复流程。 */
export async function recoverPartialAssistantOutputFailure(
  request: PartialRecoveryRequest,
): Promise<boolean> {
  const discardTotal = request.discardedReasoningBytes + request.discardedTextBytes;
  if (discardTotal <= 0 || !isRetryableFailure(request.error)) return false;

  request.abortController.abort();
  const attempt = beginStreamRecoveryAttempt(request.state);
  await deliverRecoveryStarted(
    request.runtime,
    request.state,
    request.options,
    request.error,
    attempt,
  );

  const { retryNumber } = attempt;
  const markerData: Record<string, unknown> = {};
  markerData.message = DISCARDED_MESSAGE;
  markerData.retryNumber = retryNumber;
  const marker = {} as { name: string; data?: Record<string, unknown> };
  marker.name = DISCARDED_ERROR_NAME;
  marker.data = markerData;
  await request.runtime.persistAssistantMessage(
    request.options.assistantMessageId,
    request.state.currentUserMessageId,
    request.assistantCreatedAt,
    {
      completed: stampedNow(),
      error: marker,
      finish: DISCARDED_FINISH,
    },
    request.options.traceContext,
    request.options.model,
  );

  request.state.modelResponse = "";
  request.state.modelStepCount += 1;
  recordModelHistoryRound(request.state);
  request.state.turnMachine = new TurnMachineImpl(
    request.state.turnMachine.receiveModelResponse(""),
  );
  request.state.turnMachine = new TurnMachineImpl(request.state.turnMachine.aggregateResults());

  await emitStreamRecoveryRetryEvents(request.runtime, request.state, request.options, {
    discardedReasoningBytes: request.discardedReasoningBytes,
    discardedTextBytes: request.discardedTextBytes,
    maxRetries: attempt.maxRetries,
    reason: NO_TOOL_REASON,
    retryNumber,
    toolCallIds: NO_COMMITTED_CALLS as never,
  });
  request.state.turnAbortSignal.removeEventListener("abort", request.turnAbortListener);
  return true;
}
