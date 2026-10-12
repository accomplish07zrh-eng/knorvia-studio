// SPDX-License-Identifier: Apache-2.0
// 会话存储端口（session store port）的契约面。
// 这里只回答两件事：会话、消息、part 这些领域对象长什么样；宿主存储必须为
// GUI 与运行时提供哪些读写方法。落盘、事务、并发与幂等由各存储适配器实现，
// 调用方只依赖本文件给出的形状与取值词表。

import type {
  CompactBoundaryPayload,
  CompactPhase,
  CompactReason,
  CompactTimelineDisplay,
  CompactTimelineStatus,
  CompactTrigger,
} from "../compact/index.js";
import type {
  ModelId,
  ModelProviderId,
  ModelSelection,
  ModelToolSideEffectScope,
} from "../model/index.js";
import type { TodoItem } from "../tools/todo.js";
import type { GoalStatus, SessionGoal } from "../tools/target.js";
import type { EnvInfo } from "./context-source.port.js";
import type { PermissionRuleset } from "./permission.port.js";
import type { ProjectPermissionUpdatePort } from "./project-permission-update.port.js";
import type { CollaborationMode } from "./session.port.js";
import type {
  MessageId,
  PartId,
  ProjectId,
  SessionId,
  ToolCallId,
  TraceId,
  TurnId,
  WorkspaceId,
} from "./shared.js";

// 0｜内部辅助形状：仅在本文件内复用，不属于公开导出面

// 输入账本记录与 fork 初始输入共用同一份 payload：正文文本外加任意扩展键。
type SessionInputPayload = { text: string; [key: string]: unknown };

// 复制式写入的来源指针：指明从哪个会话的哪条记录拷贝。
type RecordCopySource = { sessionID: SessionId; id: string };

// 精确定位某会话内某条消息所需的参数。
type MessageLocator = { sessionID: SessionId; messageID: MessageId };

// 只按会话作用域取值的查询参数（消息列表、todo、目标读取等）。
type SessionLocator = { sessionID: SessionId };

// 1｜会话入口（session entry）词表
// entry 是挂在会话上的持久化事实槽位，类型字符串既是主键前缀也是迁移依据，
// 新增取值必须同时登记进 SESSION_ENTRY_TYPES，否则读写侧会当成未知类型。

/** 目标完成校验结论：由校验流程写入，读取方据此判断目标是否真的达成。 */
export const SESSION_ENTRY_TARGET_COMPLETION_VERIFICATION =
  "target_completion_verification" as const;
/** 运行时选中的 bash / shell：决定该会话后续命令在哪个 shell 里执行。 */
export const SESSION_ENTRY_BASH_SHELL_SELECTION = "runtime/bash_shell_selection" as const;
/** 运行时模型选择：provider/model 与推理档位等用户可见偏好。 */
export const SESSION_ENTRY_MODEL_SELECTION = "runtime/model_selection" as const;
/** 运行时执行状态：当前是否处于运行、暂停或等待用户的中间态。 */
export const SESSION_ENTRY_EXECUTION_STATE = "runtime/execution_state" as const;
/** 用户输入的自动裁决结果：记录系统代替用户作出的选择及其依据。 */
export const SESSION_ENTRY_USER_INPUT_AUTO_RESOLUTION =
  "runtime/user_input_auto_resolution" as const;
/** 工作区检查点：文件状态快照的索引，供回滚与分叉定位还原点。 */
export const SESSION_ENTRY_WORKSPACE_CHECKPOINT = "runtime/workspace_checkpoint" as const;
/** 工作区文件级回退记录：某次 rewind 实际改动了哪些文件。 */
export const SESSION_ENTRY_WORKSPACE_FILE_REWIND = "runtime/workspace_file_rewind" as const;

// 词表的规范顺序即持久化探针顺序，运行时读取方按该顺序枚举入口类型。
export const SESSION_ENTRY_TYPES = [
  SESSION_ENTRY_TARGET_COMPLETION_VERIFICATION,
  SESSION_ENTRY_BASH_SHELL_SELECTION,
  SESSION_ENTRY_MODEL_SELECTION,
  SESSION_ENTRY_EXECUTION_STATE,
  SESSION_ENTRY_USER_INPUT_AUTO_RESOLUTION,
  SESSION_ENTRY_WORKSPACE_CHECKPOINT,
  SESSION_ENTRY_WORKSPACE_FILE_REWIND,
] as const;

/** 已知入口类型；历史数据里出现过的其它字符串仍按 `string` 宽容接收。 */
export type SessionEntryType = (typeof SESSION_ENTRY_TYPES)[number];

/** 一条会话入口记录：由运行时的各能力模块写入，存储层只做收发。 */
export interface SessionEntryInfo {
  id: string;
  sessionID: SessionId;
  type: SessionEntryType | string;
  // entry 同时承载用户/工具活动与 session-local 配置快照；
  // 恢复配置只刷新 entry 自己的版本，不能顺带把任务活动时间一起刷新。
  touchSession?: boolean;
  time: {
    created: number;
    updated: number;
  };
  /** 逻辑 payload，并非数据库 JSON 列的直接映射。runtime/model_selection 读写的 是公共 ModelSelection（未选择时写 null），包装成 modelSelection 由 SQLite 适配器负责；旧的平铺字段只服务一次性迁移与回滚，不向普通消费方暴露， 也不复制进 fork 出来的子记录。 */
  data: unknown;
}

// 2｜会话任务与标题的取值域

// 会话由哪条创建路径产生，决定父子关系、可见入口与后续调度策略。
export const SESSION_TASK_TYPES = [
  "interactive",
  "fork",
  "selection_side_chat",
  "workflow_parent",
  "workflow_child",
  "subagent_child",
  "nested_workflow_child",
] as const;
export type SessionTaskType = (typeof SESSION_TASK_TYPES)[number];

// 标题的来源；GUI 依据它决定标题能否被用户改写、是否需要重新生成。
export const SESSION_TITLE_SOURCES = ["default", "first_input", "generated", "custom"] as const;
export type SessionTitleSource = (typeof SESSION_TITLE_SOURCES)[number];

// 3｜消息可见性、语义与投影锚点

