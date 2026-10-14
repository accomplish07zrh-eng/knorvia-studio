// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 回合状态机：把一次 agent 回合的相位推进、工具调度、权限等待与结果聚合收在一个类里。
// 状态对象一律「先复制再改」，非法相位跳转统一抛 InvalidTurnPhase。
import {
  CoreErrorType,
  createCoreError,
  createTurnId,
  modelMessageContentToText,
  type ModelMessageContent,
  type PendingTurnInput,
  type SessionId,
  type ToolCallId,
  type TraceId,
  type TurnId,
} from "@knorvia/contracts";
import {
  TurnPhase,
  canTransitionTo,
  createTurnState,
  isTerminalPhase,
  type ModelRequestState,
  type PermissionDecision,
  type PermissionRequestState,
  type ToolCall,
  type ToolScheduleState,
  type TurnErrorState,
  type TurnResultType,
  type TurnState,
} from "./turn-state.js";
import {
  TurnCallStatus,
  beginToolCalls,
  decideToolCalls,
  finishToolCalls,
  scheduleToolCalls,
  waitForToolPermission,
} from "./turn-tool-projection.js";

export interface TurnMachine {
  state: TurnState;
  start(): TurnState;
  startModelRequest(model: string, messages: ModelRequestState["messages"]): TurnState;
  receiveModelResponse(content: string): TurnState;
  addStreamingContent(content: string): TurnState;
  scheduleTools(toolCalls: ToolCall[], schedule: ToolScheduleState): TurnState;
  startToolExecution(): TurnState;
  completeTool(
    toolCallId: ToolCallId,
    result: { success: boolean; content: ModelMessageContent },
  ): TurnState;
  queuePendingInput(input: PendingTurnInput): TurnState;
  drainPendingInputs(): { inputs: PendingTurnInput[]; state: TurnState };
  requestPermission(request: PermissionRequestState): TurnState;
  resolvePermission(
    toolCallId: ToolCallId,
    decision: PermissionDecision,
    modifiedInput?: unknown,
  ): TurnState;
  aggregateResults(): TurnState;
  complete(response: string, resultType?: TurnResultType): TurnState;
  fail(error: TurnErrorState): TurnState;
  getNextPhase(): TurnPhase;
  isComplete(): boolean;
}

/** 回合正常收尾时的结果类型。 */
const DEFAULT_RESULT_TYPE: TurnResultType = "success";

const TOOL_FAILURE_KIND = "tool_error";

/** 模型请求只允许从这两个相位发起。 */
const MODEL_ADMISSION_MESSAGE = "Must be in ProcessingInput or AggregatingResults phase";

type ToolResultEntry = TurnState["toolResults"][number];

type ResolvedPermissionEntry = TurnState["resolvedPermissions"][number];

/** 工具失败错误：消息取内容文本，标记为可恢复。 */
function toolFailureError(content: ModelMessageContent): TurnErrorState {
  const error = {} as TurnErrorState;
  error.type = TOOL_FAILURE_KIND;
  error.message = modelMessageContentToText(content) ?? "";
  error.recoverable = true;
  return error;
}

/** 工具结果记录：成功与否 + 内容 + 可选错误。 */
function toolResultEntry(
  success: boolean,
  content: ModelMessageContent,
  error: TurnErrorState | undefined,
): ToolResultEntry {
  const entry = {} as ToolResultEntry;
  entry.success = success;
  entry.content = content;
  entry.error = error;
  return entry;
}

/** 已解决的权限记录：保留调用 id、决定、可能的改写输入与解决时刻。 */
function resolvedPermissionEntry(
  toolCallId: ToolCallId,
  decision: PermissionDecision,
  modifiedInput: unknown,
): ResolvedPermissionEntry {
  const entry = {} as ResolvedPermissionEntry;
  entry.toolCallId = toolCallId;
  entry.decision = decision;
  entry.modifiedInput = modifiedInput;
  entry.resolvedAt = new Date();
  return entry;
}

export class TurnMachineImpl implements TurnMachine {
  constructor(public state: TurnState) {}

  static create(
    sessionId: SessionId,
    turnNumber: number,
    input: string,
    traceId?: TraceId,
    turnId?: TurnId,
  ): TurnMachineImpl {
    const state = createTurnState(
      turnId ?? createTurnId(),
      sessionId,
      turnNumber,
      traceId ?? (crypto.randomUUID() as TraceId),
      input,
    );
    return new TurnMachineImpl(state);
  }

  start(): TurnState {
    return this.advanceTo(TurnPhase.ProcessingInput);
  }

  startModelRequest(model: string, messages: ModelRequestState["messages"]): TurnState {
    const current = this.state.phase;
    const admitted =
      current === TurnPhase.ProcessingInput || current === TurnPhase.AggregatingResults;
    if (!admitted) {
      throw createCoreError(CoreErrorType.InvalidTurnPhase, MODEL_ADMISSION_MESSAGE, {
        context: { current },
        recoverable: true,
      });
    }
    const next = this.advanceTo(TurnPhase.AwaitingModelResponse);
    next.modelRequest = { model, messages };
    return next;
  }

