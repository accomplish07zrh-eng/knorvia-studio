// SPDX-License-Identifier: Apache-2.0
// 会话域端口与投影契约：宿主、CLI 运行时、桌面端与 TUI 只通过这里交换会话状态，不接触具体实现。
// 声明按领域分组：生命周期枚举 → 输入投递 → 权限与工具 → 后台任务 → 事件存储 → 投影快照 → 会话管理器。

import type { CompactProjectionInfo } from "../compact/index.js";
import type { ErrorAttribution, SessionEvent } from "../events/session.events.js";
import type {
  StreamRecoveryAnchorProjectionInfo,
  StreamingToolLedgerProjectionInfo,
} from "../events/stream-recovery.events.js";
import type { ModelSelection } from "../model/model.js";
import type { CheckpointProjectionInfo, RewindProjectionInfo } from "../rewind/index.js";
import type { GoalCompletionVerificationOutput, SessionGoal } from "../tools/target.js";
import type { ToolResultDisplayPayload } from "../tools/tool-result-metadata.js";
import type { TraceContext } from "../tracing/tracer.js";
import type { PermissionOptionsPolicy, PermissionUpdate } from "./permission.port.js";
import type { RuntimeInputPresentation } from "./runtime-input-presentation.js";
import type {
  InteractionRequestOrigin,
  MessageId,
  QueryId,
  SessionId,
  TraceId,
  TurnId,
} from "./shared.js";

// === 一、会话生命周期与协作模式：决定会话怎么跑、处于哪个阶段、单次操作的风险等级 ===

/** 会话的协作模式，由用户或上层产品选择，决定计划审批、编辑范围等行为分支。 */
export type CollaborationMode = "plan" | "build" | "edit" | "yolo" | "auto";

/** 会话在生命周期中的状态；由会话运行时维护，是投影里对外可见的权威状态。 */
export type SessionStatus = "idle" | "running" | "waiting" | "paused" | "completed" | "error";

/** 一次操作的风险等级，权限系统据此决定是否需要用户确认以及提示口径。 */
export type RiskLevel = "low" | "medium" | "high" | "critical";

/** 输入进入会话的方式：自动判断、明确开启新一轮，或投递给进行中的轮次。 */
export type InputDelivery = "auto" | "start_turn" | "steer_active_turn";

// === 二、输入投递与轮次引导：排队/引导输入的语义、准入时固定的意图元数据、排队项快照 ===

/** 排队或引导输入承载的命令种类，用于区分普通文本、目标命令与紧凑操作。 */
export type TurnSteerCommandKind = "sendText" | "sendGoalCommand" | "compact";

/** 排队输入的来源场景，便于产品侧区分计划审批反馈与工作流细化反馈。 */
export type TurnSteerSource = "plan_approval_feedback" | "workflow_refine_feedback";

/** 排队输入的投递方式："guide" 视为对当前工作的补充，注入进行中的轮次，不另开一轮； "queue" 视为独立意图，等当前轮次收尾后单独开启新一轮，拥有各自的回复与改动范围。 两者在运行时的注入时机相同，区别体现在产品呈现与账本记账上。 */
export type TurnSteerDeliveryMode = "guide" | "queue";

/** 排队输入被拒的原因；由会话运行时判定，调用方据此给出可操作提示。 */
export type TurnSteerRejectReason =
  | "no_active_turn"
  | "expected_turn_mismatch"
  | "turn_not_steerable"
  | "empty_input"
  | "input_too_large";

/** 一次输入投递请求。 输入本体、轮次约束、呈现信息与追踪/工具边界分开摆放；调用方只需填自己要表达的那部分。 */
export interface TurnSteerInput {
  input: string;
  inputId?: string;
  queryId?: QueryId;
  expectedTurnId?: TurnId;
  delivery?: TurnSteerDeliveryMode;
  commandKind?: TurnSteerCommandKind;
  source?: TurnSteerSource;
  inputPresentation?: RuntimeInputPresentation;
  intent?: TurnInputIntentMetadata;
  attachments?: PendingTurnAttachment[];
  pendingInputId?: string;
  traceContext?: TraceContext;
  /** 消费本条输入期间不向模型暴露的工具名。 */
  toolDisallowlist?: readonly string[];
}