// 消息对谁可见：user-visible 会进 GUI 与转录，model-only 只喂模型不进呈现层。
export const MESSAGE_VISIBILITIES = ["user-visible", "model-only"] as const;
export type MessageVisibility = (typeof MESSAGE_VISIBILITIES)[number];

// 非真实用户敲入、由运行时注入的 user 消息来源集合；list 顺序即既有落盘顺序。
export const SYNTHETIC_USER_MESSAGE_SOURCES = [
  "background_task",
  "fork",
  "goal_state_change",
  "goal-continuation",
  "plugin_reference",
  "rewind",
  "selection_side_chat",
  "subagent",
  "subagent_message",
  "todo_reminder",
  // 中枢直接启动已保存工作流时落下的那条 user 消息。
  // 它在 GUI 侧走元数据渲染启动卡而不是显示正文，属于 synthetic；
  // 但它对应的是用户真实动作，origin=real_user、kind=user_prompt，
  // 与「运行时注入的提醒」类来源不是同一档语义。
  "workflow_launch",
  "shared_context",
] as const;
export type SyntheticUserMessageSource = (typeof SYNTHETIC_USER_MESSAGE_SOURCES)[number];

/** 消息的发起方：谁把这条消息放进会话，而不是消息给谁看。 */
export type MessageSemanticsOrigin =
  | "real_user"
  | "agent_runtime"
  | "system"
  | "migration"
  | "import";

/** 消息在业务上属于哪一类片段，读侧据此选择转录渲染与 prompt 组装策略。 */
export type MessageSemanticsKind =
  | "user_prompt"
  | "slash_command"
  | "system_reminder"
  | "background_notification"
  | "subagent_notification"
  | "todo_reminder"
  | "rewind_notice"
  | "fork_notice"
  | "timeline_event"
  | "compact_summary"
  | "shared_context"
  | "assistant_response";

/** 消息的语义标注：发起方、类别与三档可见性，由消息生产者负责填。 */
export interface MessageSemantics {
  origin: MessageSemanticsOrigin;
  kind: MessageSemanticsKind;
  source?: string;
  commandName?: string;
  uiVisibility: "visible" | "hidden" | "debug";
  providerVisibility: "visible" | "hidden";
  transcriptVisibility: "visible" | "hidden";
}

// v4 投影锚点的 origin 词表（对应 userInput.origin）。
// 它和 MessageSemanticsOrigin 各自独立、不互相替代：semantics.origin 服务既有读侧语义，
// anchor.origin 是 v4 协议 row 的派生依据，旧值由读侧做只读映射。
export const MESSAGE_ANCHOR_ORIGINS = [
  "realUser",
  "backgroundResult",
  "goalContinuation",
  "mailbox",
  "synthetic",
] as const;
export type MessageAnchorOrigin = (typeof MESSAGE_ANCHOR_ORIGINS)[number];

/** stable fork 在 fork 点冻结下来的目标事实。undefined 只可能来自旧数据； 新数据要么显式写 none，要么写完整快照，以免 fork 时拿 parent 的当前目标 冒充历史状态。 */
export type StableForkGoalBoundaryMetadata =
  | { kind: "none" }
  | {
      kind: "snapshot";
      target: SessionGoal;
      verificationEntryIds: string[];
    };

/** v4 转录锚点清单。字段全部可选，作为 message JSON blob 的一部分做增量演进： 历史数据留空，读侧按缺失宽容降级。sourceCommandId 提供命令幂等所需的转录查重键， 待 v4 command inbox 铺好之后再接线写入。 */
export interface MessageProjectionAnchor {
  turnId?: TurnId;
  origin?: MessageAnchorOrigin;
  sourceCommandId?: string;
  /** 最终 assistant 把当前 query 固定在第几轮历史，供冷启动精确恢复。 */
  historyRoundCount?: number;
  /** 新数据里 stable fork 的固定边界；旧消息缺失，由唯一 resolver 无歧义时惰性补写。 */
  productTurnId?: string;
  orderedMessageIds?: MessageId[];
  boundaryMessageId?: MessageId;
  goalBoundary?: StableForkGoalBoundaryMetadata;
}

// 4｜会话记录本体与读写输入

/** 单文件改动统计；会话摘要与 rewind 记录共用这一形状。 */
export interface FileDiff {
  path: string;
  additions: number;
  deletions: number;
  oldPath?: string;
  newPath?: string;
}

/** rewind 后的会话状态：回退到哪条消息、快照与 diff 引用，以及分支游标。 */
export interface SessionRevert {
  messageID: MessageId;
  partID?: PartId;
  snapshot?: string;
  diff?: string;
  kind?: "conversation_rewind";
  scope?: "conversation" | "workspace" | "both";
  targetMessageID?: MessageId;
  createdMessageID?: MessageId;
  keptMessageIDs?: MessageId[];
  /** append-only 会话分支的截断游标：本次 rewind 提交前最后一条已持久化消息。 活跃分支 = keptMessageIDs 再加上这条消息之后新追加的部分； 旧的 createdMessageID 只为兼容保留。 */
  branchCutAfterMessageID?: MessageId;
  /** 每次破坏性会话 rewind 递增，用来隔离旧分支上迟到的异步结果。 */
  branchGeneration?: number;
}

/** 会话主记录：元数据、标题、workspace 归属与摘要统计的唯一权威形状。 */
export interface SessionInfo {
  id: SessionId;
  projectID: ProjectId;
  workspaceID?: WorkspaceId;
  parentID?: SessionId;
  traceID?: TraceId;
  taskType: SessionTaskType;
  slug: string;
  directory: string;
  path?: string;
  title: string;
  titleSource?: SessionTitleSource;
  titleMessageID?: MessageId;
  version: string;
  shareURL?: string;
  summaryAdditions?: number;
  summaryDeletions?: number;
  summaryFiles?: number;
  summaryDiffs?: FileDiff[];
  revert?: SessionRevert;
  permission?: PermissionRuleset;
  time: {
    created: number;
    updated: number;
    titleUpdated?: number;
    compacting?: number;
    archived?: number;
  };
}

