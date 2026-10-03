import type {
  ModelMessageContent,
  PendingTurnInput,
  SessionId,
  ToolCallId,
  TraceId,
  TurnId,
} from "@knorvia/contracts";
import type { ModelToolCall as ToolCall } from "@knorvia/contracts";
export type { ModelToolCall as ToolCall } from "@knorvia/contracts";
export declare const TurnPhase: {
  readonly Idle: "idle";
  readonly ProcessingInput: "processing_input";
  readonly AwaitingModelResponse: "awaiting_model_response";
  readonly Streaming: "streaming";
  readonly SchedulingTools: "scheduling_tools";
  readonly ExecutingTools: "executing_tools";
  readonly AggregatingResults: "aggregating_results";
  readonly AwaitingPermission: "awaiting_permission";
  readonly Completing: "completing";
  readonly Error: "error";
};
export type TurnPhase = (typeof TurnPhase)[keyof typeof TurnPhase];
export interface TurnState {
  id: TurnId;
  sessionId: SessionId;
  turnNumber: number;
  phase: TurnPhase;
  traceId: TraceId;
  input: string;
  attachments?: TurnAttachment[];
  modelRequest?: ModelRequestState;
  streamingContent: string;
  finalResponse?: string;
  toolCalls: ToolCallState[];
  toolResults: ToolResultState[];
  scheduledTools: ToolScheduleState;
  pendingInputs: PendingTurnInput[];
  acceptsPendingInput: boolean;
  pendingPermissions: PermissionRequestState[];
  resolvedPermissions: PermissionResultState[];
  resultType: TurnResultType;
  error?: TurnErrorState;
  startedAt: Date;
  completedAt?: Date;
}
export interface ModelRequestState {
  model: string;
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
  stopReason?: string;
  usage?: TokenUsageState;
}
export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: ModelMessageContent;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}
export interface TokenUsageState {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}
export interface ToolCallState {
  id: ToolCallId;
  name: string;
  input: unknown;
  status: ToolCallStateStatus;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: ToolResultState;
}
export type ToolCallStateStatus =
  | "scheduled"
  | "waiting_permission"
  | "permission_denied"
  | "running"
  | "completed"
  | "failed";
export interface ToolResultState {
  success: boolean;
  content: ModelMessageContent;
  error?: TurnErrorState;
}
export interface ToolScheduleState {
  items: ToolScheduleItem[];
  parallelGroups: ToolCallId[][];
  executionOrder: ToolCallId[];
}
export interface ToolScheduleItem {
  toolCallId: ToolCallId;
  dependencies: ToolCallId[];
  canRunParallel: boolean;
}
export interface PermissionRequestState {
  toolCallId: ToolCallId;
  toolName: string;
  riskLevel: string;
  requestedAt: Date;
}
export interface PermissionResultState {
  toolCallId: ToolCallId;
  decision: PermissionDecision;
  reason?: string;
  modifiedInput?: unknown;
  resolvedAt: Date;
}
export type PermissionDecision = "allow" | "deny" | "escalate" | "modify";
export type TurnResultType =
  | "success"
  | "cancelled"
  | "error_max_turns"
  | "error_max_budget"
  | "error_during_execution"
  | "error_max_tool_calls";
export interface TurnErrorState {
  type: string;
  message: string;
  recoverable: boolean;
}
export interface TurnAttachment {
  type: "file" | "image" | "video" | "pdf" | "url";
  path?: string;
  content?: string;
  sourceKind?: "clipboard-text";
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
}
export declare function createTurnState(
  id: TurnId,
  sessionId: SessionId,
  turnNumber: number,
  traceId: TraceId,
  input: string,
  attachments?: TurnAttachment[],
): TurnState;
export declare function isTerminalPhase(phase: TurnPhase): boolean;
export declare function isWaitingPhase(phase: TurnPhase): boolean;
export declare function canTransitionTo(current: TurnPhase, next: TurnPhase): boolean;
