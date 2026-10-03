import type {
  TurnState,
  TurnPhase,
  ToolCall,
  ToolScheduleState,
  PermissionRequestState,
  PermissionDecision,
  TurnResultType,
  TurnErrorState,
  ModelRequestState,
} from "./turn-state.js";
import type {
  ModelMessageContent,
  SessionId,
  TraceId,
  ToolCallId,
  TurnId,
} from "@knorvia/contracts";
import type { PendingTurnInput } from "@knorvia/contracts";
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
    result: {
      success: boolean;
      content: ModelMessageContent;
    },
  ): TurnState;
  queuePendingInput(input: PendingTurnInput): TurnState;
  drainPendingInputs(): {
    inputs: PendingTurnInput[];
    state: TurnState;
  };
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
export declare class TurnMachineImpl implements TurnMachine {
  state: TurnState;
  constructor(state: TurnState);
  static create(
    sessionId: SessionId,
    turnNumber: number,
    input: string,
    traceId?: TraceId,
    turnId?: TurnId,
  ): TurnMachineImpl;
  start(): TurnState;
  startModelRequest(model: string, messages: ModelRequestState["messages"]): TurnState;
  receiveModelResponse(content: string): TurnState;
  addStreamingContent(content: string): TurnState;
  scheduleTools(toolCalls: ToolCall[], schedule: ToolScheduleState): TurnState;
  startToolExecution(): TurnState;
  completeTool(
    toolCallId: ToolCallId,
    result: {
      success: boolean;
      content: ModelMessageContent;
    },
  ): TurnState;
  queuePendingInput(input: PendingTurnInput): TurnState;
  drainPendingInputs(): {
    inputs: PendingTurnInput[];
    state: TurnState;
  };
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