/** 建档入参：除创建时刻必须定下的事实外，其余交给 UpdateSessionInput 演进。 */
export interface CreateSessionInput {
  id: SessionId;
  projectID: ProjectId;
  workspaceID?: WorkspaceId;
  parentID?: SessionId;
  traceID?: TraceId;
  taskType?: SessionTaskType;
  slug: string;
  directory: string;
  path?: string;
  title: string;
  titleSource?: SessionTitleSource;
  titleMessageID?: MessageId;
  version: string;
  shareURL?: string;
  permission?: PermissionRuleset;
  time?: {
    created?: number;
    updated?: number;
  };
}

/** 会话字段的部分更新：字段给 null 表示清除，缺省表示维持原值。 */
export interface UpdateSessionInput {
  id: SessionId;
  directory?: string;
  path?: string | null;
  timeUpdated?: number;
  title?: string;
  titleSource?: SessionTitleSource;
  titleMessageID?: MessageId | null;
  expectedTitleSources?: readonly SessionTitleSource[];
  shareURL?: string | null;
  summary?: {
    additions?: number;
    deletions?: number;
    files?: number;
    diffs?: FileDiff[];
  } | null;
  revert?: SessionRevert | null;
  permission?: PermissionRuleset | null;
  timeCompacting?: number | null;
  timeArchived?: number | null;
}

/** 会话列表过滤条件；全部缺省时返回调用方可见的全部会话。 */
export interface ListSessionsInput {
  projectID?: ProjectId;
  /** undefined = 不按 identity 过滤；null = 只要本地/legacy 的空 identity；字符串 = 精确匹配 workspace identity。 */
  workspaceID?: WorkspaceId | null;
  directory?: string;
  path?: string;
  roots?: boolean;
  taskTypes?: SessionTaskType[];
  includeArchived?: boolean;
  limit?: number;
}

// 5｜分叉（fork）提交载荷

/** stable fork resolver 冻结下来的目标 product turn 片段。 */
export interface StableForkTargetMetadata {
  productTurnId: string;
  transcriptTurnId: string;
  orderedMessageIds: string[];
  boundaryMessageId: string;
}

/** 命令幂等事实：必须与 child session 落在同一个事务里。 */
export interface ForkChildSessionMetadata {
  parentSessionId: string;
  sourceCommandId: string;
  forkTarget: StableForkTargetMetadata;
}

/** fork 入口的裁决结果：分叉助手回复、新建选择侧聊，或改写用户提问。 */
export type ForkCommandResult =
  | { type: "forkAssistant"; sessionId: string }
  | { type: "createSelectionSideSession"; sessionId: string }
  | { type: "editUserQuery"; disposition: "fork"; sessionId: string };

/** 会话分叉的唯一原子提交载荷。remap 在 core 的内存里完成；适配器不做业务裁决， 只保证 child/copy/goal/entries/input/parent command fact 要么全落地、要么全不落地。 */
export interface ForkCommitBundle {
  child: CreateSessionInput;
  messages: MessageWithParts[];
  entries: SessionEntryInfo[];
  /** 存储复制的来源映射（目标 ID -> 父记录 ID）；只对旧磁盘快照有意义，不参与模型选择。 */
  copySources?: { messages: Record<string, string>; parts: Record<string, string> };
  goal?: { source: SessionGoal; status: GoalStatus };
  initialInput?: {
    id: string;
    sessionID: SessionId;
    kind: string;
    delivery: SessionInputDelivery;
    payload: SessionInputPayload;
  };
  commandFact: {
    parentSessionId: string;
    sourceCommandId: string;
    ack: {
      commandId: string;
      status: "accepted";
      revisionAtDecision: number;
      result: ForkCommandResult;
    };
    metadata: Record<string, unknown>;
  };
}

// 6｜共享上下文导入

/** 导入上下文在生命周期中的状态；reserved 表示序号已占位但尚未挂到消息上。 */
export type SharedContextImportStatus = "pending" | "reserved" | "attached" | "discarded";

/** 分享导入的原子提交载荷：新 session、唯一的 model-only 上下文与 provenance 同生共死。 */
export interface SharedContextImportCommitBundle {
  session: CreateSessionInput;
  contextMessage: MessageWithParts;
  provenance: SessionEntryInfo;
}

/** 导入状态的条件迁移：expectedStatus 命中才允许改写成 status，保证 CAS 语义。 */
export interface SharedContextImportTransition {
  sessionID: SessionId;
  contextId: string;
  expectedStatus: SharedContextImportStatus | readonly SharedContextImportStatus[];
  status: SharedContextImportStatus;
  /** 审计与恢复用的来源身份：队列/输入 identity，或已接受 user 消息的 identity。 */
  sourceId?: string;
}

// 7｜工作区身份认领与修复

/** 用 host 的 task-index allowlist 给旧远端会话补写 workspace identity。 */
export interface ClaimLegacySessionWorkspaceInput {
  sessionIDs: SessionId[];
  directory: string;
  workspaceID: WorkspaceId;
}

/** 修复单条「曾把 remote identity 写进 directory」的历史会话。 */
export interface RepairLegacyRemoteSessionWorkspaceInput {
  sessionID: SessionId;
  projectID: ProjectId;
  legacyWorkspaceDirectory: string;
  workspaceID: WorkspaceId;
  workspacePath: string;
}

/** 已具备 remote identity 的会话做维护性路径自愈时提交的 CAS 输入。 */
export interface RepairRemoteSessionPathsInput {
  sessionID: SessionId;
  workspaceID: WorkspaceId;
  expectedDirectory: string;
  expectedPath: string | null;
  directory: string;
  path: string | null;
  timeUpdated: number;
}

// 8｜消息体（message info）

/** user 消息可指定的输出格式：纯文本，或带重试预算的 JSON Schema。 */
export type OutputFormat =
  | { type: "text" }
  | { type: "json_schema"; schema: Record<string, unknown>; retryCount?: number };

/** 消息级摘要：标题、正文与被改动文件，供列表与压缩摘要展示。 */
export interface MessageSummary {
  title?: string;
  body?: string;
  diffs: FileDiff[];
}

/** 消息创建时的环境快照，用于事后还原当时的上下文条件。 */
export interface MessageContextSnapshot {
  envInfo?: EnvInfo;
}

