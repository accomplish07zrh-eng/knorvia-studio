// SPDX-License-Identifier: Apache-2.0
/**
 * 反馈工单领域模型：类型、状态、严重度、模块、附件种类与提交框架的字典表，以及由字典派生的纯类型。
 *
 * 数据流：每个枚举先登记成 `as const` 字典（工单类型带标签、模块带归属域、状态带生命周期阶段、
 * 严重度带紧急度权重），运行时常量表由字典投影或排序得到，纯类型用 `typeof` 从同一份字典取键。
 * 字典是唯一事实来源，新增一个模块/类型/状态只需要改一处登记，派生结果自动跟上。
 *
 * 纯声明式模块：无状态、无 IO、无日志，任何时刻重复读取都得到同一份结果。
 */

/** 下拉选项的统一投影形态。 */
type LabeledOption<Value extends string> = { value: Value; label: string };

/** 把字典投影成 `{value,label}` 选项表；字典里的其他列不对外暴露。 */
const projectLabeledOptions = <Id extends string>(
  dictionary: readonly { readonly id: Id; readonly label: string }[],
): LabeledOption<Id>[] => dictionary.map(({ id, label }) => ({ value: id, label }));

/**
 * 字段袋：把取值形态相同的字段名写成联合字面量，一次声明它们的取值类型。
 * 工单模型的 11 个接口用 `extends` 组合若干字段袋，字段的必填/可选由袋类型决定。
 */
type RequiredBag<Keys extends PropertyKey, Value> = Record<Keys, Value>;
type OptionalBag<Keys extends PropertyKey, Value> = Partial<Record<Keys, Value>>;

// ── 工单类型：4 项，顺序即展示顺序 ────────────────────────────────────────────

const TICKET_TYPE_DICTIONARY = [
  { id: "bug", label: "Bug 反馈" },
  { id: "usage", label: "使用问题" },
  { id: "feature", label: "功能建议" },
  { id: "performance", label: "性能问题" },
] as const;

export type FeedbackTicketType = (typeof TICKET_TYPE_DICTIONARY)[number]["id"];

export const FEEDBACK_TICKET_TYPES: LabeledOption<FeedbackTicketType>[] =
  projectLabeledOptions(TICKET_TYPE_DICTIONARY);

// ── 工单状态：9 个生命周期状态，phase 标注所处阶段 ────────────────────────────

const TICKET_STATUS_DICTIONARY = [
  { id: "已提交", phase: "intake" },
  { id: "信息不足", phase: "intake" },
  { id: "已采纳", phase: "triage" },
  { id: "开发中", phase: "delivery" },
  { id: "已解决", phase: "resolution" },
  { id: "已上线", phase: "released" },
  { id: "答复关闭", phase: "closed" },
  { id: "已拒绝", phase: "closed" },
  { id: "已归档", phase: "archived" },
] as const;

export type FeedbackTicketStatus = (typeof TICKET_STATUS_DICTIONARY)[number]["id"];

// ── 问题模块：12 项固定顺序，domain 标注归属功能域 ────────────────────────────

const TICKET_MODULE_DICTIONARY = [
  { id: "Plugin / MCP", domain: "plugins" },
  { id: "Agent任务执行失败", domain: "agent" },
  { id: "模型配置 / API Key", domain: "models" },
  { id: "模型调用报错", domain: "models" },
  { id: "权限 / 配置保存", domain: "config" },
  { id: "SSH连接失败", domain: "remote" },
  { id: "WSL连接失败", domain: "remote" },
  { id: "UI布局 / 交互", domain: "ui" },
  { id: "模型响应慢 / 额度", domain: "models" },
  { id: "崩溃 / Internal Error", domain: "runtime" },
  { id: "文档 / 使用咨询", domain: "help" },
  { id: "其它", domain: "general" },
] as const;

export type FeedbackTicketModule = (typeof TICKET_MODULE_DICTIONARY)[number]["id"];

export const FEEDBACK_TICKET_MODULES: FeedbackTicketModule[] = TICKET_MODULE_DICTIONARY.map(
  (entry) => entry.id,
);

// ── 严重度：按紧急度权重降序投影，权重是排序的唯一依据 ────────────────────────

const SEVERITY_DICTIONARY = [
  { id: "P1-高", urgency: 3 },
  { id: "P2-中", urgency: 2 },
  { id: "P3-低", urgency: 1 },
] as const;

export type FeedbackTicketSeverity = (typeof SEVERITY_DICTIONARY)[number]["id"];

export const FEEDBACK_TICKET_SEVERITIES: FeedbackTicketSeverity[] = SEVERITY_DICTIONARY.toSorted(
  (left, right) => right.urgency - left.urgency,
).map((entry) => entry.id);

// ── 提交框架：内置 agent 框架 + 未指定哨兵值 ─────────────────────────────────

const FRAMEWORK_OPTION_DICTIONARY = [{ id: "agent", label: "Knorvia Studio Agent" }] as const;
const FRAMEWORK_NONE_ID = "none" as const;

export type FeedbackTicketFramework = (typeof FRAMEWORK_OPTION_DICTIONARY)[number]["id"];

export type FeedbackTicketFrameworkSelectValue = FeedbackTicketFramework | typeof FRAMEWORK_NONE_ID;

export const DEFAULT_FEEDBACK_TICKET_FRAMEWORK = "agent" satisfies FeedbackTicketFramework;

