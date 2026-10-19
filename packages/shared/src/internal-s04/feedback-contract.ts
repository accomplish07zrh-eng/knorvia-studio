// SPDX-License-Identifier: Apache-2.0
/**
 * 反馈工单领域模型与枚举常量实现。
 * 按生命周期阶段与领域上下文对常量表及复杂接口进行分层设计。
 */

// --- 阶段状态与生命周期 ---

const PENDING_STATUS_LIST = ["已提交", "信息不足"] as const;
const PROCESSING_STATUS_LIST = ["已采纳", "开发中", "已解决", "已上线"] as const;
const RESOLVED_STATUS_LIST = ["答复关闭", "已归档", "已拒绝"] as const;

export type FeedbackTicketStatus =
  | (typeof PENDING_STATUS_LIST)[number]
  | (typeof PROCESSING_STATUS_LIST)[number]
  | (typeof RESOLVED_STATUS_LIST)[number];

export type FeedbackAttachmentKind = "log" | "image" | "other";

// --- 模块分类与问题属性 ---

const CORE_CAPABILITY_MODULES = [
  "Plugin / MCP",
  "Agent任务执行失败",
  "模型配置 / API Key",
  "模型调用报错",
] as const;

const ENVIRONMENT_MODULES = [
  "权限 / 配置保存",
  "SSH连接失败",
  "WSL连接失败",
  "UI布局 / 交互",
] as const;

const STABILITY_MODULES = [
  "模型响应慢 / 额度",
  "崩溃 / Internal Error",
  "文档 / 使用咨询",
  "其它",
] as const;

export type FeedbackTicketModule =
  | (typeof CORE_CAPABILITY_MODULES)[number]
  | (typeof ENVIRONMENT_MODULES)[number]
  | (typeof STABILITY_MODULES)[number];

export const FEEDBACK_TICKET_MODULES: FeedbackTicketModule[] = [
  ...CORE_CAPABILITY_MODULES,
  ...ENVIRONMENT_MODULES,
  ...STABILITY_MODULES,
];

export type FeedbackTicketType = "bug" | "usage" | "feature" | "performance";

const TICKET_TYPE_DEF = [
  { value: "bug" as const, label: "Bug 反馈" },
  { value: "usage" as const, label: "使用问题" },
  { value: "feature" as const, label: "功能建议" },
  { value: "performance" as const, label: "性能问题" },
];

export const FEEDBACK_TICKET_TYPES: { value: FeedbackTicketType; label: string }[] = [
  ...TICKET_TYPE_DEF,
];

export const FEEDBACK_TICKET_SEVERITIES = ["P1-高", "P2-中", "P3-低"] as const;
export type FeedbackTicketSeverity = (typeof FEEDBACK_TICKET_SEVERITIES)[number];

// --- 框架与 UI 下拉选项 ---

export type FeedbackTicketFramework = "agent";
export const DEFAULT_FEEDBACK_TICKET_FRAMEWORK: FeedbackTicketFramework = "agent";

export const FEEDBACK_FRAMEWORK_NONE = "none" as const;
export type FeedbackTicketFrameworkSelectValue =
  | FeedbackTicketFramework
  | typeof FEEDBACK_FRAMEWORK_NONE;

export const FEEDBACK_TICKET_FRAMEWORK_OPTIONS: {
  value: FeedbackTicketFramework;
  label: string;
}[] = [{ value: "agent", label: "Knorvia Studio Agent" }];

export const FEEDBACK_TICKET_FRAMEWORKS: {
  value: FeedbackTicketFrameworkSelectValue;
  label: string;
}[] = [{ value: FEEDBACK_FRAMEWORK_NONE, label: "未指定" }, ...FEEDBACK_TICKET_FRAMEWORK_OPTIONS];

// --- 实体与设备上下文接口分层设计 ---

export interface FeedbackReporter {
  user_id?: string;
  username?: string;
  display_name?: string;
}

interface ApplicationReleaseInfo {
  appVersion?: string;
  buildCommitId?: string;
  buildTime?: string;
}

interface RuntimePlatformInfo {
  electronVersion?: string;
  nodeVersion?: string;
  osType?: string;
  osPlatform?: string;
  osRelease?: string;
  osVersion?: string;
  osArch?: string;
}

interface SessionModelContext {
  agentProvider?: string;
  agentFramework?: FeedbackTicketFramework;
  agentModel?: string;
  agentModelDisplay?: string;
  agentModelOptionCount?: number;
  agentModelOptionsPreview?: string[];
}

interface HostIdentityContext {
  hostname?: string;
  deviceMid?: string;
}

export interface FeedbackDeviceInfo
  extends ApplicationReleaseInfo,
    RuntimePlatformInfo,
    SessionModelContext,
    HostIdentityContext {}

export interface CreateFeedbackTicketInput {
  title: string;
  description: string;
  type: FeedbackTicketType;
  severity?: FeedbackTicketSeverity;
  module?: FeedbackTicketModule;
  framework?: FeedbackTicketFramework;
  source?: string;
  reporter?: FeedbackReporter;
  device?: FeedbackDeviceInfo;
  contact?: string;
  locale?: "zh-CN" | "en-US";
}

interface TicketBaseProperties {
  id: string;
  title: string;
  type: FeedbackTicketType;
  severity?: FeedbackTicketSeverity;
  module?: FeedbackTicketModule;
  status: FeedbackTicketStatus;
}

interface TicketAuditTimestamps {
  last_user_activity_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface TicketStakeholderInfo {
  assignee_id?: string | null;
  assignee_display?: string | null;
  reporter_display?: string | null;
  unread?: boolean;
}

export interface FeedbackTicketSummary
  extends TicketBaseProperties,
    TicketStakeholderInfo,
    TicketAuditTimestamps {}

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

interface StoredFileMetadata {
  filename: string;
  size: number;
  content_type?: string | null;
  download_url?: string | null;
  preview_url?: string | null;
}

export interface FeedbackAttachment extends StoredFileMetadata {
  id: number;
  kind: FeedbackAttachmentKind;
  sha256?: string | null;
  redacted: boolean;
  created_at: string;
}

export interface FeedbackCommentAttachment extends StoredFileMetadata {
  id: number;
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

interface FeedbackRelations {
  attachments: FeedbackAttachment[];
  comments: FeedbackComment[];
  events: FeedbackTicketEvent[];
  lark_record_id?: string | null;
}

export interface FeedbackTicketDetail extends FeedbackTicketSummary, FeedbackRelations {
  description: string;
  framework?: FeedbackTicketFramework;
  reporter?: FeedbackReporter | null;
  device?: FeedbackDeviceInfo | null;
}

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
