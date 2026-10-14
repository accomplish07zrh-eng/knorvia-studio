// SPDX-License-Identifier: Apache-2.0
// @knorvia/contracts/events 的会话事件契约：事件信封、判别联合、payload 与构造器。
// 组织方式：先给信封与事件类型常量，再按事件族分组（生命周期 / 轮次 / 转向队列 / 消息 /
// 模型与网络 / 用量 / 工具 / 后台任务与工作流 / 权限 / hook / 目标 / 文件变更）排列 payload。
/* eslint-disable max-lines -- session event 契约集中在单文件导出，避免 app/agent 协议类型分散后漂移。 */

import type { ExecutionOutputPreview } from "../interfaces/execution.port.js";
import type { RuntimeInputPresentation } from "../interfaces/runtime-input-presentation.js";
import type {
  EventId,
  InteractionRequestOrigin,
  MessageId,
  PartId,
  QueryId,
  SessionId,
  TraceId,
  ToolCallId,
  TurnId,
} from "../interfaces/shared.js";
import type {
  CollaborationMode,
  RiskLevel,
  TurnSteerCommandKind,
  TurnSteerDeliveryMode,
  TurnSteerRejectReason,
  TurnSteerSource,
  TurnInputIntentMetadata,
} from "../interfaces/session.port.js";
import type {
  ModelNetworkStatusEvent,
  ModelSelection,
  ModelUsage,
  ModelUsageSummary,
} from "../model/index.js";
import type { HttpClientEgressInfo } from "../interfaces/http-client.port.js";
import { createModelUsageSummary } from "../model/index.js";
import type { ModelApiErrorPhase, ModelFailureExceptionKind } from "../telemetry/index.js";
import type {
  CompactBoundaryPayload,
  CompactTimelinePayload,
  MicrocompactBoundaryPayload,
} from "../compact/index.js";
import type { HookRunLifecyclePayload } from "../hooks/index.js";
import type { CheckpointCreatedPayload, RewindTriggeredPayload } from "../rewind/index.js";
import type { GoalCompletionVerificationOutput, SessionGoal } from "../tools/target.js";
import type { ToolSideEffectScope } from "../tools/contract.js";
import type { ToolResultDisplayPayload } from "../tools/tool-result-metadata.js";
import type { SkillTelemetryMetadata } from "../skills/index.js";
import type {
  MessageVisibility,
  SessionTitleSource,
  SyntheticUserMessageSource,
} from "../interfaces/session-store.port.js";
import type { SavedWorkflowScope } from "../tools/saved-workflow.js";
import type { PermissionOptionsPolicy, PermissionUpdate } from "../interfaces/permission.port.js";
import type {
  StreamRecoveryAnchorPayload,
  StreamRecoveryAnchorSelectedPayload,
  StreamRecoveryBlockedPayload,
  StreamRecoveryRetryStartedPayload,
  StreamRecoveryStartedPayload,
  StreamRecoveryTailDiscardedPayload,
  StreamingToolLedgerPayload,
} from "./stream-recovery.events.js";

// ── 一、会话事件信封

/** 事件信封：类型判别字段加 payload，身份与序号由存储补齐。 */
export interface SessionEvent {
  id: EventId;
  sessionId: SessionId;
  turnId?: TurnId;
  type: SessionEventType;
  timestamp: Date;
  traceId: TraceId;
  sequenceNumber: number;
  payload: unknown;
}

// 事件名是协议面的一等常量：只在 SESSION_EVENT_TYPE_NAMES 里列一次，键由事件名推出——
// 以 `.` 与 `_` 分段、每段首字母大写。这样「事件名 → 常量键」只有一条来源，不会两处漂移。
// 顺序即常量对象的键顺序，保持既有声明序。
const SESSION_EVENT_TYPE_NAMES = [
  "session_created",
  "session_resumed",
  "session_forked",
  "session_compacted",
  "session_title_updated",
  "session_mode_changed",
  "session_ended",
  "turn_started",
  "turn_input_received",
  "turn_steer_queued",
  "turn_steer_delivery_changed",
  "turn_steer_dispatch_changed",
  "turn_steer_drained",
  "turn_steer_rejected",
  "turn_steer_discarded",
  "session_input_promoted",
  "turn_steer_reordered",
  "queue_auto_drain_changed",
  "followup_mode_changed",
  "turn_complete",
  "turn_error",
  "user_message",
  "assistant_message",
  "assistant_feedback_updated",
  "system_message",
  "model_request",
  "model_selected",
  "model_streaming",
  "streaming_tool_ledger_updated",
  "stream_recovery_anchor_created",
  "stream_recovery_started",
  "stream_recovery_anchor_selected",
  "stream_recovery_tail_discarded",
  "stream_recovery_retry_started",
  "stream_recovery_blocked",
  "model_network_status",
  "model_anomaly_warning",
  "network_request_status",
  "model_complete",
  "model_error",
  "tool_call_scheduled",
  "tool_call_started",
  "tool_call_progress",
  "tool_call_result",
  "tool_call_error",
  "tool_batch_complete",
  "background_task_started",
  "background_task_updated",
  "background_task_completed",
  "dynamic_workflow_run_progress",
  "permission_requested",
  "permission_resolved",
  "permission_denied",
  "user_input_auto_resolution_updated",
  "workspace_hook_review_requested",
  "workspace_hook_review_settled",
  "workspace_hook_review_superseded",
  "workspace_hook_admission_updated",
  "hook_run_started",
  "hook_run_progress",
  "hook_run_completed",
  "hook_run_failed",
  "hook_run_blocked",
  "compact_started",
  "compact_completed",
  "compact_failed",
  "compact_boundary",
  "microcompact_boundary",
  "rewind_triggered",
  "checkpoint_created",
  "target_changed",
  "target_completion_verification",
  "subagent_spawned",
  "subagent_message",
  "subagent_stopped",
  "interrupt",
  "cancel",
  "resume",
  "error",
] as const;