/** 失败信息的最小形状：稳定名称加可选的结构化明细。 */
export interface AssistantErrorInfo {
  name: string;
  data?: Record<string, unknown>;
}

/** 一次模型调用的 token 账：输入、输出、推理与缓存读写。 */
export interface TokenUsageInfo {
  total?: number;
  input: number;
  output: number;
  reasoning: number;
  cache: {
    read: number;
    write: number;
  };
}

/** 用户侧消息记录：正文之外的格式、摘要、合成来源与投影锚点都挂在这里。 */
export interface UserMessageInfo {
  id: MessageId;
  sessionID: SessionId;
  role: "user";
  time: {
    created: number;
  };
  format?: OutputFormat;
  summary?: MessageSummary;
  agent: string;
  /** 未绑定会话的合成消息、缺少模型信息的旧消息都不伪造请求来源。 */
  modelSelection?: ModelSelection;
  system?: string;
  tools?: Record<string, boolean>;
  contextSnapshot?: MessageContextSnapshot;
  synthetic?: boolean;
  source?: SyntheticUserMessageSource;
  visibility?: MessageVisibility;
  semantics?: MessageSemantics;
  anchor?: MessageProjectionAnchor;
  metadata?: Record<string, unknown>;
}

/** 助手侧消息记录：模型来源、用量、终止原因与结构化输出等执行事实。 */
export interface AssistantMessageInfo {
  id: MessageId;
  sessionID: SessionId;
  role: "assistant";
  time: {
    created: number;
    completed?: number;
  };
  error?: AssistantErrorInfo;
  parentID: MessageId;
  /** 真正由模型产出的消息应带来源；历史恢复出来的合成时间线允许没有执行模型。 */
  modelId?: ModelId;
  providerId?: ModelProviderId;
  mode: string;
  /** 本次输出是否处于 Plan 状态；旧记录没有这个字段就按旧 mode 推断，不追写历史。 */
  planEnabled?: boolean;
  agent: string;
  path: {
    cwd: string;
    root: string;
  };
  summary?: boolean;
  cost: number;
  tokens: TokenUsageInfo;
  structured?: unknown;
  reasoningLevel?: string;
  finish?: string;
  semantics?: MessageSemantics;
  anchor?: MessageProjectionAnchor;
  /** 附加领域语义，例如 fork copy 的 forkOrigin provenance。 */
  metadata?: Record<string, unknown>;
}

/** 会话里持久化的消息只有用户与助手两种角色。 */
export type MessageInfo = UserMessageInfo | AssistantMessageInfo;

// 9｜时间线条目（timeline part）

/** 时间线条目在转录里的呈现方式：分隔线，或可折叠的工作日志。 */
export type TimelinePartDisplay = "separator" | "worklog";

// 状态集合对字符串开放：时间线状态由各能力模块自定义，读侧不做白名单校验。
export type TimelinePartStatus =
  | "started"
  | "completed"
  | "failed"
  | "interrupted"
  | "cancelled"
  | string;

/** 时间线条目里冻结的模型选择，比公共 ModelSelection 多一个人工可读标签。 */
export interface TimelineModelSelection extends ModelSelection {
  label?: string;
}

/** 所有时间线条目的共有字段：定位、展示、锚点与降级溯源信息。 */
export interface TimelinePartBase {
  id: PartId;
  sessionID: SessionId;
  messageID: MessageId;
  type: "timeline";
  display: TimelinePartDisplay;
  status?: TimelinePartStatus;
  anchorMessageId?: MessageId;
  anchorTurnId?: TurnId;
  /** 用户命令产生的 marker 查重锚点；auto/system 生成的 marker 不填。 */
  sourceCommandId?: string;
  /** fork copy 的降级 provenance：当 anchor 指向未被复制过来的消息或父轮时， 本地 anchor 必须清空（不得参与 child 落位），原引用挪到 origin* 字段仅供溯源。 */
  originAnchorMessageId?: MessageId;
  originAnchorTurnId?: TurnId;
  time?: {
    start?: number;
    end?: number;
  };
}

/** 上下文压缩条目：记录一次紧凑操作的触发原因、阶段与前后 token 规模。 */
export interface ContextCompactionTimelinePart extends TimelinePartBase {
  timelineType: "context_compaction";
  operationId: string;
  trigger: CompactTrigger;
  phase?: CompactPhase;
  compactReason?: CompactReason;
  boundaryId?: string;
  summaryMessageId?: MessageId;
  preCompactTokenCount?: number;
  postCompactTokenCount?: number;
  truePostCompactTokenCount?: number;
  attempt?: number;
  maxAttempts?: number;
  reason?: string;
}

/** 目标完成校验条目：把某轮校验的结论与后续动作固定进时间线。 */
export interface GoalVerificationTimelinePart extends TimelinePartBase {
  timelineType: "goal_verification";
  targetId: string;
  verificationId: string;
  goalIteration?: number;
  verification?: {
    passed: boolean;
    reason: string;
    nextAction?: string | null;
  };
}

/** 会话分叉条目：记录从哪个父会话、哪条消息/检查点分出来的。 */
export interface SessionForkTimelinePart extends TimelinePartBase {
  timelineType: "session_fork";
  parentSessionId: SessionId;
  targetMessageId: MessageId;
  targetCheckpointId?: string;
  restoredFileCount?: number;
}

/** 模型切换条目：记录切换前后的模型选择，供转录展示与冷恢复还原。 */
export interface ModelChangeTimelinePart extends TimelinePartBase {
  timelineType: "model_change";
  fromModel?: TimelineModelSelection;
  /** 回滚后再升级时模型配置可能缺失；不能因此丢掉整条历史内容。 */
  toModel?: TimelineModelSelection & { label: string };
}

/** 时间线条目的封闭联合：由 timelineType 区分具体条目。 */
export type TimelinePart =
  | ContextCompactionTimelinePart
  | GoalVerificationTimelinePart
  | SessionForkTimelinePart
  | ModelChangeTimelinePart;

/** 待落盘的时间线条目：去掉由存储分配的标识字段后的写法。 */
export type TimelinePartDraft = TimelinePart extends infer Part
  ? Part extends TimelinePart
    ? Omit<Part, "id" | "messageID" | "sessionID" | "type">
    : never
  : never;

