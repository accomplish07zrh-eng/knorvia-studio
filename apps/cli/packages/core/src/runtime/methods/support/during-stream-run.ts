// SPDX-License-Identifier: Apache-2.0
// 流中工具执行管线：pending 分部 → 账本 tool_call_closed → 调度 → 账本 tool_queued →
// 执行（onBatchStart 里改写 running 分部 → 账本 tool_started）。单工具内部严格顺序，
// 账本与持久化的交错次序是契约；不同工具之间由协调器并发。
import { createPartId } from "../../deps.js";
import type {
  MessageId,
  Model,
  ModelToolCall,
  ToolCall,
  ToolCallId,
  TraceContext,
} from "../../deps.js";
import {
  emitStreamingToolLedgerUpdate,
  requireRuntimeToolCallName,
  throwIfTurnAborted,
  toRecordInput,
} from "../../helpers/index.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { StreamedToolExecutionResult } from "../../types.js";
import { mcpToolPartMetadata } from "../tool-part-metadata.js";
import { persistPendingToolPart } from "../tool-part-persistence.js";
import {
  isAutomationMutationRestrictedTurn,
  isOffPeakCreateRestrictedTurn,
  type RegularTurnLoopState,
} from "../turn-loop-state.js";

/** 助手消息标识（短别名）。 */
type AssistantId = MessageId;

/** 声明序号（短别名）。 */
type DeclarationOrdinal = number;

/** 已选模型（短别名）。 */
type SelectedModel = Model;

/** 流中断信号（短别名）。 */
type StreamSignal = AbortSignal;

/** 追踪上下文句柄（短别名）。 */
type TraceHandle = TraceContext;

/** 运行时端口面（短别名）。 */
type RuntimePorts = AgentRuntimeInternal;

/** 回合循环状态（短别名）。 */
type LoopState = RegularTurnLoopState;

/** 可能缺席的流中结果。 */
type MaybeStreamed = StreamedToolExecutionResult | undefined;

/** 名字校验的来源标记（逐字常量）。 */
const NAME_CHECK_SOURCE = "streamingToolCoordinator.executeDuringStream";

/** 账本状态与分部形态常量（逐字）。 */
const CLOSED_LEDGER_STATUS = "tool_call_closed";
const QUEUED_LEDGER_STATUS = "tool_queued";
const STARTED_LEDGER_STATUS = "tool_started";
const DURING_STREAM_TIMING = "during_stream";
const TOOL_PART_TYPE = "tool";
const RUNNING_PART_STATUS = "running";

/** 账本状态取值面（三个已定义状态的并集）。 */
type LedgerStatus =
  | typeof CLOSED_LEDGER_STATUS
  | typeof QUEUED_LEDGER_STATUS
  | typeof STARTED_LEDGER_STATUS;

/** 当前毫秒时刻（单点取样入口）。 */
const clockNow = (): number => Date.now();

/** 流中执行的入参。 */
export interface DuringStreamRunOptions {
  /** 助手消息 id。 */
  assistantMessageId: AssistantId;
  /** 声明登记序号。 */
  declarationIndex: DeclarationOrdinal;
  /** 已绑定模型。 */
  model: SelectedModel;
  /** 流中断信号。 */
  signal: StreamSignal;
  /** 追踪上下文。 */
  traceContext: TraceHandle;
}

/** 一次流中执行的请求面。 */
export interface DuringStreamRunRequest {
  /** 运行时端口面。 */
  runtime: RuntimePorts;
  /** 回合状态。 */
  state: LoopState;
  /** 声明的工具调用。 */
  declaration: ModelToolCall;
  /** 执行选项。 */
  options: DuringStreamRunOptions;
}

/** 执行一条流中工具：返回首条结果的包装，批次无结果回 undefined。 */
export async function runDuringStreamTool(request: DuringStreamRunRequest): Promise<MaybeStreamed> {
  const { declaration, state } = request;
  const { assistantMessageId, declarationIndex, model, signal, traceContext } = request.options;
  const ports = request.runtime;
  const {
    executeTools: executeBatch,
    emitToolScheduledEvents: announceScheduling,
    logger,
    persistPart: persist,
    registry,
    scheduleTools: planScheduling,
    sessionId,
  } = ports;
  const { turnAbortSignal } = state;
  const sink = state.events;
  const { subagentModelOverride } = state;
  const loopModel = state.model;
  const automationTurn = isAutomationMutationRestrictedTurn(state);
  const offPeakTurn = isOffPeakCreateRestrictedTurn(state);

  // 步骤一：回合已中止就立即退出（取消判定先于一切持久化）。
  throwIfTurnAborted(turnAbortSignal);
  const runtimeToolName = requireRuntimeToolCallName(declaration, {
    logger,
    model,
    source: NAME_CHECK_SOURCE,
    traceContext,
  });

  const batchCall = {} as ToolCall;
  batchCall.id = declaration.id as ToolCallId;
  batchCall.input = declaration.input;
  batchCall.name = runtimeToolName;
  const callIdentity = batchCall.id;

  const partRef = createPartId();
  const recordForm = toRecordInput(batchCall.input);
  const partMetadata = mcpToolPartMetadata(registry.getMetadata(runtimeToolName)?.mcpPresentation);

  // 账本投递（状态与时机取自常量表）。
  const postLedger = (
    status: LedgerStatus,
    extra: Record<string, unknown> = {},
  ): Promise<unknown> =>
    emitStreamingToolLedgerUpdate(ports, sink, traceContext, {
      assistantMessageId,
      toolCall: batchCall,
      status,
      input: recordForm,
      executionTiming: DURING_STREAM_TIMING,
      ...extra,
    });

  // 步骤二：pending 工具分部先落盘。
  await persistPendingToolPart(ports, {
    assistantMessageId,
    declarationIndex,
    input: recordForm,
    partID: partRef,
    toolCall: batchCall,
    traceContext,
    metadata: partMetadata,
    model,
  });

  // 步骤三：账本记 tool_call_closed（输入已封口）。
  await postLedger(CLOSED_LEDGER_STATUS);

  // 步骤四：调度 + 调度事件入数组。
  const schedule = await planScheduling([batchCall]);
  const scheduledEvents = await announceScheduling(
    [batchCall],
    schedule,
    assistantMessageId,
    traceContext,
  );
  sink.push(...scheduledEvents);

  // 步骤五：账本记 tool_queued。
  await postLedger(QUEUED_LEDGER_STATUS);

  // 步骤六：执行；onBatchStart 先改写 running 分部再记 tool_started。
  const execution = await executeBatch([batchCall], schedule, {
    subagentModelOverride,
    model: loopModel,
    automationTurn,
    offPeakTurn,
    signal,
    traceContext,
    onBatchStart: async () => {
      const batchStart = clockNow();
      await persist(
        {
          id: partRef,
          sessionID: sessionId,
          messageID: assistantMessageId,
          type: TOOL_PART_TYPE,
          callID: callIdentity,
          declarationIndex,
          tool: runtimeToolName,
          state: {
            status: RUNNING_PART_STATUS,
            input: recordForm,
            title: runtimeToolName,
            metadata: partMetadata ?? {},
            time: { start: batchStart },
          },
        },
        traceContext,
      );
      await postLedger(STARTED_LEDGER_STATUS, { startedAt: new Date(batchStart) });
    },
  });

  // 步骤七：批次事件入数组；首条结果包装返回。
  sink.push(...execution.events);
  const first = execution.results[0];
  if (first === undefined) return undefined;
  return {
    input: recordForm,
    ledgerRecorded: true,
    partID: partRef,
    result: first,
    toolCallId: callIdentity as ToolCallId,
  };
}