export const FEEDBACK_FRAMEWORK_NONE = FRAMEWORK_NONE_ID;

export const FEEDBACK_TICKET_FRAMEWORK_OPTIONS: LabeledOption<FeedbackTicketFramework>[] =
  projectLabeledOptions(FRAMEWORK_OPTION_DICTIONARY);

export const FEEDBACK_TICKET_FRAMEWORKS: LabeledOption<FeedbackTicketFrameworkSelectValue>[] = [
  { value: FEEDBACK_FRAMEWORK_NONE, label: "未指定" },
  ...FEEDBACK_TICKET_FRAMEWORK_OPTIONS,
];

// ── 附件种类与事件种类 ───────────────────────────────────────────────────────

const ATTACHMENT_KIND_IDS = ["log", "image", "other"] as const;

export type FeedbackAttachmentKind = (typeof ATTACHMENT_KIND_IDS)[number];

const TICKET_EVENT_KIND_IDS = [
  "created",
  "status_changed",
  "assignee_changed",
  "staff_replied",
  "user_replied",
] as const;

export type FeedbackTicketEventType = (typeof TICKET_EVENT_KIND_IDS)[number];

// ── 工单模型：全部由字段袋交叉而成 ───────────────────────────────────────────

export interface FeedbackReporter extends OptionalBag<
  "user_id" | "username" | "display_name",
  string
> {}

export interface FeedbackDeviceInfo
  extends
    OptionalBag<
      | "appVersion"
      | "buildCommitId"
      | "buildTime"
      | "electronVersion"
      | "nodeVersion"
      | "osType"
      | "osPlatform"
      | "osRelease"
      | "osVersion"
      | "osArch"
      | "hostname"
      | "deviceMid"
      | "agentProvider"
      | "agentModel"
      | "agentModelDisplay",
      string
    >,
    OptionalBag<"agentFramework", FeedbackTicketFramework>,
    OptionalBag<"agentModelOptionCount", number>,
    OptionalBag<"agentModelOptionsPreview", string[]> {}

export interface CreateFeedbackTicketInput
  extends
    RequiredBag<"title" | "description", string>,
    RequiredBag<"type", FeedbackTicketType>,
    OptionalBag<"severity", FeedbackTicketSeverity>,
    OptionalBag<"module", FeedbackTicketModule>,
    OptionalBag<"framework", FeedbackTicketFramework>,
    OptionalBag<"source" | "contact", string>,
    OptionalBag<"locale", "zh-CN" | "en-US">,
    OptionalBag<"reporter", FeedbackReporter>,
    OptionalBag<"device", FeedbackDeviceInfo> {}

export interface FeedbackTicketSummary
  extends
    RequiredBag<"id" | "title", string>,
    RequiredBag<"type", FeedbackTicketType>,
    RequiredBag<"status", FeedbackTicketStatus>,
    RequiredBag<"created_at" | "updated_at", string>,
    OptionalBag<"severity", FeedbackTicketSeverity>,
    OptionalBag<"module", FeedbackTicketModule>,
    OptionalBag<"unread", boolean>,
    OptionalBag<
      "assignee_id" | "assignee_display" | "reporter_display" | "last_user_activity_at",
      string | null
    > {}

export interface FeedbackTicketEvent
  extends
    RequiredBag<"id", number>,
    RequiredBag<"type", FeedbackTicketEventType>,
    RequiredBag<"summary" | "created_at", string>,
    OptionalBag<"actor_display_name", string | null>,
    OptionalBag<"payload", Record<string, unknown> | null> {}

export interface FeedbackCommentAttachment
  extends
    RequiredBag<"id" | "size", number>,
    RequiredBag<"filename", string>,
    OptionalBag<"content_type" | "download_url" | "preview_url", string | null> {}

export interface FeedbackAttachment
  extends
    FeedbackCommentAttachment,
    RequiredBag<"kind", FeedbackAttachmentKind>,
    RequiredBag<"redacted", boolean>,
    RequiredBag<"created_at", string>,
    OptionalBag<"sha256", string | null> {}

export interface FeedbackComment
  extends
    RequiredBag<"id", number>,
    RequiredBag<"body" | "created_at", string>,
    RequiredBag<"is_staff", boolean>,
    OptionalBag<"message_id", string>,
    OptionalBag<"author_user_id" | "author_display_name", string | null>,
    OptionalBag<"attachments", FeedbackCommentAttachment[]> {}

export interface FeedbackTicketDetail
  extends
    FeedbackTicketSummary,
    RequiredBag<"description", string>,
    RequiredBag<"attachments", FeedbackAttachment[]>,
    RequiredBag<"comments", FeedbackComment[]>,
    RequiredBag<"events", FeedbackTicketEvent[]>,
    OptionalBag<"framework", FeedbackTicketFramework>,
    OptionalBag<"lark_record_id", string | null>,
    OptionalBag<"reporter", FeedbackReporter | null>,
    OptionalBag<"device", FeedbackDeviceInfo | null> {}

export interface FeedbackListQuery
  extends
    OptionalBag<"mine", boolean>,
    OptionalBag<"status", FeedbackTicketStatus>,
    OptionalBag<"type", FeedbackTicketType>,
    OptionalBag<"offset" | "limit", number> {}

export interface FeedbackListResult
  extends RequiredBag<"total", number>, RequiredBag<"items", FeedbackTicketSummary[]> {}
