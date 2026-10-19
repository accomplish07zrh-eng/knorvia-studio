// SPDX-License-Identifier: Apache-2.0
/**
 * 反馈工单领域模型与工单状态机规范。
 * 管理用户工单全生命周期状态流转、严重度分级、诊断附件模型及事件追踪。
 */

interface TicketTypeConfigItem {
  readonly value: "bug" | "usage" | "feature" | "performance";
  readonly label: string;
  readonly defaultPriority: "P1-高" | "P2-中" | "P3-低";
}

const TICKET_TYPE_CATALOG: readonly TicketTypeConfigItem[] = [
  { value: "bug", label: "Bug 反馈", defaultPriority: "P1-高" },
  { value: "usage", label: "使用问题", defaultPriority: "P3-低" },
  { value: "feature", label: "功能建议", defaultPriority: "P3-低" },
  { value: "performance", label: "性能问题", defaultPriority: "P2-中" },
];

export type FeedbackTicketType = (typeof TICKET_TYPE_CATALOG)[number]["value"];

export const FEEDBACK_TICKET_TYPES: { value: FeedbackTicketType; label: string }[] =
  TICKET_TYPE_CATALOG.map((item) => ({
    value: item.value,
    label: item.label,
  }));

const TICKET_STATUS_LIFECYCLE_STEPS = [
  "已提交",
  "信息不足",
  "已采纳",
  "开发中",
  "已解决",
  "已上线",
  "答复关闭",
  "已拒绝",
  "已归档",
] as const;

export type FeedbackTicketStatus = (typeof TICKET_STATUS_LIFECYCLE_STEPS)[number];

const ATTACHMENT_MEDIA_KINDS = ["log", "image", "other"] as const;
export type FeedbackAttachmentKind = (typeof ATTACHMENT_MEDIA_KINDS)[number];

interface TicketModuleCatalogEntry {
  readonly moduleName:
    | "Plugin / MCP"
    | "Agent任务执行失败"
    | "模型配置 / API Key"
    | "模型调用报错"
    | "权限 / 配置保存"
    | "SSH连接失败"
    | "WSL连接失败"
    | "UI布局 / 交互"
    | "模型响应慢 / 额度"
    | "崩溃 / Internal Error"
    | "文档 / 使用咨询"
    | "其它";
  readonly domainGroup: string;
}

const TICKET_MODULE_REGISTRY: readonly TicketModuleCatalogEntry[] = [
  { moduleName: "Plugin / MCP", domainGroup: "plugins" },
  { moduleName: "Agent任务执行失败", domainGroup: "agent" },
  { moduleName: "模型配置 / API Key", domainGroup: "models" },
  { moduleName: "模型调用报错", domainGroup: "models" },
  { moduleName: "权限 / 配置保存", domainGroup: "config" },
  { moduleName: "SSH连接失败", domainGroup: "remote" },
  { moduleName: "WSL连接失败", domainGroup: "remote" },
  { moduleName: "UI布局 / 交互", domainGroup: "ui" },
  { moduleName: "模型响应慢 / 额度", domainGroup: "models" },
  { moduleName: "崩溃 / Internal Error", domainGroup: "runtime" },
  { moduleName: "文档 / 使用咨询", domainGroup: "help" },
  { moduleName: "其它", domainGroup: "general" },
];

export type FeedbackTicketModule = (typeof TICKET_MODULE_REGISTRY)[number]["moduleName"];

export const FEEDBACK_TICKET_MODULES: FeedbackTicketModule[] = TICKET_MODULE_REGISTRY.map(
  (entry) => entry.moduleName,
);

export type FeedbackTicketFramework = "agent";

export const FEEDBACK_FRAMEWORK_NONE = "none" as const;

export type FeedbackTicketFrameworkSelectValue =
  | FeedbackTicketFramework
  | typeof FEEDBACK_FRAMEWORK_NONE;