// 10｜消息 part
// 每个 part 都靠 (sessionID, messageID, id) 三段定位，并带自己的 type 判别标签。

/** 纯文本片段：assistant 正文与部分用户可见文本都走这里。 */
export interface TextPart {
  id: PartId;
  sessionID: SessionId;
  messageID: MessageId;
  type: "text";
  text: string;
  synthetic?: boolean;
  ignored?: boolean;
  time?: {
    start: number;
    end?: number;
  };
  metadata?: Record<string, unknown>;
}

/** 模型推理片段：与正文分开存放，便于按需展示或隐藏。 */
export interface ReasoningPart {
  id: PartId;
  sessionID: SessionId;
  messageID: MessageId;
  type: "reasoning";
  text: string;
  metadata?: Record<string, unknown>;
  time: {
    start: number;
    end?: number;
  };
}

/** 文件类 part 的来源描述：整文件、符号片段或外部资源。 */
export type FilePartSource =
  | {
      type: "file";
      path: string;
      text: { value: string; start: number; end: number };
    }
  | {
      type: "symbol";
      path: string;
      range: unknown;
      name: string;
      kind: number;
      text: { value: string; start: number; end: number };
    }
  | {
      type: "resource";
      clientName: string;
      uri: string;
      text: { value: string; start: number; end: number };
    };

/** 附件落盘后的存储元数据：体积、摘要、图片变换与可恢复性等。 */
export interface AttachmentStorageMetadata {
  sizeBytes?: number;
  sha256?: string;
  image?: {
    maxDimension?: number;
    originalWidth?: number;
    originalHeight?: number;
    width?: number;
    height?: number;
    resized?: boolean;
    transformedSizeBytes?: number;
  };
  storageKind?: "inline" | "artifact" | "local_ref" | "remote_ref" | "metadata_only";
  artifactUri?: string;
  originalUrl?: string;
  recoverability?: "provider_ready" | "rebuildable" | "preview_only" | "metadata_only" | "missing";
  preview?: {
    text?: string;
    truncated?: boolean;
    originalBytes?: number;
    startLine?: number;
    totalLines?: number;
    truncatedByTokenCap?: boolean;
    partialViewNotice?: string;
  };
  errorCode?: string;
}

/** 文件片段：带 mime 与 url 的附件引用，来源与存储元数据均可选。 */
export interface FilePart {
  id: PartId;
  sessionID: SessionId;
  messageID: MessageId;
  type: "file";
  mime: string;
  filename?: string;
  url: string;
  source?: FilePartSource;
  metadata?: AttachmentStorageMetadata;
}

/** 代理片段：正文中 @ 到的 agent 引用及其在原文里的位置。 */
export interface AgentPart {
  id: PartId;
  sessionID: SessionId;
  messageID: MessageId;
  type: "agent";
  name: string;
  source?: {
    value: string;
    start: number;
    end: number;
  };
}

/** 压缩片段：一次上下文紧凑操作的完整记账，含边界与重试信息。 */
export interface CompactionPart {
  id: PartId;
  sessionID: SessionId;
  messageID: MessageId;
  type: "compaction";
  auto: boolean;
  trigger?: CompactTrigger;
  phase?: CompactPhase;
  compactReason?: CompactReason;
  overflow?: boolean;
  tail_start_id?: MessageId;
  compactBoundary?: CompactBoundaryPayload;
  operationId?: string;
  timelineStatus?: CompactTimelineStatus;
  timelineDisplay?: CompactTimelineDisplay;
  timelineText?: string;
  replace?: boolean;
  reason?: string;
  boundaryId?: string;
  summaryMessageId?: MessageId;
  preCompactTokenCount?: number;
  postCompactTokenCount?: number;
  truePostCompactTokenCount?: number;
  attempt?: number;
  maxAttempts?: number;
  time?: {
    start?: number;
    end?: number;
  };
}

/** 子任务片段：一次委派给 subagent/工作流的提示词与目标模型。 */
export interface SubtaskPart {
  id: PartId;
  sessionID: SessionId;
  messageID: MessageId;
  type: "subtask";
  prompt: string;
  description: string;
  agent: string;
  model?: {
    providerId: ModelProviderId;
    modelId: ModelId;
  };
  command?: string;
}

/** 重试片段：第几次重试与本次失败原因，用于转录里交代重试过程。 */
export interface RetryPart {
  id: PartId;
  sessionID: SessionId;
  messageID: MessageId;
  type: "retry";
  attempt: number;
  error: AssistantErrorInfo;
  time: {
    created: number;
  };
}

/** 步骤开始片段：标记一次模型步骤的起点与当时的快照引用。 */
export interface StepStartPart {
  id: PartId;
  sessionID: SessionId;
  messageID: MessageId;
  type: "step-start";
  snapshot?: string;
}

/** 步骤结束片段：记录终止原因、快照、花费与 token 用量。 */
export interface StepFinishPart {
  id: PartId;
  sessionID: SessionId;
  messageID: MessageId;
  type: "step-finish";
  reason: string;
  snapshot?: string;
  cost: number;
  tokens: TokenUsageInfo;
}

/** 快照片段：指向一次工作区快照，供回滚与恢复使用。 */
export interface SnapshotPart {
  id: PartId;
  sessionID: SessionId;
  messageID: MessageId;
  type: "snapshot";
  snapshot: string;
}

/** 补丁片段：一次文件改动的哈希与被改动文件列表。 */
export interface PatchPart {
  id: PartId;
  sessionID: SessionId;
  messageID: MessageId;
  type: "patch";
  hash: string;
  files: string[];
}

/** 工具调用尚未开始执行。 */
export interface ToolStatePending {
  status: "pending";
  input: Record<string, unknown>;
  raw: string;
}

/** 工具调用执行中：标题与元数据可能随流式输出补充。 */
export interface ToolStateRunning {
  status: "running";
  input: Record<string, unknown>;
  title?: string;
  metadata?: Record<string, unknown>;
  time: {
    start: number;
  };
}