/** 事件名的字面量联合。 */
type SessionEventTypeName = (typeof SESSION_EVENT_TYPE_NAMES)[number];

/** 把事件名折算成常量键：`session_mode_changed` → `SessionModeChanged`。 */
type SessionEventTypeKey<Name extends string> = Name extends `${infer Head}_${infer Tail}`
  ? `${Capitalize<Head>}${SessionEventTypeKey<Tail>}`
  : Name extends `${infer Head}.${infer Tail}`
    ? `${Capitalize<Head>}${SessionEventTypeKey<Tail>}`
    : Capitalize<Name>;

function eventTypeKey(name: string): string {
  return name
    .split(/[._]/u)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** 全量会话事件类型常量：键与事件名一一对应。 */
export const SessionEventType = Object.fromEntries(
  SESSION_EVENT_TYPE_NAMES.map((name) => [eventTypeKey(name), name]),
) as unknown as { readonly [Name in SessionEventTypeName as SessionEventTypeKey<Name>]: Name };

/** 会话事件类型取值的联合。 */
export type SessionEventType = (typeof SessionEventType)[keyof typeof SessionEventType];

/** 所有事件 payload 的判别联合；新增事件类型必须同时进这里。 */
export type SessionEventPayload =
  | SessionCreatedPayload
  | SessionResumedPayload
  | SessionForkedPayload
  | SessionCompactedPayload
  | SessionTitleUpdatedPayload
  | SessionModeChangedPayload
  | TurnStartedPayload
  | TurnInputReceivedPayload
  | TurnSteerQueuedPayload
  | TurnSteerDeliveryChangedPayload
  | TurnSteerDispatchChangedPayload
  | TurnSteerDrainedPayload
  | TurnSteerReorderedPayload
  | QueueAutoDrainChangedPayload
  | FollowupModeChangedPayload
  | TurnSteerRejectedPayload
  | TurnSteerDiscardedPayload
  | SessionInputPromotedPayload
  | TurnCompletePayload
  | TurnErrorPayload
  | UserMessagePayload
  | AssistantMessagePayload
  | SystemMessagePayload
  | ModelRequestPayload
  | ModelSelectedPayload
  | ModelStreamingPayload
  | StreamingToolLedgerPayload
  | StreamRecoveryAnchorPayload
  | StreamRecoveryStartedPayload
  | StreamRecoveryAnchorSelectedPayload
  | StreamRecoveryTailDiscardedPayload
  | StreamRecoveryRetryStartedPayload
  | StreamRecoveryBlockedPayload
  | ModelNetworkStatusPayload
  | ModelAnomalyWarningPayload
  | NetworkRequestStatusPayload
  | ModelCompletePayload
  | TargetCompletionVerificationPayload
  | ModelErrorPayload
  | ToolCallScheduledPayload
  | ToolCallStartedPayload
  | ToolCallProgressPayload
  | ToolCallResultPayload
  | ToolCallErrorPayload
  | ToolBatchCompletePayload
  | BackgroundTaskStartedPayload
  | BackgroundTaskUpdatedPayload
  | BackgroundTaskCompletedPayload
  | DynamicWorkflowRunProgressPayload
  | PermissionRequestedPayload
  | PermissionResolvedPayload
  | PermissionDeniedPayload
  | UserInputAutoResolutionUpdatedPayload
  | WorkspaceHookReviewRequestedPayload
  | WorkspaceHookReviewSettledPayload
  | WorkspaceHookReviewSupersededPayload
  | WorkspaceHookAdmissionUpdatedPayload
  | HookRunLifecyclePayload
  | CompactLifecyclePayload
  | MicrocompactBoundaryEventPayload
  | CheckpointCreatedPayload
  | RewindTriggeredPayload
  | CompactBoundaryPayload;

/** 构造一个事件：时间戳、序号与身份字段交给调用方，其余由本函数补默认值。 */
export function createSessionEvent<T>(
  type: SessionEventType,
  sessionId: SessionId,
  payload: T,
  options?: {
    turnId?: TurnId;
    traceId?: TraceId;
    sequenceNumber?: number;
  },
): SessionEvent {
  return {
    id: crypto.randomUUID() as EventId,
    sessionId,
    turnId: options?.turnId,
    type,
    timestamp: new Date(),
    traceId: options?.traceId ?? (crypto.randomUUID() as TraceId),
    sequenceNumber: options?.sequenceNumber ?? 0,
    payload,
  };
}

// ── 二、会话生命周期

/** 会话建立：初始协作模式、上下文窗口与 plan 开关。 */
export interface SessionCreatedPayload {
  planEnabled?: boolean;
  mode: CollaborationMode;
  contextWindow: number;
}

/** 冷恢复接续一个既有会话。 */
export interface SessionResumedPayload {
  directory: string;
  interruptedToolCount: number;
  messageCount: number;
  partCount: number;
  recoveredCompactTimelineCount?: number;
  recoveredSteerInputCount?: number;
  resumedTodoCount?: number;
}

/** 从既有会话分叉出新会话。 */
export interface SessionForkedPayload {
  forkedSessionId?: SessionId;
  originalSessionId: SessionId;
  restoredFileCount?: number;
  restoredSnapshotRef?: string;
  strategy?: "fork_required";
  targetCheckpointId?: string;
  targetMessageId?: MessageId;
  /** @deprecated Use targetMessageId for message-level forks. */
  forkPoint: number;
}

/** 会话标题变化。 */
export interface SessionTitleUpdatedPayload {
  messageID?: MessageId;
  previousTitle: string;
  source: SessionTitleSource;
  title: string;
}

/** 协作模式切换；带授权范围时同时放行排队输入。 */
export interface SessionModeChangedPayload {
  permissionGrant?: { interactionId: string; queueItemIds: string[] };
  planEnabled?: boolean;
  previousPlanEnabled?: boolean;
  mode: CollaborationMode;
  previousMode: CollaborationMode;
  source: "tool" | "command" | "system";
  toolCallId?: ToolCallId;
}

/** 被提升为正式输入的排队输入。 */
export interface SessionInputPromotedPayload {
  pendingInputId: string;
  sourceCommandId: string;
  messageId: MessageId;
}

/** 一次上下文压缩的边界记录。 */
export interface SessionCompactedPayload {
  compactBoundary: CompactBoundaryPayload;
  summary?: string;
  preservedEventCount?: number;
  removedEventCount?: number;
}

/** 压缩生命周期的判别联合视图。 */
export type CompactLifecyclePayload = CompactTimelinePayload;

/** 一次微紧凑的边界记录。 */
export type MicrocompactBoundaryEventPayload = MicrocompactBoundaryPayload;

// ── 三、轮次与输入

/** 轮次开始的公共字段：输入、附件与后台归属。 */
export interface TurnStartedPayloadBase {
  /** 执行入口的单调 epoch 毫秒；hooks/持久化发生在 TurnStarted 发布前，不能据发布时间反推执行开始。 */
  executionStartedAt?: number;
  turnNumber: number;
  input: string;
  /**
   * v4 文件摘要按 turn rowId 发起 query，但 workspace checkpoint 以 user messageId
   * 为恢复锚点；TurnStarted 必须携带同一个持久 id，投影才能把 userInput row
   * 反查到对应 checkpoint。
   */
  messageId?: MessageId;
  inputId?: string;
  /** 仅 admission 透传给无正文 telemetry fact；不能从 session 归属反推。 */
  /** 同一 runtime command 内覆盖 primary turn → goal verify/continue 的稳定取消身份。 */
  foregroundExecutionId?: string;
  queryId?: QueryId;
  inputSource?: SyntheticUserMessageSource;
  inputVisibility?: MessageVisibility;
  /**
   * 中枢直接启动已保存工作流的启动轮元数据（`inputSource === "workflow_launch"` 时在场）。
   * 活投影据它画启动卡；与消息 metadata 里的同一份对齐（冷热同形）。
   */
  workflowLaunch?: WorkflowLaunchMeta;
  /** 缺省为 agent，兼容旧事件与历史 transcript。 */
  executionKind?: TurnExecutionKind;
  /**
   * `input` 从此下标起是引擎附加文本（dwf ask 尾注 / nudge），GUI 把它折进披露；0 = 整条都是；
   * 缺席 = 无。与消息 metadata 里的同一份对齐（冷热同形）。
   */
  epilogueStart?: number;
  /** idle background wake 的结构化来源；active-loop 合流不会创建独立 TurnStarted。 */
  originMeta?: BackgroundResultOriginMeta;
  /** 仅当一个 background notification batch 的所有成员来源一致时透传；混合来源留空。 */
  backgroundSource?: BackgroundResultOriginMeta["backgroundSource"];
  targetId?: string;
  /** 本轮用户输入的附件元信息（无附件时缺省）。 */
  attachments?: TurnAttachmentMeta[];
  /** CLI admission metadata；inputId 继续作为 sourceCommandId 兼容锚点。 */
  intent?: TurnInputIntentMetadata;
}

/** 轮次开始：控制输入轮与真实执行轮的判别联合。 */
export type TurnStartedPayload = TurnStartedPayloadBase & TurnBackgroundAttribution;

/** 收到一条用户输入。 */
export interface TurnInputReceivedPayload {
  input: string;
  attachments?: Attachment[];
}

/** 轮次正常结束与本次消耗的 token。 */
export interface TurnCompletePayload {
  response: string;
  tokenCount: number;
  usage?: ModelUsageSummary;
  toolCallCount: number;
  /** 当前 query 已成功提交到 provider 可见持久历史的模型产物数量。 */
  historyRoundCount?: number;
  duration: number;
  inputId?: string;
  resultType: TurnResultType;
  /** 当前 turn 是否消费过来源为 subagent 的后台结果通知。 */
  backgroundSubagentResultConsumed?: boolean;
  /** 当前 turn 是否消费过来源为 workflow（dynamic-workflow run）的后台通知。 */
  workflowResultConsumed?: boolean;
  /** 内部抢占（如 sendQueuedNow）只终止当前 turn，不等价于用户手动 Stop 队列。 */
  preserveQueueAutoDrainOnCancel?: boolean;
}

/** 轮次失败与错误明细。 */
export interface TurnErrorPayload {
  error: ErrorPayload;
  turnPhase: string;
  inputId?: string;
  /** 当前 turn 是否消费过来源为 subagent 的后台结果通知。 */
  backgroundSubagentResultConsumed?: boolean;
  /** 当前 turn 是否消费过来源为 workflow（dynamic-workflow run）的后台通知。 */
  workflowResultConsumed?: boolean;
}

/** 轮次结果的种类词表。 */
export type TurnResultType =
  | "success"
  // "cancelled": 用户主动中断（TurnCancelled）属于正常结束，复用 TurnComplete 上报而非 TurnError。
  | "cancelled"
  | "error_max_turns"
  | "error_max_budget"
  | "error_during_execution"
  | "error_max_tool_calls";

/** 轮次是否承载真实 Agent 执行。 */
export type TurnExecutionKind = "agent" | "controlOnly";

/** 用户输入附件的轻量展示元信息。 */
export interface TurnAttachmentMeta {
  fileName: string;
  mime: string;
  bytes: number;
  /** 内容引用（本地路径 / artifact URI）；data URL 等无稳定引用时缺省。 */
  ref?: string;
}

/** 轮次与后台任务的归属关系。 */
export type TurnBackgroundAttribution =
  | { automationId: string; offPeakTaskId?: never; offPeakRunType?: never }
  | {
      offPeakTaskId: string;
      offPeakRunType?: OffPeakRunType;
      automationId?: never;
    }
  | {
      automationId?: undefined;
      offPeakTaskId?: undefined;
      offPeakRunType?: never;
    };

/** 闲时段运行的类型词表。 */
export type OffPeakRunType = "init" | "resume";

// ── 四、转向队列（steer）

/** 转向输入进入队列。 */
export interface TurnSteerQueuedPayload {
  pendingInputId: string;
  inputId?: string;
  queryId?: QueryId;
  input: string;
  inputPreview: string;
  inputSize: number;
  commandKind?: TurnSteerCommandKind;
  source?: TurnSteerSource;
  inputPresentation?: RuntimeInputPresentation;
  /** 当前排队输入消费时不向 provider 暴露的工具名。 */
  toolDisallowlist?: readonly string[];
  /** 投递语义：queue=消费时切新 product turn；guide=内联当前轮。 */
  delivery?: TurnSteerDeliveryMode;
  targetTurnId: TurnId;
  queueLength: number;
  intent?: TurnInputIntentMetadata;
}

/** 排队输入的投递意图变化。 */
export interface TurnSteerDeliveryChangedPayload {
  pendingInputId: string;
  targetTurnId: TurnId;
  requestedDelivery: "guide";
  admittedDelivery: "queue";
  fallbackReasonCode: string;
  /** 已改投后的完整 intent；reducer/cold replay 不从旁路状态猜 delivery。 */
  intent?: TurnInputIntentMetadata;
}

/** 排队顺序被重排。 */
export interface TurnSteerReorderedPayload {
  orderedPendingInputIds: string[];
  targetTurnId: TurnId;
}

/** sendQueuedNow 的原子提升：reservation / promoting / rollback 都进事件流。 */
export interface TurnSteerDispatchChangedPayload {
  pendingInputId: string;
  reservationId?: string;
  state: "queued" | "reserved" | "promoting";
  targetTurnId: TurnId;
}

/** 队列自动排空的开关变化。 */
export interface QueueAutoDrainChangedPayload {
  autoDrain: boolean;
}

/** 追问模式变化。 */
export interface FollowupModeChangedPayload {
  mode: "queue" | "guide";
}

/** 队列被排空，列出去向。 */
export interface TurnSteerDrainedPayload {
  pendingInputIds: string[];
  queryIds?: QueryId[];
  targetTurnId: TurnId;
  injectedMessageIds: MessageId[];
  /**
   * drain 事实自带文本与持久 messageId，投影不再依赖
   * 内存 queue 状态取文本（查不到 queue item 就静默丢 user 行）。
   * delivery 决定切轮语义；缺省按 queue（每条一轮）。
   */
  drainedInputs?: Array<{
    pendingInputId: string;
    messageId: MessageId;
    text: string;
    delivery?: TurnSteerDeliveryMode;
    intent?: TurnInputIntentMetadata;
    toolDisallowlist?: readonly string[];
  }>;
}

/** 排队输入被拒绝及其原因。 */
export interface TurnSteerRejectedPayload {
  reason: TurnSteerRejectReason;
  activeTurnId?: TurnId;
  expectedTurnId?: TurnId;
  inputPreview?: string;
  inputSize?: number;
}

/** 排队输入被丢弃。 */
export interface TurnSteerDiscardedPayload {
  pendingInputIds: string[];
  targetTurnId: TurnId;
  // user_removed（v4 queue 单项删除）：用户显式从 queue 移除某项，区别于 turn 生命周期丢弃。
  // promoted：sendQueuedNow 已取得执行权，只从 queue 投影摘除；session_input 必须继续
  // 保持 admitted，直到 user message 原子 promotion（或重启后 discarded）。
  reason: "turn_cancelled" | "turn_failed" | "session_resumed" | "user_removed" | "promoted";
}

// ── 五、消息

/** 用户消息进入时间线。 */
export interface UserMessagePayload {
  content: string;
  attachments?: Attachment[];
}

/** 助手消息进入时间线。 */
export interface AssistantMessagePayload {
  content: string;
  toolCalls?: ToolCallPayload[];
}

/** 助手消息的反馈（点赞/点踩）更新。 */
export interface AssistantFeedbackUpdatedPayload {
  entityId: string;
  feedback: "like" | "dislike" | null;
}

/** 系统消息进入时间线。 */
export interface SystemMessagePayload {
  type: "init" | "compact_boundary" | "interrupted";
  content: string;
  compactBoundary?: CompactBoundaryPayload;
}

/** 附件引用：种类、地址与展示名。 */
export interface Attachment {
  type: "file" | "image" | "pdf" | "url";
  path?: string;
  content?: string;
  mimeType?: string;
}

/** 模型侧消息：角色加内容块。 */
export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCallPayload[];
  toolCallId?: string;
}

