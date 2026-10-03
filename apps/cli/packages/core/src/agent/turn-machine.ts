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

const SUCCESS_RESULT: TurnResultType = "success";
const TOOL_ERROR_TYPE = "tool_error";
const MODEL_ADMISSION_MESSAGE = "Must be in ProcessingInput or AggregatingResults phase";

export class TurnMachineImpl implements TurnMachine {
  constructor(public state: TurnState) {}

  static create(
    sessionId: SessionId,
    turnNumber: number,
    input: string,
    traceId?: TraceId,
    turnId?: TurnId,
  ): TurnMachineImpl {
    const id = turnId ?? createTurnId();
    const trace = traceId ?? (crypto.randomUUID() as TraceId);
    return new TurnMachineImpl(createTurnState(id, sessionId, turnNumber, trace, input));
  }

  start(): TurnState {
    return this.atPhase(TurnPhase.ProcessingInput);
  }

  startModelRequest(model: string, messages: ModelRequestState["messages"]): TurnState {
    const current = this.state.phase;
    if (current !== TurnPhase.ProcessingInput && current !== TurnPhase.AggregatingResults) {
      throw createCoreError(CoreErrorType.InvalidTurnPhase, MODEL_ADMISSION_MESSAGE, {
        context: { current },
        recoverable: true,
      });
    }
    const next = this.atPhase(TurnPhase.AwaitingModelResponse);
    next.modelRequest = { model, messages };
    return next;
  }

  receiveModelResponse(content: string): TurnState {
    const next = this.atPhase(TurnPhase.Streaming);
    next.streamingContent += content;
    return next;
  }

  addStreamingContent(content: string): TurnState {
    const next = this.atPhase(TurnPhase.Streaming);
    next.streamingContent += content;
    return next;
  }

  scheduleTools(toolCalls: ToolCall[], schedule: ToolScheduleState): TurnState {
    const next = this.atPhase(TurnPhase.SchedulingTools);
    next.toolCalls = scheduleToolCalls(toolCalls);
    next.scheduledTools = schedule;
    return next;
  }

  startToolExecution(): TurnState {
    const waiting = this.state.toolCalls.some((call) => call.status === TurnCallStatus.Waiting);
    const next = this.atPhase(waiting ? TurnPhase.AwaitingPermission : TurnPhase.ExecutingTools);
    next.toolCalls = beginToolCalls(this.state.toolCalls);
    return next;
  }

  completeTool(
    toolCallId: ToolCallId,
    result: { success: boolean; content: ModelMessageContent },
  ): TurnState {
    const error = result.success
      ? undefined
      : {
          type: TOOL_ERROR_TYPE,
          message: modelMessageContentToText(result.content) ?? "",
          recoverable: true,
        };
    const calls = finishToolCalls(this.state.toolCalls, toolCallId, result);
    const next = this.project();
    next.toolCalls = calls;
    next.toolResults = Array.from(this.state.toolResults);
    next.toolResults.push({
      success: result.success,
      content: result.content,
      error,
    });
    return next;
  }

  queuePendingInput(input: PendingTurnInput): TurnState {
    const next = this.project();
    next.pendingInputs = Array.from(this.state.pendingInputs);
    next.pendingInputs.push(input);
    return next;
  }

  drainPendingInputs(): { inputs: PendingTurnInput[]; state: TurnState } {
    const inputs = this.state.pendingInputs;
    const next = this.project();
    next.pendingInputs = [];
    return { inputs, state: next };
  }

  requestPermission(request: PermissionRequestState): TurnState {
    const next = this.atPhase(TurnPhase.AwaitingPermission);
    next.toolCalls = waitForToolPermission(this.state.toolCalls, request.toolCallId);
    next.pendingPermissions = Array.from(this.state.pendingPermissions);
    next.pendingPermissions.push(request);
    return next;
  }

  resolvePermission(
    toolCallId: ToolCallId,
    decision: PermissionDecision,
    modifiedInput?: unknown,
  ): TurnState {
    const calls = decideToolCalls(this.state.toolCalls, toolCallId, decision, modifiedInput);
    const next = this.project();
    next.toolCalls = calls;
    const pending: PermissionRequestState[] = [];
    this.state.pendingPermissions.forEach((request) => {
      if (request.toolCallId !== toolCallId) pending.push(request);
    });
    next.pendingPermissions = pending;
    next.resolvedPermissions = Array.from(this.state.resolvedPermissions);
    next.resolvedPermissions.push({
      toolCallId,
      decision,
      modifiedInput,
      resolvedAt: new Date(),
    });
    return next;
  }

  aggregateResults(): TurnState {
    return this.atPhase(TurnPhase.AggregatingResults);
  }

  complete(response: string, resultType: TurnResultType = SUCCESS_RESULT): TurnState {
    const next = this.atPhase(TurnPhase.Completing);
    next.finalResponse = response;
    next.resultType = resultType;
    next.completedAt = new Date();
    return next;
  }

  fail(error: TurnErrorState): TurnState {
    const next = this.project();
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
      let unsettled = false;
      toolCalls.forEach((call) => {
        if (call.status === TurnCallStatus.Running || call.status === TurnCallStatus.Waiting) {
          unsettled = true;
        }
      });
      return unsettled ? phase : TurnPhase.AggregatingResults;
    }
    if (phase === TurnPhase.AggregatingResults) {
      let failed = false;
      toolCalls.forEach((call) => {
        if (call.status === TurnCallStatus.Failed || call.status === TurnCallStatus.Denied) {
          failed = true;
        }
      });
      return failed ? TurnPhase.Completing : TurnPhase.AwaitingModelResponse;
    }
    return phase;
  }

  isComplete(): boolean {
    return isTerminalPhase(this.state.phase);
  }

  private project(): TurnState {
    return { ...this.state };
  }

  private atPhase(target: TurnPhase): TurnState {
    const current = this.state.phase;
    if (!canTransitionTo(current, target)) {
      throw createCoreError(
        CoreErrorType.InvalidTurnPhase,
        `Cannot transition from ${current} to ${target}`,
        { context: { current, target }, recoverable: true },
      );
    }
    const next = this.project();
    next.phase = target;
    return next;
  }
}