/** 工具调用成功：输出、标题与结束时间齐备，可带附件。 */
export interface ToolStateCompleted {
  status: "completed";
  input: Record<string, unknown>;
  output: string;
  title: string;
  metadata: Record<string, unknown>;
  time: {
    start: number;
    end: number;
    compacted?: number;
  };
  attachments?: FilePart[];
}

/** 工具调用失败：以错误文案收尾，元数据可选。 */
export interface ToolStateError {
  status: "error";
  input: Record<string, unknown>;
  error: string;
  metadata?: Record<string, unknown>;
  time: {
    start: number;
    end: number;
  };
}

/** 工具调用的状态机：pending → running → completed/error。 */
export type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError;

/** 工具片段：以 callID 关联一次工具调用及其状态机快照。 */
export interface ToolPart {
  id: PartId;
  sessionID: SessionId;
  messageID: MessageId;
  type: "tool";
  callID: string;
  /** 本地工具在同一条 assistant 消息里的声明序号；旧记录可能没有，落盘顺序不能顶替它。 */
  declarationIndex?: number;
  tool: string;
  state: ToolState;
  metadata?: Record<string, unknown>;
}

// 11｜part 联合与消息聚合

/** 一条消息可挂载的全部 part 种类。 */
export type MessagePart =
  | TextPart
  | ReasoningPart
  | FilePart
  | AgentPart
  | CompactionPart
  | TimelinePart
  | SubtaskPart
  | RetryPart
  | StepStartPart
  | StepFinishPart
  | SnapshotPart
  | PatchPart
  | ToolPart;

/** 消息与其 part 列表的聚合体；存储读取一律以该形状返回。 */
export interface MessageWithParts {
  info: MessageInfo;
  parts: MessagePart[];
}

// 12｜输入账本（session_input）
// 记录一条用户输入从被接受到被执行完毕的完整生命周期：admitted（已接受，
// 排队或等待注入）→ promoted（已消费成转录里的 user message，与消息落盘同事务）/
// cancelled（用户删除队列项等）/ discarded（会话重启不保留队列、或 heldQueue 被清空）/
// failed（已接受但运行时起不来；该终态保留，重启时不得再改写成 discarded）。
// id 即 input/command id，在 admission 时就存在；promoted_message_id 是 nullable 外键，
// 因为 messageId 要到 drain 时才生成。startNow 也必须先过 durable admission：
// 只要 CLI 在 ACK 之后、user message 原子 promotion 之前崩溃，恢复端就能把该输入
// 明确标成 discarded。

/** 输入的投递方式：立刻开跑、引导进行中的轮次，或排进队列。 */
export type SessionInputDelivery = "startNow" | "guide" | "queue";

/** 输入账本的状态取值，终态为 promoted/cancelled/discarded/failed。 */
export type SessionInputStatus = "admitted" | "promoted" | "cancelled" | "discarded" | "failed";

/** 账本记录：admission 分配的顺序号与 promotion 产生的消息 ID 都记在这里。 */
export interface SessionInputRecord {
  id: string;
  sessionID: SessionId;
  kind: string;
  delivery: SessionInputDelivery;
  payload: SessionInputPayload;
  admittedSequence: number;
  promotedSequence?: number;
  promotedMessageID?: MessageId;
  status: SessionInputStatus;
  statusReason?: string;
  time: { created: number; updated: number };
}

// 13｜用量记账（usage）

/** 一次模型请求的归属来源；未知来源保持 "unknown" 而不是猜一个。 */
export type UsageQuerySource =
  | "main_turn"
  | "compact"
  | "session_title"
  | "goal_completion_verification"
  | "subagent"
  | "workflow_child"
  | "unknown";

/** 用量记录的终态或进行态。 */
export type UsageStatus = "running" | "completed" | "error" | "cancelled";

/** 单次模型请求的用量行：时延、token、重试与错误字段均按需填充。 */
export interface ModelUsageRecord {
  id: string;
  logicalRequestId: string;
  attemptIndex?: number;
  sessionID: SessionId;
  turnID?: TurnId;
  traceID?: TraceId;
  spanID?: string;
  assistantMessageID?: MessageId;
  parentUserMessageID?: MessageId;
  querySource: UsageQuerySource | string;
  providerId: ModelProviderId | string;
  modelId: ModelId | string;
  reasoningLevel?: string;
  agent?: string;
  mode?: string;
  taskType?: SessionTaskType;
  status: UsageStatus;
  startedAt: number;
  firstTokenAt?: number;
  completedAt?: number;
  durationMs?: number;
  timeToFirstTokenMs?: number;
  finishReason?: string;
  toolCallCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  providerTotalTokens?: number;
  computedTotalTokens?: number;
  retryCount?: number;
  retryable?: boolean;
  cancelledByUser?: boolean;
  contextExceeded?: boolean;
  errorType?: string;
  errorCode?: string;
  errorMessage?: string;
  rawUsage?: unknown;
  providerMetadata?: unknown;
}

/** 轮次级用量汇总：把该轮内所有模型请求与工具调用折算成一行。 */
export interface TurnUsageRecord {
  sessionID: SessionId;
  turnID: TurnId;
  traceID?: TraceId;
  userMessageID?: MessageId;
  status: UsageStatus;
  startedAt: number;
  firstModelStartAt?: number;
  firstTokenAt?: number;
  completedAt?: number;
  durationMs?: number;
  timeToFirstTokenMs?: number;
  modelRequestCount?: number;
  modelRetryCount?: number;
  toolCallCount?: number;
  toolErrorCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  computedTotalTokens?: number;
  retryable?: boolean;
  cancelledByUser?: boolean;
  contextExceeded?: boolean;
  errorType?: string;
  errorCode?: string;
}

/** 单次工具调用的用量行：副作用范围、审批结论与耗时都在这里。 */
export interface ToolUsageRecord {
  id: string;
  sessionID: SessionId;
  turnID?: TurnId;
  traceID?: TraceId;
  toolCallID: ToolCallId | string;
  toolName: string;
  sideEffectScope?: ModelToolSideEffectScope | string;
  readOnly?: boolean;
  destructive?: boolean;
  approvalStatus?: "none" | "requested" | "allowed" | "denied";
  status: UsageStatus;
  startedAt: number;
  firstOutputAt?: number;
  completedAt?: number;
  durationMs?: number;
  timeToFirstOutputMs?: number;
  exitCode?: number;
  outputBytes?: number;
  stdoutBytes?: number;
  stderrBytes?: number;
  truncated?: boolean;
  retryCount?: number;
  retryable?: boolean;
  cancelledByUser?: boolean;
  errorType?: string;
  errorCode?: string;
  errorMessage?: string;
}