// ── 六、模型请求与流式

/** 发起一次模型请求。 */
export interface ModelRequestPayload {
  messages: ModelMessage[];
  providerId: string;
  modelId: string;
  querySource?: string;
  temperature?: number;
  maxTokens?: number;
}

/** 本次模型选择由谁决定。 */
export type ModelSelectionOrigin = "registryFallback";

/** 本次轮次选定的模型。 */
export interface ModelSelectedPayload {
  modelSelection: ModelSelection;
  /** Active Model 已解析出的 reasoning，仅供执行事实/展示投影，不属于稀疏 Selection。 */
  effectiveReasoningLevel?: string;
  /** 缺失表示只更新当前选型；null 表示显式 ∅→selection 模型边界。 */
  previousModelSelection?: ModelSelection | null;
  /** 只有 Agent 自动恢复模型时携带；缺失表示普通选型或旧事件。 */
  origin?: ModelSelectionOrigin;
  /** 当前 selection 对应的思考档位能力；与模型选型同事件原子发布。 */
  supportedThoughtLevels?: string[];
  /** 当前 selection 在 runtime 实际应用的上下文窗口；null 表示显式清除，字段缺失兼容旧事件。 */
  contextWindow?: number | null;
}

/** 流式增量的种类词表。 */
export type ModelStreamingKind =
  | "start"
  | "text_start"
  | "text_delta"
  | "text_end"
  | "reasoning_start"
  | "reasoning_delta"
  | "reasoning_end"
  | "tool_input_start"
  | "tool_input_delta"
  | "tool_input_end"
  | "tool_call"
  | "finish"
  | "error";