  receiveModelResponse(content: string): TurnState {
    const next = this.advanceTo(TurnPhase.Streaming);
    next.streamingContent += content;
    return next;
  }

  addStreamingContent(content: string): TurnState {
    const next = this.advanceTo(TurnPhase.Streaming);
    next.streamingContent += content;
    return next;
  }

  scheduleTools(toolCalls: ToolCall[], schedule: ToolScheduleState): TurnState {
    const next = this.advanceTo(TurnPhase.SchedulingTools);
    next.toolCalls = scheduleToolCalls(toolCalls);
    next.scheduledTools = schedule;
    return next;
  }

  startToolExecution(): TurnState {
    const waiting = this.state.toolCalls.some((call) => call.status === TurnCallStatus.Waiting);
    const target = waiting ? TurnPhase.AwaitingPermission : TurnPhase.ExecutingTools;
    const next = this.advanceTo(target);
    next.toolCalls = beginToolCalls(this.state.toolCalls);
    return next;
  }

  completeTool(
    toolCallId: ToolCallId,
    result: { success: boolean; content: ModelMessageContent },
  ): TurnState {
    const error = result.success ? undefined : toolFailureError(result.content);
    const calls = finishToolCalls(this.state.toolCalls, toolCallId, result);
    const next = this.cloneState();
    next.toolCalls = calls;
    next.toolResults = [
      ...this.state.toolResults,
      toolResultEntry(result.success, result.content, error),
    ];
    return next;
  }

  queuePendingInput(input: PendingTurnInput): TurnState {
    const next = this.cloneState();
    next.pendingInputs = [...this.state.pendingInputs, input];
    return next;
  }

  drainPendingInputs(): { inputs: PendingTurnInput[]; state: TurnState } {
    const inputs = this.state.pendingInputs;
    const next = this.cloneState();
    next.pendingInputs = [];
    return { inputs, state: next };
  }

  requestPermission(request: PermissionRequestState): TurnState {
    const next = this.advanceTo(TurnPhase.AwaitingPermission);
    next.toolCalls = waitForToolPermission(this.state.toolCalls, request.toolCallId);
    next.pendingPermissions = [...this.state.pendingPermissions, request];
    return next;
  }

  resolvePermission(
    toolCallId: ToolCallId,
    decision: PermissionDecision,
    modifiedInput?: unknown,
  ): TurnState {
    const calls = decideToolCalls(this.state.toolCalls, toolCallId, decision, modifiedInput);
    const next = this.cloneState();
    next.toolCalls = calls;
    next.pendingPermissions = this.state.pendingPermissions.filter(
      (request) => request.toolCallId !== toolCallId,
    );
    next.resolvedPermissions = [
      ...this.state.resolvedPermissions,
      resolvedPermissionEntry(toolCallId, decision, modifiedInput),
    ];
    return next;
  }

  aggregateResults(): TurnState {
    return this.advanceTo(TurnPhase.AggregatingResults);
  }

  complete(response: string, resultType: TurnResultType = DEFAULT_RESULT_TYPE): TurnState {
    const next = this.advanceTo(TurnPhase.Completing);
    next.finalResponse = response;
    next.resultType = resultType;
    next.completedAt = new Date();
    return next;
  }

  fail(error: TurnErrorState): TurnState {
    const next = this.cloneState();
    next.phase = TurnPhase.Error;
    next.error = error;
    next.completedAt = new Date();
    return next;
  }

  getNextPhase(): TurnPhase {
    const { phase, toolCalls, streamingContent } = this.state;
    if (phase === TurnPhase.Streaming) {
      if (toolCalls.length !== 0) return TurnPhase.SchedulingTools;
      return streamingContent ? TurnPhase.Completing : phase;
    }
    if (phase === TurnPhase.ExecutingTools) {
      const unsettled = toolCalls.some(
        (call) => call.status === TurnCallStatus.Running || call.status === TurnCallStatus.Waiting,
      );
      return unsettled ? phase : TurnPhase.AggregatingResults;
    }
    if (phase === TurnPhase.AggregatingResults) {
      const failed = toolCalls.some(
        (call) => call.status === TurnCallStatus.Failed || call.status === TurnCallStatus.Denied,
      );
      return failed ? TurnPhase.Completing : TurnPhase.AwaitingModelResponse;
    }
    return phase;
  }

  isComplete(): boolean {
    return isTerminalPhase(this.state.phase);
  }

  private cloneState(): TurnState {
    return { ...this.state };
  }

  private advanceTo(target: TurnPhase): TurnState {
    const current = this.state.phase;
    if (!canTransitionTo(current, target)) {
      throw createCoreError(
        CoreErrorType.InvalidTurnPhase,
        `Cannot transition from ${current} to ${target}`,
        { context: { current, target }, recoverable: true },
      );
    }
    const next = this.cloneState();
    next.phase = target;
    return next;
  }
}