/** 应用级用量查询区间：半开区间 (since, until]，按调用端时区偏移归入本地日。 */
export interface AppUsageQueryInput {
  /** 下界（unix ms），不包含该时刻本身。 */
  since: number;
  /** 上界（unix ms），一般取当前时刻。 */
  until: number;
  /** 调用方时区相对 UTC 的固定毫秒偏移，用来把统计归入本地日。 */
  tzOffsetMs: number;
}

/** 应用级总览：token、请求与错误计数，以及首 token 平均时延。 */
export interface AppUsageTotalsRow {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  modelRequestCount: number;
  modelErrorCount: number;
  avgTimeToFirstTokenMs: number | null;
}

/** 轮次维度总览：会话/轮次数与轮次时延统计。 */
export interface AppUsageTurnTotalsRow {
  totalSessions: number;
  totalTurns: number;
  avgTurnDurationMs: number | null;
  longestSessionMs: number;
}

/** 工具维度总览：调用次数与失败次数。 */
export interface AppUsageToolTotalsRow {
  toolCallCount: number;
  toolErrorCount: number;
}

/** 按模型分组的用量行。 */
export interface AppUsageModelRow {
  modelId: string | null;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
}

/** 按工具分组的用量行。 */
export interface AppUsageToolRow {
  toolName: string;
  callCount: number;
  errorCount: number;
  avgDurationMs: number | null;
}

/** 按本地日归桶的用量行。 */
export interface AppUsageDayRow {
  dayIndex: number;
  totalTokens: number;
  turnCount: number;
  toolCallCount: number;
}

/** 本地日 × 模型的用量行，用于画分日模型分布。 */
export interface AppUsageDayModelRow {
  dayIndex: number;
  modelId: string | null;
  totalTokens: number;
}

/** 应用级用量查询结果：总览与各维度分组一次返回。 */
export interface AppUsageQueryResult {
  totals: AppUsageTotalsRow;
  turnTotals: AppUsageTurnTotalsRow;
  toolTotals: AppUsageToolTotalsRow;
  models: AppUsageModelRow[];
  tools: AppUsageToolRow[];
  days: AppUsageDayRow[];
  dayModels: AppUsageDayModelRow[];
}

/** 单任务用量查询入参。 */
export interface TaskUsageQueryInput {
  sessionID: SessionId;
}

/** 单任务用量结果：token 汇总，外加按来源划分的输入基准。 */
export interface TaskUsageQueryResult {
  sessionID: SessionId;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  modelRequestCount: number;
  modelErrorCount: number;
  inputBaselineBySource: Record<string, number>;
}

// 14｜存储端口

/** 项目级权限模式的本机设置读写；允许同步返回，兼容本地轻量实现。 */
export interface LocalSettingStorePort {
  getProjectPermissionMode(
    projectID: ProjectId,
  ): CollaborationMode | null | Promise<CollaborationMode | null>;
  saveProjectPermissionMode(input: {
    mode: CollaborationMode;
    projectID: ProjectId;
  }): CollaborationMode | Promise<CollaborationMode>;
}

/** 用量记账端口：三类记录各自 upsert，查询按应用级与单任务两个视角。 */
export interface UsageStorePort {
  recordModelUsage(input: ModelUsageRecord): Promise<void>;
  upsertTurnUsage(input: TurnUsageRecord): Promise<void>;
  upsertToolUsage(input: ToolUsageRecord): Promise<void>;
  pruneUsage(input?: { beforeTime?: number }): Promise<void>;
  queryAppUsage(input: AppUsageQueryInput): Promise<AppUsageQueryResult>;
  queryTaskUsage(input: TaskUsageQueryInput): Promise<TaskUsageQueryResult>;
}

/** 会话存储端口：会话、消息、part、入口、输入账本、todo/target 与权限的 统一读写边界。带 `?` 的方法是可选能力，旧宿主可以不实现；实现方必须自行 保证其中声明为原子的方法在单个事务内完成。 */
export interface SessionStorePort extends ProjectPermissionUpdatePort {
  // ---- 会话生命周期 ----

  createSession(input: CreateSessionInput): Promise<SessionInfo>;
  /** legacy 兼容原语；V4 stable/compact-edit fork 禁用，统一走 commitForkBundle。 */
  createForkedSessionWithMetadata?(
    input: CreateSessionInput,
    metadata: ForkChildSessionMetadata,
  ): Promise<SessionInfo>;
  /** V4 stable/compact-edit fork 的唯一事务入口；legacy workspace fork 不走这里。 */
  commitForkBundle?(bundle: ForkCommitBundle): Promise<SessionInfo>;
  updateSession(input: UpdateSessionInput): Promise<SessionInfo>;
  getSession(sessionID: SessionId): Promise<SessionInfo | null>;
  listSessions(input?: ListSessionsInput): Promise<SessionInfo[]>;

  // ---- 工作区身份维护 ----

  /** 借 host task-index 的 allowlist 给旧远端会话补上 workspace identity。 实现要同时核对 id、directory 以及 workspace_id 仍为 null，已有 identity 一律不覆盖。 */
  claimLegacySessionWorkspace?(input: ClaimLegacySessionWorkspaceInput): Promise<number>;
  /** 修掉把 remote identity 误写进 directory/path 的那种单条历史会话。 实现要核对 session id、workspace_id 为 NULL 且旧目录精确匹配，禁止批量路径迁移。 */
  repairLegacyRemoteSessionWorkspace?(
    input: RepairLegacyRemoteSessionWorkspaceInput,
  ): Promise<boolean>;
  /** 已带 remote identity 的会话做维护性路径自愈时的 CAS。 实现只允许改 directory、path 与单调递增的 time_updated，其它会话元数据不得回写。 */
  repairRemoteSessionPaths?(input: RepairRemoteSessionPathsInput): Promise<boolean>;