/** 模型流式增量。 */
export interface ModelStreamingPayload {
  delta: string;
  done: boolean;
  kind?: ModelStreamingKind;
  assistantMessageId?: MessageId;
  partId?: PartId;
  toolCallId?: ToolCallId;
  toolName?: string;
  input?: unknown;
  providerExecuted?: boolean;
}

/** 模型网络状态。 */
export type ModelNetworkStatusPayload = ModelNetworkStatusEvent;

/** 网络请求的发起方。 */
export type NetworkRequestSource = "http_client" | "model" | "tool" | "mcp" | "plugin" | "unknown";

/** 网络请求的生命周期状态词表。 */
export type NetworkRequestLifecycleStatus = "pending" | "complete" | "error";

/** 网络请求状态变化。 */
export interface NetworkRequestStatusPayload {
  requestId: string;
  source: NetworkRequestSource;
  status: NetworkRequestLifecycleStatus;
  method: string;
  url: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  statusCode?: number;
  error?: string;
  toolCallId?: ToolCallId | string;
  toolName?: string;
  attempt?: number;
  egress?: HttpClientEgressInfo;
}

/** 模型异常警告的类别词表。 */
export type ModelAnomalyWarningCategory =
  | "tool_call_budget"
  | "repeated_tool_call"
  | "provider_finish_mismatch"
  | "malformed_tool_call";