/** 投递结果：要么已入队（含队列长度与目标轮次），要么被拒绝（含原因与当时的活动轮次）。 */
export type TurnSteerResult =
  | {
      kind: "queued";
      pendingInputId: string;
      queueLength: number;
      turnId: TurnId;
    }
  | {
      activeTurnId?: TurnId;
      kind: "rejected";
      reason: TurnSteerRejectReason;
    };

/** 与传输协议无关的输入意图元数据；上层 bootstrap 在事件边界把它组装成 ConversationInputIntent。 */
export interface TurnInputIntentMetadata {
  planEnabled?: boolean;
  sourceCommandId: string;
  queueItemId: string;
  clientId: string;
  kind: TurnSteerCommandKind;
  /** 供 transcript 重新水合使用的规范化命令文本，需覆盖完整 ConversationInputIntent。 */
  text?: string;
  /** 准入时刻锁定；之后的排队或引导都不得再读取输入框与会话的最新选择。 */
  modelSelection?: ModelSelection;
  /** 与本次提交一起固定下来的协作模式。 */
  mode?: "build" | "edit" | "plan" | "yolo";
  admissionSeq: number;
  admittedAt: number;
  requestedDelivery: "auto" | "startNow" | "queue" | "guide";
  admittedDelivery: "startNow" | "queue" | "guide";
  queuePosition?: number;
  fallbackReasonCode?: string;
  attachmentRefs?: Array<{
    ref: string;
    fileName: string;
    mime: string;
    bytes: number;
    previewRef?: string;
  }>;
  sharedContextRefs?: Array<{
    kind: "shared_context_import";
    context_id: string;
  }>;
  /** 编辑或重试重建出的命令对原始输入来源的追溯信息，保持稳定可查。 */
  provenance?: {
    sourceCommandId: string;
    queueItemId?: string;
    clientId?: string;
  };
}

/** 排队期间保留的、尚未解析落盘的附件描述；真正消费时走与普通轮次相同的解析流程。 */
export interface PendingTurnAttachment {
  type: "file" | "image" | "video" | "pdf" | "url";
  path?: string;
  content?: string;
  sourceKind?: "clipboard-text";
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
}

/** 已经接纳但尚未消费的输入；由会话运行时的排队层持有，消费后从投影中移除。 */
export interface PendingTurnInput {
  id: string;
  input: string;
  queuedAt: Date;
  traceId: TraceId;
  queryId?: QueryId;
  commandKind?: TurnSteerCommandKind;
  source?: TurnSteerSource;
  inputPresentation?: RuntimeInputPresentation;
  delivery?: TurnSteerDeliveryMode;
  intent?: TurnInputIntentMetadata;
  attachments?: PendingTurnAttachment[];
  /** 该待处理输入被消费时禁止暴露给模型的工具名。 */
  toolDisallowlist?: readonly string[];
  turnId: TurnId;
}

/** 投影里可见的排队输入快照，供界面显示预览、大小与目标轮次。 */
export interface PendingSteerInputInfo {
  pendingInputId: string;
  input: string;
  inputPreview: string;
  inputSize: number;
  commandKind?: TurnSteerCommandKind;
  source?: TurnSteerSource;
  inputPresentation?: RuntimeInputPresentation;
  /** 该排队输入生效时要隐藏的工具名单（automation 在忙碌期入队同样适用），到消费时依然有效。 */
  toolDisallowlist?: readonly string[];
  queuedAt: Date;
  targetTurnId: TurnId;
  traceId: TraceId;
  intent?: TurnInputIntentMetadata;
}

// === 三、权限、工具活动与错误：审批请求、进行中的工具调用与最近一次失败 ===

