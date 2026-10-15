// SPDX-License-Identifier: Apache-2.0
// 合成工具结果：恢复流程为未出结果的声明补一条「失败但确定」的假结果，让补执行表与声明表
// 等长同序。两段固定文案区分「没执行过」与「执行状态未知」，事件通道只发错误事件。
import { SessionEventType, createPartId } from "../../deps.js";
import type {
  ModelToolCall,
  SessionEvent,
  ToolCallId,
  ToolExecutionResult,
  TraceContext,
} from "../../deps.js";
import { toRecordInput } from "../../helpers/index.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { StreamedToolExecutionResult } from "../../types.js";

/** 声明的工具调用（短别名）。 */
type DeclaredCall = ModelToolCall;

/** 合成结果（短别名）。 */
type StreamedOutcome = StreamedToolExecutionResult;

/** 运行时端口面（短别名）。 */
type RuntimePorts = AgentRuntimeInternal;

/** 追踪上下文句柄（短别名）。 */
type TraceHandle = TraceContext;

/** 合成错误类型（逐字常量）。 */
const SYNTHETIC_ERROR_TYPE = "stream_recovery_interrupted_tool";

/** 没执行过的固定文案（逐字；分段拼接仅为排版，取值不变）。 */
const NOT_EXECUTED_MESSAGE =
  "Tool execution was interrupted during streaming recovery before this tool was executed. " +
  "Treat this tool call as failed and do not retry blindly.";

/** 执行状态未知的固定文案（逐字；分段拼接仅为排版，取值不变）。 */
const UNKNOWN_STATE_MESSAGE =
  "Tool execution was interrupted during streaming recovery before a result was committed. " +
  "Side effects may be unknown; inspect current state before retrying.";

/** 合成理由。 */
export type SyntheticReason = "not_executed" | "unknown_execution_state";

/** 造一条合成结果：成功=false、零耗时、同刻起止，错误类型固定。 */
export function buildSyntheticStreamedToolResult(
  toolCall: DeclaredCall,
  reason: SyntheticReason,
): StreamedOutcome {
  const stamped = new Date();
  const message = reason === "not_executed" ? NOT_EXECUTED_MESSAGE : UNKNOWN_STATE_MESSAGE;
  const result = {} as ToolExecutionResult;
  result.toolCallId = toolCall.id;
  result.toolName = toolCall.name;
  result.success = false;
  result.output = null;
  result.modelContent = message;
  result.durationMs = 0;
  result.startedAt = stamped;
  result.completedAt = stamped;
  result.error = { type: SYNTHETIC_ERROR_TYPE, message };
  const outcome = {} as StreamedOutcome;
  outcome.input = toRecordInput(toolCall.input);
  outcome.ledgerRecorded = false;
  outcome.partID = createPartId();
  outcome.result = result;
  outcome.toolCallId = toolCall.id as ToolCallId;
  return outcome;
}

/** 合成错误事件的投递入参。 */
export interface SyntheticErrorDelivery {
  /** 事件数组（append 完成后才压入）。 */
  events: SessionEvent[];
  /** 合成结果（含错误）。 */
  result: ToolExecutionResult;
  /** 运行时端口面。 */
  runtime: RuntimePorts;
  /** 追踪上下文。 */
  traceContext: TraceHandle;
}

/** 发合成工具的错误事件：无错误直接返回；append 完成才入事件数组。 */
export async function deliverSyntheticStreamedToolError(
  delivery: SyntheticErrorDelivery,
): Promise<void> {
  const failure = delivery.result.error;
  if (failure === undefined) return;
  const event = delivery.runtime.createEvent(
    SessionEventType.ToolCallError,
    {
      toolCallId: delivery.result.toolCallId as ToolCallId,
      error: failure,
    },
    delivery.traceContext,
  );
  await delivery.runtime.appendEvent(event, delivery.traceContext);
  delivery.events.push(event);
}
