// 回合状态与回合状态机的类型定义。
// 这里只放类型、常量与状态工厂；状态机的推进逻辑不在此模块。

import type {
  ModelMessageContent,
  PendingTurnInput,
  SessionId,
  ToolCallId,
  TraceId,
  TurnId,
} from "@knorvia/contracts";
import type { ModelToolCall as ToolCall } from "@knorvia/contracts";

// Re-export ToolCall for consumers of this module
export type { ModelToolCall as ToolCall } from "@knorvia/contracts";

// Note: ModelMessage is defined locally to avoid conflicts with contracts' ModelMessage
// which uses ToolCallPayload[] instead of ModelToolCall[]

// ── 回合阶段 ──

export const TurnPhase = {
  Idle: "idle",
  ProcessingInput: "processing_input",
  AwaitingModelResponse: "awaiting_model_response",
  Streaming: "streaming",
  SchedulingTools: "scheduling_tools",
  ExecutingTools: "executing_tools",
  AggregatingResults: "aggregating_results",
  AwaitingPermission: "awaiting_permission",
  Completing: "completing",
  Error: "error",
} as const;

export type TurnPhase = (typeof TurnPhase)[keyof typeof TurnPhase];

// ── 回合状态 ──

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

// ── 子状态 ──

export interface ModelRequestState {
  model: string;
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
  stopReason?: string;
  usage?: TokenUsageState;
}

// ModelMessage for turn state - uses ToolCall from contracts
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
  // "cancelled": 用户主动中断（TurnCancelled）属于正常结束，复用 TurnComplete 上报而非 TurnError。
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
  /** clipboard-text 是 UI 长粘贴落盘生成的临时附件，模型请求中只保留路径引用。 */
  sourceKind?: "clipboard-text";
  // 展示元信息（协议边界保真透传，TurnStarted 事件/v4 投影展示用；
  // 缺省时由 basename/扩展名推断兜底）。不参与内容解析。
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
}

// ── 回合状态工厂 ──

export function createTurnState(
  id: TurnId,
  sessionId: SessionId,
  turnNumber: number,
  traceId: TraceId,
  input: string,
  attachments?: TurnAttachment[],
): TurnState {
  // 初始状态：身份与输入照搬，其余字段是「尚未开始」的空值。
  const state = {} as TurnState;
  state.id = id;
  state.sessionId = sessionId;
  state.turnNumber = turnNumber;
  state.phase = TurnPhase.Idle;
  state.traceId = traceId;
  state.input = input;
  state.attachments = attachments;
  state.streamingContent = "";
  state.toolCalls = [];
  state.toolResults = [];
  state.scheduledTools = { items: [], parallelGroups: [], executionOrder: [] };
  state.pendingInputs = [];
  state.acceptsPendingInput = true;
  state.pendingPermissions = [];
  state.resolvedPermissions = [];
  state.resultType = "success";
  state.startedAt = new Date();
  return state;
}

// ── 阶段谓词 ──

// 终态阶段：回合已结束，不会再推进。
const TERMINAL_PHASES: readonly TurnPhase[] = [TurnPhase.Completing, TurnPhase.Error];
// 等待阶段：回合还在进行，但当前在等外部（模型 / 权限 / 工具）返回。
const WAITING_PHASES: readonly TurnPhase[] = [
  TurnPhase.AwaitingModelResponse,
  TurnPhase.AwaitingPermission,
  TurnPhase.ExecutingTools,
];

export function isTerminalPhase(phase: TurnPhase): boolean {
  return TERMINAL_PHASES.includes(phase);
}

export function isWaitingPhase(phase: TurnPhase): boolean {
  return WAITING_PHASES.includes(phase);
}

export function canTransitionTo(current: TurnPhase, next: TurnPhase): boolean {
  const validTransitions: Record<TurnPhase, TurnPhase[]> = {
    [TurnPhase.Idle]: [TurnPhase.ProcessingInput],
    [TurnPhase.ProcessingInput]: [TurnPhase.AwaitingModelResponse, TurnPhase.Completing],
    [TurnPhase.AwaitingModelResponse]: [TurnPhase.Streaming, TurnPhase.Completing, TurnPhase.Error],
    [TurnPhase.Streaming]: [
      TurnPhase.SchedulingTools,
      TurnPhase.AggregatingResults,
      TurnPhase.Completing,
      TurnPhase.Error,
    ],
    [TurnPhase.SchedulingTools]: [
      TurnPhase.ExecutingTools,
      TurnPhase.AwaitingPermission,
      TurnPhase.Error,
    ],
    [TurnPhase.ExecutingTools]: [
      TurnPhase.AggregatingResults,
      TurnPhase.AwaitingPermission,
      TurnPhase.Error,
    ],
    [TurnPhase.AggregatingResults]: [
      TurnPhase.AwaitingModelResponse,
      TurnPhase.SchedulingTools,
      TurnPhase.Completing,
      TurnPhase.Error,
    ],
    [TurnPhase.AwaitingPermission]: [TurnPhase.ExecutingTools, TurnPhase.Error],
    [TurnPhase.Completing]: [TurnPhase.Idle],
    [TurnPhase.Error]: [TurnPhase.Idle],
  };

  return validTransitions[current]?.includes(next) ?? false;
}