/** 一次待用户确认的工具审批请求；由权限层创建，会话运行时把它挂到投影上并等待响应。 */
export interface PendingPermission {
  requestId?: string;
  toolCallId: string;
  toolName: string;
  reason?: string;
  riskLevel: RiskLevel;
  input?: unknown;
  suggestedPermissionUpdates?: PermissionUpdate[];
  origin?: InteractionRequestOrigin;
  /** 审批请求附带的展示预览；冷恢复重建弹窗时仍要还原图片等内容，因此必须随投影持久化。 */
  display?: ToolResultDisplayPayload;
  optionsPolicy?: PermissionOptionsPolicy;
  requestedAt: Date;
}

/** 工具调用在会话内的状态；由工具运行时推进，界面据此显示进行/完成/拒绝。 */
export type ToolCallStatus = "pending" | "running" | "completed" | "failed" | "denied";

/** 仍在进行中的工具调用摘要；会话运行时维护，用于展示与并发控制。 */
export interface ActiveToolCall {
  toolCallId: string;
  toolName: string;
  status: ToolCallStatus;
  startedAt?: Date;
}

/** 会话内最近一次失败的结构化描述；由产生错误的层填充，供界面与日志归类。 */
export interface ErrorInfo {
  attribution?: ErrorAttribution;
  code?: string;
  detail?: string;
  type: string;
  message: string;
}

// === 四、后台任务：脱离当前轮次运行的长时命令、子代理与工作流 ===

/** 后台任务的运行状态；由任务调度方推进，取消或进程丢失各有独立取值。 */
export type BackgroundTaskInfoStatus =
  | "running"
  | "completed"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "spawn_error"
  | "lost";

/** 投影里的一条后台任务记录；会话运行时按任务 id 维护，输出按流分别留尾并在必要时落盘。 */
export interface BackgroundTaskInfo {
  taskId: string;
  taskKind?: "bash" | "subagent" | "workflow";
  toolCallId?: string;
  toolName?: string;
  childSessionId?: string;
  blocked?: boolean;
  blockedReason?: string;
  cancellable?: boolean;
  cancelRequestedAt?: Date;
  command?: string;
  description?: string;
  status: BackgroundTaskInfoStatus;
  pid?: number;
  startedAt?: Date;
  completedAt?: Date;
  outputPath?: string;
  outputTruncated?: boolean;
  outputBytes?: number;
  outputTail?: string;
  stderrPersistedOutputPath?: string;
  stderrBytes?: number;
  stderrTail?: string;
  stdoutPersistedOutputPath?: string;
  stdoutBytes?: number;
  stdoutTail?: string;
  terminalId?: string;
}

/** 取消后台任务的结果；由任务调度方返回，包含当时的状态快照，便于界面同步。 */
export interface BackgroundTaskCancelResult {
  cancelled: boolean;
  reason?: string;
  snapshot?: BackgroundTaskInfo;
  status: BackgroundTaskInfoStatus;
  taskId: string;
}

// === 五、事件存储与投影端口：按序保存事件、折叠出投影、把新事件推给订阅者 ===

/** 内存事件存储的驻留规模统计，仅用于本地内存诊断日志。 */
export interface SessionEventStoreStats {
  sessions: number;
  events: number;
  /** 按轮次窗口策略淘汰掉的瞬态事件累计数量；unbounded 模式始终为 0。 */
  evictedEvents?: number;
  /** 当前仍留在内存中的瞬态事件数量，包含进行中轮次与随后的一个滞后轮次。 */
  retainedTransient?: number;
}

/** 会话事件的持久化端口；实现方保证按会话追加的顺序可回放，删除会话时一并清理其事件。 */
export interface SessionEventStorePort {
  append(event: SessionEvent): Promise<SessionEvent>;
  getEvents(sessionId: SessionId): Promise<SessionEvent[]>;
  getEventsAfter(sessionId: SessionId, sequenceNumber: number): Promise<SessionEvent[]>;
  getLatestSequenceNumber(sessionId: SessionId): Promise<number>;
  deleteSession(sessionId: SessionId): Promise<void>;
  /** 可选的只读统计，同步执行且开销与会话数成正比；持久化实现可以不提供。 */
  getStats?(): SessionEventStoreStats;
  /** 按时间兜底清理瞬态事件，由低频 tick 调用，返回本次清理的条数。 持久化实现可以不提供。 */
  pruneTransientEvents?(nowMs?: number): number;
}

