import {
  CoreErrorType,
  createCoreError,
  createTurnId,
  modelMessageContentToText,
} from "@knorvia/contracts";
import type {
  ModelMessageContent,
  PendingTurnInput,
  SessionId,
  ToolCallId,
  TraceId,
  TurnId,
} from "@knorvia/contracts";
import {
  TurnPhase,
  canTransitionTo,
  createTurnState,
  isTerminalPhase,
} from "./turn-state.js";
import type {
  ModelRequestState,
  PermissionDecision,
  PermissionRequestState,
  ToolCall,
  ToolScheduleState,
  TurnErrorState,
  TurnResultType,
  TurnState,
} from "./turn-state.js";

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
    const resolvedTraceId = traceId ?? (crypto.randomUUID() as TraceId);
    return new TurnMachineImpl(
      createTurnState(id, sessionId, turnNumber, resolvedTraceId, input),
    );
  }

  private transitionTo(target: TurnPhase): TurnState {
    const current = this.state.phase;
    if (!canTransitionTo(current, target)) {
      throw createCoreError(
        CoreErrorType.InvalidTurnPhase,
        `Cannot transition from ${current} to ${target}`,
        { context: { current, target }, recoverable: true },
      );
    }
    return { ...this.state, phase: target };
  }

  start(): TurnState {
    return this.transitionTo(TurnPhase.ProcessingInput);
  }

  startModelRequest(model: string, messages: ModelRequestState["messages"]): TurnState {
    const current = this.state.phase;
    if (
      current !== TurnPhase.ProcessingInput &&
      current !== TurnPhase.AggregatingResults
    ) {
      throw createCoreError(
        CoreErrorType.InvalidTurnPhase,
        "Must be in ProcessingInput or AggregatingResults phase",
        { context: { current }, recoverable: true },
      );
    }
    const state = this.transitionTo(TurnPhase.AwaitingModelResponse);
    return { ...state, modelRequest: { model, messages } };
  }

  receiveModelResponse(content: string): TurnState {
    const state = this.transitionTo(TurnPhase.Streaming);
    return { ...state, streamingContent: state.streamingContent + content };
  }

  addStreamingContent(content: string): TurnState {
    const state = this.transitionTo(TurnPhase.Streaming);
    return { ...state, streamingContent: state.streamingContent + content };
  }

  scheduleTools(toolCalls: ToolCall[], schedule: ToolScheduleState): TurnState {
    const state = this.transitionTo(TurnPhase.SchedulingTools);
    return {
      ...state,
      toolCalls: toolCalls.map((call) => ({
        id: call.id,
        name: call.name,
        input: call.input,
        status: "scheduled",
        scheduledAt: new Date(),
      })),
      scheduledTools: schedule,
    };
  }

  startToolExecution(): TurnState {
    const target = this.state.toolCalls.some((call) => call.status === "waiting_permission")
      ? TurnPhase.AwaitingPermission
      : TurnPhase.ExecutingTools;
    const state = this.transitionTo(target);
    return {
      ...state,
      toolCalls: state.toolCalls.map((call) => ({
        ...call,
        status: call.status === "waiting_permission" ? call.status : "running",
        startedAt: call.status === "waiting_permission" ? call.startedAt : new Date(),
      })),
    };
  }

  completeTool(
    toolCallId: ToolCallId,
    result: { success: boolean; content: ModelMessageContent },
  ): TurnState {
    const { success, content } = result;
    const error = success
      ? undefined
      : {
          type: "tool_error",
          message: modelMessageContentToText(content) ?? "",
          recoverable: true,
        };
    return {
      ...this.state,
      toolCalls: this.state.toolCalls.map((call) =>
        call.id === toolCallId
          ? {
              ...call,
              status: success ? "completed" : "failed",
              completedAt: new Date(),
              result: { success, content },
            }
          : call,
      ),
      toolResults: [...this.state.toolResults, { success, content, error }],
    };
  }

  queuePendingInput(input: PendingTurnInput): TurnState {
    return { ...this.state, pendingInputs: [...this.state.pendingInputs, input] };
  }

  drainPendingInputs(): { inputs: PendingTurnInput[]; state: TurnState } {
    return {
      inputs: this.state.pendingInputs,
      state: { ...this.state, pendingInputs: [] },
    };
  }

  requestPermission(request: PermissionRequestState): TurnState {
    const state = this.transitionTo(TurnPhase.AwaitingPermission);
    return {
      ...state,
      toolCalls: state.toolCalls.map((call) =>
        call.id === request.toolCallId ? { ...call, status: "waiting_permission" } : call,
      ),
      pendingPermissions: [...state.pendingPermissions, request],
    };
  }

  resolvePermission(
    toolCallId: ToolCallId,
    decision: PermissionDecision,
    modifiedInput?: unknown,
  ): TurnState {
    return {
      ...this.state,
      toolCalls: this.state.toolCalls.map((call) =>
        call.id === toolCallId
          ? {
              ...call,
              status: decision === "deny" ? "permission_denied" : call.status,
              input: modifiedInput ?? call.input,
            }
          : call,
      ),
      pendingPermissions: this.state.pendingPermissions.filter(
        (request) => request.toolCallId !== toolCallId,
      ),
      resolvedPermissions: [
        ...this.state.resolvedPermissions,
        { toolCallId, decision, modifiedInput, resolvedAt: new Date() },
      ],
    };
  }

  aggregateResults(): TurnState {
    return this.transitionTo(TurnPhase.AggregatingResults);
  }

  complete(response: string, resultType: TurnResultType = "success"): TurnState {
    const state = this.transitionTo(TurnPhase.Completing);
    return { ...state, finalResponse: response, resultType, completedAt: new Date() };
  }

  fail(error: TurnErrorState): TurnState {
    return { ...this.state, phase: TurnPhase.Error, error, completedAt: new Date() };
  }

  getNextPhase(): TurnPhase {
    const { phase, toolCalls, streamingContent } = this.state;
    if (phase === TurnPhase.Streaming) {
      if (toolCalls.length > 0) return TurnPhase.SchedulingTools;
      if (streamingContent) return TurnPhase.Completing;
    } else if (phase === TurnPhase.ExecutingTools) {
      if (
        !toolCalls.some(
          (call) => call.status === "running" || call.status === "waiting_permission",
        )
      ) {
        return TurnPhase.AggregatingResults;
      }
    } else if (phase === TurnPhase.AggregatingResults) {
      return toolCalls.some(
        (call) => call.status === "failed" || call.status === "permission_denied",
      )
        ? TurnPhase.Completing
        : TurnPhase.AwaitingModelResponse;
    }
    return phase;
  }

  isComplete(): boolean {
    return isTerminalPhase(this.state.phase);
  }
}