/** 模型异常警告的严重级别。 */
export type ModelAnomalyWarningSeverity = "info" | "warning";

/** 模型异常警告。 */
export interface ModelAnomalyWarningPayload {
  category: ModelAnomalyWarningCategory;
  severity: ModelAnomalyWarningSeverity;
  observedCount?: number;
  threshold?: number;
  toolName?: string;
  toolCallId?: ToolCallId;
  warningInjected: boolean;
  modelVisibleMessageId?: MessageId;
}

/** 模型回合完成：内容、用量与停止原因。 */
export interface ModelCompletePayload {
  cacheHit?: {
    inputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    latestHitRate: number | null;
    hitRate: number | null;
    hitRateRequestCount: number;
    totalInputTokens: number;
    totalCacheReadTokens: number;
    totalCacheWriteTokens: number;
  };
  content: string;
  contextUsageBreakdown?: ContextUsageBreakdownItem[];
  contextWindow?: number;
  fileChanges?: TurnFileChangeSummary;
  querySource?: string;
  stopReason: string;
  /** 当前模型请求组装出的完整 tool call 数量；旧事件可能缺失。 */
  toolCallCount?: number;
  usage: TokenUsage | ModelUsage;
}

/** 模型回合失败。 */
export interface ModelErrorPayload {
  error: ErrorPayload;
  retryable: boolean;
}

/** 可展示的错误事实。 */
export interface ErrorPayload {
  code?: string;
  detail?: string;
  /** 错误链中最深的非 wrapper frame 的原始 message，供客户端 telemetry 定位根因。 */
  underlyingErrorMessage?: string;
  /** 同一底层 frame 的 detail/errorDetails/details 内容。 */
  underlyingErrorDetail?: string;
  type: string;
  message: string;
  attribution?: ErrorAttribution;
  retryable?: boolean;
  stack?: string;
  data?: unknown;
}

/** 错误归属：只承载可聚合的失败事实，不含请求正文、凭据或地址。 */
export interface ErrorAttribution {
  source?: "provider" | "runtime" | "tool" | "network";
  reason?: string;
  errorPhase?: ModelApiErrorPhase;
  exceptionKind?: ModelFailureExceptionKind;
  providerId?: string;
  modelId?: string;
  providerKind?: string;
  transport?: "http" | "sse" | "websocket";
  statusCode?: number;
  providerErrorCode?: string;
  retryable?: boolean;
}

// ── 七、用量与上下文

/** 一次调用或一轮的 token 用量。 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheTokens?: number;
}

/** 上下文用量拆分的来源词表。 */
export type ContextUsageBreakdownSource =
  | "system_prompt"
  | "meta_user_context"
  | "skills"
  | "tool_prompt"
  | "system_tool_schemas"
  | "mcp_tool_schemas"
  | "messages";

/** 上下文用量拆分的一项。 */
export interface ContextUsageBreakdownItem {
  source: ContextUsageBreakdownSource;
  chars: number;
}

/** 从事件序列汇总模型用量摘要。 */
export function createModelUsageSummaryFromEvents(
  events: readonly SessionEvent[],
): ModelUsageSummary | undefined {
  const usages: ModelUsage[] = [];

  for (const event of events) {
    if (event.type !== SessionEventType.ModelComplete) continue;
    const payload = event.payload as Partial<ModelCompletePayload>;
    if (payload.usage) {
      usages.push(payload.usage as ModelUsage);
    }
  }

  return createModelUsageSummary(usages);
}

// ── 八、工具调用

/** 工具调用请求。 */
export interface ToolCallPayload {
  id: ToolCallId;
  name: string;
  input: unknown;
}

/** 工具调用已排入本批。 */
export interface ToolCallScheduledPayload {
  toolCallId: ToolCallId;
  assistantMessageId?: MessageId;
  toolName: string;
  input: unknown;
  dependencies?: ToolCallId[];
  parallelGroupIndex?: number;
  canRunParallel?: boolean;
  display?: ToolResultDisplayPayload;
  schedule: ToolSchedulePayload;
}