  // ---- 共享上下文导入 ----

  commitSharedContextImportBundle?(bundle: SharedContextImportCommitBundle): Promise<SessionInfo>;
  transitionSharedContextImport?(input: SharedContextImportTransition): Promise<boolean>;

  // ---- 消息与 part ----

  saveMessage(input: MessageInfo, copyFrom?: RecordCopySource): Promise<void>;
  removeMessage(input: MessageLocator): Promise<void>;
  savePart(input: MessagePart, copyFrom?: RecordCopySource): Promise<void>;
  removePart(input: { sessionID: SessionId; messageID: MessageId; partID: PartId }): Promise<void>;
  messageWithParts(input: MessageLocator): Promise<MessageWithParts | null>;
  messages(input: SessionLocator): Promise<MessageWithParts[]>;

  // ---- 会话入口 ----

  saveSessionEntry?(input: SessionEntryInfo): Promise<void>;
  sessionEntries?(input: {
    sessionID: SessionId;
    type?: SessionEntryType | string;
  }): Promise<SessionEntryInfo[]>;

  // ---- 输入账本（可选方法，旧宿主可以不实现）----

  /** admission：输入被接受（排队或待注入）后 durable 记账；同 id 重入即更新 payload。 */
  saveSessionInput?(input: {
    id: string;
    sessionID: SessionId;
    kind: string;
    delivery: SessionInputDelivery;
    payload: SessionInputPayload;
  }): Promise<void>;
  /** 审批完全访问：execution、固定队列权限与幂等 receipt 同一事务；不做 schema migration。 */
  commitPermissionFullAccess?(input: {
    sessionID: SessionId;
    queueItemIds: string[];
    execution: SessionEntryInfo;
    receipt: SessionEntryInfo;
    signal?: AbortSignal;
  }): Promise<void>;
  /** 队列编辑/重排的 durable 原子更新；只允许改 admitted 记录。 */
  updateSessionInputs?(input: {
    sessionID: SessionId;
    updates: Array<{
      delivery?: SessionInputDelivery;
      id: string;
      intent?: import("./session.port.js").TurnInputIntentMetadata;
      text?: string;
      queuePosition?: number;
    }>;
  }): Promise<void>;
  /** promotion（原子性硬要求）：账本置 promoted 与 user message/parts 落盘在同一事务， 杜绝「队列已消费但转录里没有 user message」的孤儿窗口。 */
  promoteSessionInput?(input: {
    id: string;
    sessionID: SessionId;
    message: MessageInfo;
    parts: MessagePart[];
  }): Promise<void>;
  /** 非原子 promotion 标记：消息已在别处落盘（如 background wake 的 synthetic notice）时 只补账本状态；新路径应优先使用原子的 promoteSessionInput。 */
  markSessionInputPromoted?(input: {
    id: string;
    sessionID: SessionId;
    promotedMessageID: MessageId;
  }): Promise<void>;
  /** 终态收口：cancelled（user_removed 等）与 discarded（session_resumed / user_cleared）。 */
  settleSessionInput?(input: {
    id: string;
    sessionID: SessionId;
    status: "cancelled" | "discarded" | "failed";
    reason?: string;
  }): Promise<void>;
  listSessionInputs?(input: {
    sessionID: SessionId;
    status?: SessionInputStatus;
  }): Promise<SessionInputRecord[]>;
  /** createSession.firstInput 的全局查重入口：顺着 queue_<sourceCommandId> 反查真实 session。 */
  getSessionInputById?(id: string): Promise<SessionInputRecord | null>;

  // ---- todo 与目标（target）----

  readTodos(input: SessionLocator): Promise<TodoItem[]>;
  updateTodos(input: { sessionID: SessionId; todos: TodoItem[] }): Promise<void>;
  readTarget(input: SessionLocator): Promise<SessionGoal | null>;
  setTarget(input: {
    objective: string;
    sessionID: SessionId;
    status?: GoalStatus;
    tokenBudget?: number | null;
  }): Promise<SessionGoal>;
  cloneTargetForFork?(input: {
    source: SessionGoal;
    sessionID: SessionId;
    status?: GoalStatus;
  }): Promise<SessionGoal>;
  createTarget(input: {
    objective: string;
    sessionID: SessionId;
    tokenBudget?: number | null;
  }): Promise<SessionGoal | null>;
  updateTargetStatus(input: {
    sessionID: SessionId;
    status: GoalStatus;
  }): Promise<SessionGoal | null>;
  startTargetRun?(input: {
    sessionID: SessionId;
    targetID: string;
    inputID: string;
    startedAtMs: number;
  }): Promise<SessionGoal | null>;
  heartbeatTargetRun?(input: {
    sessionID: SessionId;
    targetID: string;
    inputID: string;
    seenAtMs: number;
  }): Promise<SessionGoal | null>;
  finishTargetRun?(input: {
    sessionID: SessionId;
    targetID: string;
    inputID: string;
    endedAtMs: number;
    status?: GoalStatus;
    tokensUsedDelta?: number;
  }): Promise<SessionGoal | null>;
  recoverInterruptedTargetRun?(input: SessionLocator): Promise<SessionGoal | null>;
  accountTargetUsage(input: {
    sessionID: SessionId;
    targetID: string;
    tokensUsedDelta?: number;
    timeUsedSecondsDelta?: number;
  }): Promise<SessionGoal | null>;
  updateTargetSummaryTitle(input: {
    sessionID: SessionId;
    targetID: string;
    summaryTitle: string;
  }): Promise<SessionGoal | null>;
  clearTarget(input: SessionLocator): Promise<boolean>;

  // ---- 项目权限与 rewind 记录 ----

  getProjectPermission(projectID: ProjectId): Promise<PermissionRuleset | null>;
  saveProjectPermission(input: {
    projectID: ProjectId;
    permission: PermissionRuleset;
  }): Promise<PermissionRuleset>;
  setRevert(input: {
    sessionID: SessionId;
    revert: SessionRevert;
    summary?: { additions: number; deletions: number; files: number; diffs?: FileDiff[] };
  }): Promise<void>;
  clearRevert(sessionID: SessionId): Promise<void>;
}
