// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

/*
 * 会话创建埋点的两个变体（手机转发 / Host 自动化）。
 *
 * 两者共享同一层信封，只有 eventExtraDetail 的取值集合不同；因此把
 * 信封与明细都写成「登记表 → zod 形状」的投影，避免同一批字段抄两遍。
 */

/** 会话创建的入口来源。 */
const CREATE_SOURCE_VALUES = ["group", "project", "session"] as const;
/** 客户端形态。 */
const CLIENT_KIND_VALUES = ["desktop", "mobile", "web"] as const;

export type SessionCreateSource = (typeof CREATE_SOURCE_VALUES)[number];
export type SessionCreateClientKind = (typeof CLIENT_KIND_VALUES)[number];

/** 信封上三个固定字面量；键名即输出字段名。 */
const ENVELOPE_LITERALS = {
  elementName: "session_create",
  eventRegion: "app",
  eventType: "result",
} as const;

/** 客户端环境字段 → 最大长度；只限长度，不校验内容。 */
const CONTEXT_LIMITS = {
  clientTimezone: 128,
  clientLanguage: 128,
  screenResolution: 64,
} as const;

/** 投影结果按键映射声明，字面量与字段名都不会在 Object.fromEntries 处塌成索引签名。 */
type EnvelopeShape = {
  [Field in keyof typeof ENVELOPE_LITERALS]: z.ZodLiteral<(typeof ENVELOPE_LITERALS)[Field]>;
};

type ContextShape = { [Field in keyof typeof CONTEXT_LIMITS]: z.ZodString };

/** 把登记表投影成 `{ 字段: ZodLiteral }`。 */
const envelopeShape = (): EnvelopeShape =>
  Object.fromEntries(
    Object.entries(ENVELOPE_LITERALS).map(([key, value]) => [key, z.literal(value)]),
  ) as EnvelopeShape;

/** 把长度表投影成 `{ 字段: ZodString }`。 */
const contextShape = (): ContextShape =>
  Object.fromEntries(
    Object.entries(CONTEXT_LIMITS).map(([key, maximum]) => [key, z.string().max(maximum)]),
  ) as ContextShape;

const sessionIdField = z.string().min(1).max(512);
const workspaceKindField = z.enum(["local", "remote"]);
const remoteKindField = z.enum(["", "ssh", "wsl", "docker", "server"]);

/** 明细整体 strict：多传字段即拒绝，防止手机端塞入桌面专有字段。 */
const strictDetail = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape).strict();

const envelopeShapeWith = <Shape extends z.ZodRawShape>(detail: Shape) =>
  z
    .object({
      ...envelopeShape(),
      talkId: sessionIdField,
      messageId: sessionIdField,
      context: z.object(contextShape()).strict(),
      eventExtraDetail: strictDetail(detail),
    })
    .strict();

/** 手机转发只开放本事件；公共用户/设备身份仍由桌面 TelemetryCore 注入。 */
export const sessionCreateTelemetrySchema = envelopeShapeWith({
  create_source: z.enum(CREATE_SOURCE_VALUES),
  client_kind: z.literal("mobile"),
  workspace_kind: workspaceKindField,
  remote_kind: remoteKindField,
});

export type MobileSessionCreateTelemetry = z.infer<typeof sessionCreateTelemetrySchema>;

/**
 * 自动化由执行 Host 报告；来源换成两种自动化触发，客户端锁死 desktop，
 * 手机不得冒充无人值守派发来源。
 */
export const automationSessionCreateTelemetrySchema = envelopeShapeWith({
  create_source: z.enum(["automation_idle", "automation_scheduled"]),
  client_kind: z.literal("desktop"),
  workspace_kind: workspaceKindField,
  remote_kind: remoteKindField,
});

type AutomationEnvelope = typeof automationSessionCreateTelemetrySchema;

export type AutomationSessionCreateTelemetry = z.infer<AutomationEnvelope>;