/** 会话事件的实时出口；订阅方（界面、遥测等）实现它来接收新事件，允许同步或异步处理。 */
export interface SessionEventSink {
  onSessionEvent(event: SessionEvent): void | Promise<void>;
}

/** 事件折叠端口：既能从零重放整段事件流，也能把单条事件叠加到已有投影上。 */
export interface EventReducerPort {
  reduce(events: SessionEvent[]): SessionProjection;
  apply(projection: SessionProjection, event: SessionEvent): SessionProjection;
}

// === 六、会话投影快照：reducer 产出的只读会话状态视图，不含任何写入入口 ===

/** 会话当前状态的只读快照；由 reducer 从事件流折叠得到，界面与宿主只读不写。 字段按身份时间、运行状态、计数、挂起交互、工具与后台、轮次错误、边界恢复与目标依次排列。 */
export interface SessionProjection {
  id: SessionId;
  createdAt: Date;
  updatedAt: Date;
  mode: CollaborationMode;
  planEnabled?: boolean;
  status: SessionStatus;
  turnCount: number;
  totalTokenCount: number;
  contextUsed: number;
  contextWindow: number;
  pendingPermissions: PendingPermission[];
  pendingSteerInputs: PendingSteerInputInfo[];
  activeToolCalls: ActiveToolCall[];
  streamingToolLedger: StreamingToolLedgerProjectionInfo[];
  backgroundTasks: BackgroundTaskInfo[];
  currentTurnId?: TurnId;
  lastError?: ErrorInfo;
  lastCompact?: CompactProjectionInfo;
  lastCheckpoint?: CheckpointProjectionInfo;
  lastStreamRecoveryAnchor?: StreamRecoveryAnchorProjectionInfo;
  lastRewind?: RewindProjectionInfo;
  target?: SessionGoal | null;
  targetCompletionVerifications: GoalCompletionVerificationOutput[];
  targetCompletionVerificationTimeline: TargetCompletionVerificationProjectionInfo[];
}

/** 投影里一条目标完成校验的进行记录；由校验流程写入，用于恢复进行中或已结束的校验展示。 */
export interface TargetCompletionVerificationProjectionInfo {
  targetId: string;
  status: "started" | "completed" | "failed_closed" | "cancelled";
  verificationId: string;
  verification?: GoalCompletionVerificationOutput;
  goalIteration?: number;
  anchorAssistantMessageId?: MessageId;
  anchorTurnId?: TurnId;
  startedAt?: Date;
  updatedAt: Date;
}

/** 会话列表项摘要；由会话管理器产出，列表页只依赖这些字段，不加载完整投影。 */
export interface SessionSummary {
  id: SessionId;
  createdAt: Date;
  updatedAt: Date;
  mode: CollaborationMode;
  status: SessionStatus;
  turnCount: number;
}

// === 七、会话管理器：创建、恢复、分叉与查询会话的入口 ===

/** 创建一个会话实例时的可选配置；未给出的项由会话管理器按默认策略补齐。 */
export interface SessionConfig {
  mode?: CollaborationMode;
  contextWindow?: number;
  traceId?: TraceId;
}

/** 一个已打开的会话实例：配置、事件存储、当前投影与 reducer 由它统一持有。 */
export interface Session {
  id: SessionId;
  config: SessionConfig;
  eventStore: SessionEventStorePort;
  projection: SessionProjection;
  eventReducer: EventReducerPort;
}

/** 会话管理器端口；调用方通过它开启或找回会话，不自行构造事件存储与 reducer。 */
export interface SessionManagerPort {
  createSession(config: SessionConfig): Promise<Session>;
  resumeSession(sessionId: SessionId): Promise<Session>;
  forkSession(sessionId: SessionId, forkPoint?: number): Promise<Session>;
  getSession(sessionId: SessionId): Promise<Session | null>;
  listSessions(): Promise<SessionSummary[]>;
}