/** 工具调用开始执行。 */
export interface ToolCallStartedPayload {
  toolCallId: ToolCallId;
  toolName?: string;
  startedAt: Date;
  display?: ToolResultDisplayPayload;
  /**
   * 这次调用**解析后**的副作用能力（工具元数据 + 按入参解析的运行时能力，例如 Bash 的只读命令判定）。
   * 事件在 handler 动手之前发出，所以订阅者能在第一个字节落盘前知道「要写了」——dynamic-workflow 的
   * driver 据此关闭 amend-resume 的导入缓存（`isWorkspaceMutatingToolCall`）。可选：早于本字段的事件没有。
   */
  readOnly?: boolean;
  sideEffectScope?: ToolSideEffectScope;
}

/** 工具调用的进度增量。 */
export interface ToolCallProgressPayload {
  toolCallId: ToolCallId;
  toolName?: string;
  elapsedMs?: number;
  pid?: number;
  stdoutBytes?: number;
  stderrBytes?: number;
  outputBytes?: number;
  outputPreview?: ExecutionOutputPreview;
  stdoutTail?: string;
  stderrTail?: string;
}

/** 工具调用返回结果。 */
export interface ToolCallResultPayload {
  toolCallId: ToolCallId;
  result: ToolResultPayload;
  duration: number;
  /** Skill metadata 仅用于 telemetry，不进入模型可见的 result.content。 */
  skillMetadata?: SkillTelemetryMetadata;
}

/** 工具调用失败。 */
export interface ToolCallErrorPayload {
  toolCallId: ToolCallId;
  error: ErrorPayload;
  /** Skill metadata 仅用于 telemetry，不进入模型可见的错误正文。 */
  skillMetadata?: SkillTelemetryMetadata;
}

/** 工具结果的内容块。 */
export interface ToolResultPayload {
  success: boolean;
  content: string;
  display?: ToolResultDisplayPayload;
  perf?: import("../tools/performance.js").ToolExecutionTelemetry;
  error?: ErrorPayload;
  truncated?: boolean;
  originalBytes?: number;
  returnedBytes?: number;
  budgetStrategy?: string;
  artifactPath?: string;
}

/** 一批工具调用收口。 */
export interface ToolBatchCompletePayload {
  toolCallIds: ToolCallId[];
  successCount: number;
  errorCount: number;
}

/** 工具调度信息。 */
export interface ToolSchedulePayload {
  parallelGroups: ToolCallId[][];
  executionOrder: ToolCallId[];
}

// ── 九、后台任务与工作流

/** 后台任务的状态词表。 */
export type BackgroundTaskStatus =
  | "running"
  | "completed"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "spawn_error"
  | "lost";

/** 后台任务事件的公共字段。 */
export interface BackgroundTaskPayloadBase {
  taskId: string;
  toolCallId?: ToolCallId | string;
  toolName?: string;
  // "workflow" = workflow run（CreateWorkflow）。追踪器的行为已按 per-tool lifecycleProvider
  // 分派，taskKind 只决定面板分组与图标，所以加宽是纯展示修正，不改任何生命周期语义。
  taskKind?: "bash" | "subagent" | "workflow";
  childSessionId?: SessionId | string;
  blocked?: boolean;
  blockedReason?: "interactive_prompt_detected" | "no_output_progress" | string;
  cancellable?: boolean;
  cancelRequestedAt?: Date;
  command?: string;
  description?: string;
  status: BackgroundTaskStatus;
  pid?: number;
  startedAt?: Date;
  completedAt?: Date;
  outputPath?: string;
  stderrPersistedOutputPath?: string;
  stdoutPersistedOutputPath?: string;
  outputBytes?: number;
  outputTruncated?: boolean;
  outputTail?: string;
  stderrBytes?: number;
  stderrTail?: string;
  stdoutBytes?: number;
  stdoutTail?: string;
  terminalId?: string;
}

/** 后台任务开始。 */
export type BackgroundTaskStartedPayload = BackgroundTaskPayloadBase & {
  status: "running";
};

/** 后台任务更新。 */
export type BackgroundTaskUpdatedPayload = BackgroundTaskPayloadBase;

/** 后台任务完成。 */
export type BackgroundTaskCompletedPayload = BackgroundTaskPayloadBase & {
  status: Exclude<BackgroundTaskStatus, "running">;
};

/** 父会话里的一条 workflow run 进度事件。 */
export interface DynamicWorkflowRunProgressPayload {
  runId: string;
  /** 发起这次 run 的 CreateWorkflow 工具调用（工具卡 → 详情页的关联键）。 */
  toolCallId?: ToolCallId | string;
  /** journal sequence（`appendEvent` 单调分配）；事件日志的 cursor 与它同一把尺。 */
  sequence: number;
  /** 引擎事件种类：run-started / actor-created / node-* / usage-updated / log / report / phase-entered / run-settled。 */
  eventType: string;
  payload: Record<string, unknown>;
  truncated?: boolean;
  /** 派生字段（toProgressPayload）：`actor-created` 上该子代理会话的 id（driver 铸的 `sess_dwf-…`）。 */
  actorSessionId?: string;
  /**
   * 派生字段（与 `actorSessionId` 同类，见 toProgressPayload）：该 run 的 `run-launched.inputId`。
   * 只挂在 `actor-created` / `run-settled` 两种事件上，供下游把子代理归到发起 run 的那一轮。升级前的 run 没有 `run-launched`，字段缺席。
   */
  launchInputId?: string;
}

/** 独立后台结果轮的展示元信息。 */
export interface BackgroundResultOriginMeta {
  /** `workflow` 是 dynamic-workflow run（workId ≡ runId），复用整条后台通知管线。 */
  backgroundSource: "bash" | "subagent" | "workflow";
  workId: string;
  title: string;
  /** 只在 backgroundSource === "workflow" 的单条通知轮上在场；manifest 渲染的唯一数据源。 */
  workflowNotification?: WorkflowNotificationMeta;
}