const TICKET_SEVERITY_LEVEL_LIST = ["P1-高", "P2-中", "P3-低"] as const;

export type FeedbackTicketSeverity = (typeof TICKET_SEVERITY_LEVEL_LIST)[number];

export const FEEDBACK_TICKET_SEVERITIES: FeedbackTicketSeverity[] = [
  ...TICKET_SEVERITY_LEVEL_LIST,
];

export const DEFAULT_FEEDBACK_TICKET_FRAMEWORK: FeedbackTicketFramework = "agent";

export const FEEDBACK_TICKET_FRAMEWORK_OPTIONS: {
  value: FeedbackTicketFramework;
  label: string;
}[] = [{ value: "agent", label: "Knorvia Studio Agent" }];

export const FEEDBACK_TICKET_FRAMEWORKS: {
  value: FeedbackTicketFrameworkSelectValue;
  label: string;
}[] = [{ value: FEEDBACK_FRAMEWORK_NONE, label: "未指定" }, ...FEEDBACK_TICKET_FRAMEWORK_OPTIONS];

export interface FeedbackReporter {
  user_id?: string;
  username?: string;
  display_name?: string;
}

interface HostPlatformDiagnosticIdentity {
  osType?: string;
  osPlatform?: string;
  osRelease?: string;
  osVersion?: string;
  osArch?: string;
  hostname?: string;
  deviceMid?: string;
}

interface ApplicationBuildDiagnosticMeta {
  appVersion?: string;
  buildCommitId?: string;
  buildTime?: string;
  electronVersion?: string;
  nodeVersion?: string;
}

interface AgentDiagnosticTelemetryState {
  agentProvider?: string;
  agentFramework?: FeedbackTicketFramework;
  agentModel?: string;
  agentModelDisplay?: string;
  agentModelOptionCount?: number;
  agentModelOptionsPreview?: string[];
}

export interface FeedbackDeviceInfo
  extends HostPlatformDiagnosticIdentity,
    ApplicationBuildDiagnosticMeta,
    AgentDiagnosticTelemetryState {}

interface TicketContentSubmissionPayload {
  title: string;
  description: string;
  type: FeedbackTicketType;
  severity?: FeedbackTicketSeverity;
  module?: FeedbackTicketModule;
  framework?: FeedbackTicketFramework;
  source?: string;
}

interface TicketContextSubmissionMeta {
  reporter?: FeedbackReporter;
  device?: FeedbackDeviceInfo;
  contact?: string;
  locale?: "zh-CN" | "en-US";
}

export interface CreateFeedbackTicketInput
  extends TicketContentSubmissionPayload,
    TicketContextSubmissionMeta {}

interface TicketIdentityClassification {
  id: string;
  title: string;
  type: FeedbackTicketType;
  severity?: FeedbackTicketSeverity;
  module?: FeedbackTicketModule;
  status: FeedbackTicketStatus;
}

interface TicketAssigneeParticipantMeta {
  assignee_id?: string | null;
  assignee_display?: string | null;
  reporter_display?: string | null;
}

interface TicketLifecycleTimestamps {
  unread?: boolean;
  last_user_activity_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeedbackTicketSummary
  extends TicketIdentityClassification,
    TicketAssigneeParticipantMeta,
    TicketLifecycleTimestamps {}

export type FeedbackTicketEventType =
  | "created"
  | "status_changed"
  | "assignee_changed"
  | "staff_replied"
  | "user_replied";

export interface FeedbackTicketEvent {
  id: number;
  type: FeedbackTicketEventType;
  summary: string;
  actor_display_name?: string | null;
  payload?: Record<string, unknown> | null;
  created_at: string;
}

interface RemoteAssetMetadataFields {
  id: number;
  filename: string;
  size: number;
  content_type?: string | null;
  download_url?: string | null;
  preview_url?: string | null;
}

export interface FeedbackCommentAttachment extends RemoteAssetMetadataFields {}

export interface FeedbackAttachment extends RemoteAssetMetadataFields {
  kind: FeedbackAttachmentKind;
  sha256?: string | null;
  redacted: boolean;
  created_at: string;
}

export interface FeedbackComment {
  id: number;
  message_id?: string;
  author_user_id?: string | null;
  author_display_name?: string | null;
  body: string;
  attachments?: FeedbackCommentAttachment[];
  is_staff: boolean;
  created_at: string;
}

interface TicketDetailSupplementaryBody {
  description: string;
  framework?: FeedbackTicketFramework;
  reporter?: FeedbackReporter | null;
  device?: FeedbackDeviceInfo | null;
  lark_record_id?: string | null;
}

interface TicketDetailCompositeCollections {
  attachments: FeedbackAttachment[];
  comments: FeedbackComment[];
  events: FeedbackTicketEvent[];
}

export interface FeedbackTicketDetail
  extends FeedbackTicketSummary,
    TicketDetailSupplementaryBody,
    TicketDetailCompositeCollections {}

export interface FeedbackListQuery {
  mine?: boolean;
  status?: FeedbackTicketStatus;
  type?: FeedbackTicketType;
  offset?: number;
  limit?: number;
}

export interface FeedbackListResult {
  items: FeedbackTicketSummary[];
  total: number;
}

// 内部状态机驱动：工单生命周期合法流转判定表
const ALLOWED_TICKET_STATUS_TRANSITIONS: ReadonlyMap<
  FeedbackTicketStatus,
  ReadonlySet<FeedbackTicketStatus>
> = new Map([
  [
    "已提交",
    new Set<FeedbackTicketStatus>(["信息不足", "已采纳", "已拒绝", "答复关闭"]),
  ],
  ["信息不足", new Set<FeedbackTicketStatus>(["已提交", "已归档", "已拒绝"])],
  ["已采纳", new Set<FeedbackTicketStatus>(["开发中", "已拒绝"])],
  ["开发中", new Set<FeedbackTicketStatus>(["已解决", "已拒绝"])],
  ["已解决", new Set<FeedbackTicketStatus>(["已上线", "已归档"])],
  ["已上线", new Set<FeedbackTicketStatus>(["已归档"])],
  ["已拒绝", new Set<FeedbackTicketStatus>(["已归档"])],
  ["答复关闭", new Set<FeedbackTicketStatus>(["已归档", "已提交"])],
  ["已归档", new Set<FeedbackTicketStatus>()],
]);

function isPermittedStatusTransition(
  sourceStatus: FeedbackTicketStatus,
  targetStatus: FeedbackTicketStatus,
): boolean {
  if (sourceStatus === targetStatus) {
    return true;
  }
  const allowedNext = ALLOWED_TICKET_STATUS_TRANSITIONS.get(sourceStatus);
  return allowedNext !== undefined && allowedNext.has(targetStatus);
}

function resolveSeverityRankWeight(severity: FeedbackTicketSeverity | undefined): number {
  switch (severity) {
    case "P1-高":
      return 30;
    case "P2-中":
      return 20;
    case "P3-低":
      return 10;
    default:
      return 0;
  }
}

function classifyTicketResolutionMaturity(status: FeedbackTicketStatus): "open" | "progress" | "resolved" | "closed" {
  switch (status) {
    case "已提交":
    case "信息不足":
      return "open";
    case "已采纳":
    case "开发中":
      return "progress";
    case "已解决":
    case "已上线":
      return "resolved";
    case "已归档":
    case "已拒绝":
    case "答复关闭":
      return "closed";
  }
}

function sanitizeReporterDisplayIdentity(reporter: FeedbackReporter | null | undefined): string | null {
  if (!reporter) {
    return null;
  }
  const candidate = reporter.display_name?.trim() || reporter.username?.trim();
  return candidate && candidate.length > 0 ? candidate : null;
}