/** workflow 通知的结构化载荷。 */
export type WorkflowNotificationMeta =
  | {
      kind: "terminal";
      status: "completed" | "errored" | "stopped";
      /** `status === "stopped"` 才在场。 */
      stopReason?: "user" | "model" | "provider" | "interrupted" | "superseded";
      summary: string;
      result?: string;
      resultForm?: "prose" | "json";
      resultTruncated?: true;
      error?: string;
      reports?: { count: number; shown: number; preview: string[] };
      /**
       * 用户面产物的 chips 载荷：≤ 8 条，
       * 超出（含被种类过滤掉的）置 `artifactsTruncated`。
       *
       * ⚠ 术语：这里的 artifact 是脚本经 `artifact.*` 发布给用户看的产出，与同一载荷上的
       * `result`（脚本顶层返回值，引擎内部也叫 artifact）是两件不同的东西。
       */
      artifacts?: {
        id: string;
        kind: "file" | "markdown" | "chart" | "table" | "metrics" | "board";
        title?: string;
        version: number;
        contentType?: string;
        /** run 的交付物；清单以它带头。只有它带 `description`（完成卡的交付物行要念）。 */
        primary?: true;
        description?: string;
      }[];
      artifactsTruncated?: true;
      durationMs?: number;
    }
  | {
      kind: "escalation";
      qid: string;
      actor: string;
      question: string;
      context?: string;
      askedAt?: number;
    }
  /** run 级停滞：每个 stall 段一条，不是终态。 */
  | {
      kind: "stall";
      sinceMs: number;
      reason?: string;
      cap?: number;
    };

/** 中枢直接启动已保存工作流的启动轮元数据。 */
export type WorkflowLaunchDisplay = Extract<ToolResultDisplayPayload, { kind: "create_workflow" }>;

/** 设置轮的「改了什么」：只有改动过的设置在场。 */
export interface WorkflowSettingsAmendMeta {
  /** 被这次调整替代（或接着跑）的那个 run。 */
  predecessorRunId: string;
  subagentModel?: { from?: string; to?: string };
  maxConcurrency?: { from?: number; to?: number };
  ceiling?: number;
}

/** 启动轮的元数据：脚本、说明、实参与设置改动。 */
export interface WorkflowLaunchMeta {
  /** run 的身份（≡ backgroundTaskId ≡ cancelBackgroundWork 的 workId）。 */
  runId: string;
  /**
   * 启动这次 run 的合成 toolCall id（中枢启动 `launch-<uuid>`，设置轮 `settings-<uuid>`；
   * 工具卡 → 详情页关联键）。
   */
  toolCallId: string;
  /**
   * 工作流名（解析结果，非用户/模型可覆盖）；启动卡题名与会话标题都取它。中枢启动恒在场；设置轮取被
   * 调整的 run 自己的名字，无名 run 即缺席（UI 换用兜底词，不拿 run id 当标题）。
   */
  name?: string;
  /** 解析出的实际作用域（不是请求里可能缺席的 scope）。只属于中枢启动：设置轮没有保存文件可指。 */
  scope?: SavedWorkflowScope;
  /** 保存文件的落点，用于详情/诊断；不参与执行。只属于中枢启动。 */
  path?: string;
  /** 本次 run 的实参（已按声明校验并回填默认值）；有界见 {@link boundWorkflowLaunchMeta}。 */
  args?: Record<string, unknown>;
  /** 工作流说明（saved 元数据的 description），有界 ≤ 500 字符。 */
  description?: string;
  /**
   * 启动前编译得到的 `create_workflow` 结果 display（有界因果图 + 诊断），与 CreateWorkflow 工具行
   * `display` 同一投影、同一构造函数。run 详情侧板按 toolCallId 找「发起行」取图——直接启动没有
   * 工具行，图就从这里取。
   */
  display?: WorkflowLaunchDisplay;
  /**
   * 本次 run 实际执行的脚本原文（与 `port.submit.scriptText` 同一份）。工具路径把它放在工具入参
   * `input.script` 上供侧板 Script 区读取，这里是同一事实的启动轮落点；有界见
   * {@link WORKFLOW_LAUNCH_SCRIPT_MAX_CHARS}（超界整体缺席，侧板 Script 区随之缺席）。
   */
  script?: string;
  /** 设置轮才在场：这次 run 是用「配置」从哪个 run 修订来的、改了什么。 */
  amend?: WorkflowSettingsAmendMeta;
}

/** 启动轮 args 的 JSON 序列化上界（字节）；超界即丢并换成标记键。 */
export const WORKFLOW_LAUNCH_ARGS_MAX_BYTES = 4_096;

/** 启动轮 description 的字符上界。 */
export const WORKFLOW_LAUNCH_DESCRIPTION_MAX_CHARS = 500;

/** 启动轮 script 的字符上界。 */
export const WORKFLOW_LAUNCH_SCRIPT_MAX_CHARS = 256_000;

/** args 超界时的替身键。 */
export const WORKFLOW_LAUNCH_ARGS_TRUNCATED_KEY = "…";

/** 把启动轮元数据收进边界内：超界字段截断并打标记，其余原样保留。 */
export function boundWorkflowLaunchMeta(input: WorkflowLaunchMeta): WorkflowLaunchMeta {
  const bounded: WorkflowLaunchMeta = {
    runId: input.runId,
    toolCallId: input.toolCallId,
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.scope === undefined ? {} : { scope: input.scope }),
    ...(input.path === undefined ? {} : { path: input.path }),
  };
  if (input.args !== undefined) {
    const serialized = JSON.stringify(input.args);
    const bytes = serialized === undefined ? 0 : Buffer.byteLength(serialized, "utf8");
    bounded.args =
      bytes > WORKFLOW_LAUNCH_ARGS_MAX_BYTES
        ? { [WORKFLOW_LAUNCH_ARGS_TRUNCATED_KEY]: `arguments omitted (${bytes} bytes)` }
        : input.args;
  }
  if (input.description !== undefined) {
    bounded.description =
      input.description.length > WORKFLOW_LAUNCH_DESCRIPTION_MAX_CHARS
        ? `${input.description.slice(0, WORKFLOW_LAUNCH_DESCRIPTION_MAX_CHARS - 1)}…`
        : input.description;
  }
  // display 已在构造处（createCreateWorkflowDisplay + boundCausalityGraph）限长，原样透传。
  if (input.display !== undefined) bounded.display = input.display;
  if (input.script !== undefined && input.script.length <= WORKFLOW_LAUNCH_SCRIPT_MAX_CHARS) {
    bounded.script = input.script;
  }
  // amend 块本身有界（两个模型串由调用方取自已解析的规范形，与 run 状态同一条上界）。
  if (input.amend !== undefined) bounded.amend = input.amend;
  return bounded;
}

// ── 十、权限与用户输入

/** 请求用户批准一次高风险动作。 */
export interface PermissionRequestedPayload {
  requestId?: string;
  toolCallId: ToolCallId;
  toolName: string;
  riskLevel: RiskLevel;
  reason: string;
  input: unknown;
  suggestedPermissionUpdates?: PermissionUpdate[];
  origin?: InteractionRequestOrigin;
  /**
   * 工具自报的确认预览，由 `prepareApproval` 钩子产出。复用结果通道的 display 投影，
   * 让 ask 与结果卡共享同一套有界形状，不新增无界字段。
   */
  display?: ToolResultDisplayPayload;
  fullAccessSupported?: boolean;
  optionsPolicy?: PermissionOptionsPolicy;
}

/** 用户对本次批准请求给出结论。 */
export interface PermissionResolvedPayload {
  requestId?: string;
  toolCallId: ToolCallId;
  decision: PermissionDecision;
  reason?: string;
  modifiedInput?: unknown;
}

/** 批准请求被直接拒绝。 */
export interface PermissionDeniedPayload {
  toolCallId: ToolCallId;
  toolName: string;
  reason: string;
  inputSummary?: unknown;
}

/** 批准结论的词表。 */
export type PermissionDecision = "allow" | "deny" | "escalate" | "modify";

/** 用户输入自动解析所处的状态。 */
export type UserInputAutoResolutionState =
  | {
      state: "hiddenGrace" | "visibleCountdown";
      startedAt: number;
      visibleAt: number;
      deadlineAt: number;
    }
  | {
      state: "snoozed";
      startedAt: number;
      snoozedAt: number;
    };

/** 用户输入自动解析状态更新。 */
export interface UserInputAutoResolutionUpdatedPayload {
  interactionId: string;
  toolCallId: ToolCallId;
  autoResolution: UserInputAutoResolutionState;
}

// ── 十一、工作区 hook 复核

/** 工作区 hook 复核被发起。 */
export interface WorkspaceHookReviewRequestedPayload {
  request: unknown;
}

/** 工作区 hook 复核已有结论。 */
export interface WorkspaceHookReviewSettledPayload {
  interactionId: string;
  state: "resolved" | "timed_out" | "configuration_error";
  reasonCode?: string;
}

/** 工作区 hook 复核被新的复核取代。 */
export interface WorkspaceHookReviewSupersededPayload {
  interactionId: string;
  supersededByInteractionId: string;
}

/** 准入层完成评估后上报 pending 状态。 */
export interface WorkspaceHookAdmissionUpdatedPayload {
  pendingCount: number;
  bundleDigest: string;
  workspaceIdentity?: string;
}

// ── 十二、目标与完成校验

/** 目标变更的动作词表。 */
export type TargetChangedAction =
  | "set"
  | "status_updated"
  | "cleared"
  | "usage_accounted"
  | "run_started"
  | "run_finished"
  | "summary_updated";

/** 目标变更的来源词表。 */
export type TargetChangedSource = "command" | "tool" | "runtime";

/** 目标被设置、清除或由外部改写。 */
export interface TargetChangedPayload {
  action: TargetChangedAction;
  source: TargetChangedSource;
  target: SessionGoal | null;
  previousTarget?: SessionGoal | null;
}

/** 完成校验的状态词表。 */
export type TargetCompletionVerificationStatus =
  | "started"
  | "completed"
  | "failed_closed"
  | "cancelled";

/** 一次目标完成校验的输入与结论。 */
export interface TargetCompletionVerificationPayload {
  targetId: string;
  status: TargetCompletionVerificationStatus;
  verificationId: string;
  /** 与触发该验证的前台 runtime command 共用，供 Stop 做 stale guard。 */
  foregroundExecutionId?: string;
  /** sendQueuedNow 抢占 verifier 时只暂停 goal，不暂停 future queue。 */
  preserveQueueAutoDrainOnCancel?: boolean;
  verification?: GoalCompletionVerificationOutput;
  goalIteration?: number;
  anchorAssistantMessageId?: MessageId;
  anchorTurnId?: TurnId;
}

// ── 十三、文件变更摘要

/** 一轮里改动过的文件摘要。 */
export interface TurnFileChangeSummary {
  additions: number;
  deletions: number;
  files: number;
  items: TurnFileChangeSummaryItem[];
}

/** 摘要里的一项。 */
export interface TurnFileChangeSummaryItem {
  additions: number;
  deletions: number;
  path: string;
  toolNames?: string[];
  writeCount: number;
}

// 兼容再导出：ToolCall 与 CollaborationMode/RiskLevel 的旧名字继续从本模块可达。
export type { CollaborationMode, RiskLevel } from "../interfaces/session.port.js";
export type { ModelToolCall as ToolCall } from "../model/index.js";
