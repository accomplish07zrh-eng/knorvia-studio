// SPDX-License-Identifier: Apache-2.0
// 基础校验 schema 与错误格式化（B44）。字段级注解即各字段的校验语义。
import { databaseStartupControlSchema, databaseStartupStateSchema } from "./database-startup.js";
import { automationSessionCreateTelemetrySchema } from "./sessionCreateTelemetry.js";
/* eslint-disable max-lines -- 运行时 schema 当前集中在共享包入口，外部 relay payload 校验加入后先保持单一导出面。 */
import { z } from "zod";
import { knorviaProcessDiagnosticSchema } from "./process-diagnostic.js";
import { browserCommandSchema } from "./browser-use/commands.js";
import { browserCommandResultSchema } from "./browser-use/result.js";
import { REMOTE_ASSET_INSTALL_MODES } from "./remoteAssetInstallMode.js";
import { PROCESS_RESOURCE_CLI_LANES } from "./processResourceTelemetry.js";
import { isKnownRemoteResourcePackageId } from "./remoteResourcePackages.js";
import { knorviaProviderSchema } from "./providers.js";
import { persistedAgentProviderSchema } from "./agent-policy.js";
import { modelSelectionSchema } from "./model-selection.js";
import {
  knorviaMcpTelemetryEventSchema, // 判别联合成员
  knorviaMcpResourceSamplesSchema, // 判别联合成员
  knorviaToolExecResourceSchema, // 判别联合成员
  knorviaProcessResourceSampleSchema, // 判别联合成员
} from "./protocol/index.js";
import { knorviaTaskModeSchema } from "./task-mode-schema.js";
import { errorAttributionSchema } from "./protocol-v4/snapshot.js";
import {
  taskOwnerCommandDeliverySchema, // 判别联合成员
  taskOwnerCommandRequestSchema, // 判别联合成员
  taskOwnerCommandResultSchema, // 判别联合成员
  taskRealtimeDeliveredEventSchema, // 判别联合成员
  taskRealtimeEventSchema, // 判别联合成员
  taskRealtimeHostDeliveryKindSchema, // 判别联合成员
  taskRunLeaseAcquireRequestSchema, // 判别联合成员
  taskRunLeaseResultSchema, // 判别联合成员
  taskRunLeaseTargetSchema, // 判别联合成员
  taskStreamMirrorPublishOpSchema, // 判别联合成员
  taskStreamMirrorTargetSchema, // 判别联合成员
} from "./task-realtime-core.js";

export { WSL_USER_MAX_LENGTH, isValidWslUser, wslUserSchema } from "./wslUserValidation.js";
export { knorviaTaskModeSchema } from "./task-mode-schema.js";
import { wslUserSchema } from "./wslUserValidation.js";
export {
  appSettingsOccupationEnum,
  appSettingsPatchSchema, // 判别联合成员
  appSettingsSchema, // 判别联合成员
  localeSchema, // 判别联合成员
  postUpdateReleaseNotesPayloadSchema, // 判别联合成员
} from "./validationAppSettings.js";

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      // 链式修饰
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    }) // schema 收口
    .join("; "); // 链式修饰
} // 字段组收口

export const nonEmptyStringSchema = z.string().trim().min(1); // nonEmptyStringSchema 的定义
export const stringArraySchema = z.array(z.string()); // stringArraySchema 的定义
export const credentialRecordSchema = z.record(z.string(), z.string()); // credentialRecordSchema 的定义
export const credentialKeySchema = nonEmptyStringSchema; // credentialKeySchema 的定义
export const credentialValueSchema = z.string(); // credentialValueSchema 的定义

export const sshConnectOptionsSchema = z.object({
  // sshConnectOptionsSchema 的定义
  // sshConnectOptionsSchema 的定义
  kind: /* 字面量 */ z.literal("ssh"),
  host: /* 嵌套结构 */ nonEmptyStringSchema,
  port: /* 数值 */ z.number().int().positive().max(65535).optional(),
  username: /* 嵌套结构 */ nonEmptyStringSchema,
  sshConfigAlias: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  password: /* 文本 */ z.string().optional(),
  privateKeyPath: /* 文本 */ z.string().optional(),
  privateKeyPassphrase: /* 文本 */ z.string().optional(),
  assetInstallMode: /* 枚举 */ z.enum(REMOTE_ASSET_INSTALL_MODES).optional(),
  resourcePackages: /* 嵌套结构 */ z
    .object({
      // 链式修饰
      // 修饰链
      selectedPackageIds: /* 数组 */ z
        .array(z.string().refine(isKnownRemoteResourcePackageId)) // 链式修饰
        .optional(), // 修饰链
    }) // sshConnectOptionsSchema 收口
    .optional(), // 修饰链
}); // sshConnectOptionsSchema 收口

export const wslConnectOptionsSchema = z.object({
  // wslConnectOptionsSchema 的定义
  // wslConnectOptionsSchema 的定义
  kind: /* 字面量 */ z.literal("wsl"),
  distro: /* 文本 */ z.string().optional(),
  user: /* 嵌套结构 */ wslUserSchema.optional(),
}); // wslConnectOptionsSchema 收口

export const dockerConnectOptionsSchema = z.object({
  // dockerConnectOptionsSchema 的定义
  // dockerConnectOptionsSchema 的定义
  kind: /* 字面量 */ z.literal("docker"),
  container: /* 嵌套结构 */ nonEmptyStringSchema,
}); // dockerConnectOptionsSchema 收口

export const remoteTargetSchema = z.discriminatedUnion("kind", [
  // remoteTargetSchema 的定义
  // remoteTargetSchema 的定义
  sshConnectOptionsSchema, // 判别联合成员
  wslConnectOptionsSchema, // 判别联合成员
  dockerConnectOptionsSchema, // 判别联合成员
]);

export const helloMessageSchema = z.object({
  // helloMessageSchema 的定义
  // helloMessageSchema 的定义
  type: /* 字面量 */ z.literal("knorvia-hello"),
  version: /* 文本 */ z.string(),
  platform: /* 文本 */ z.string(),
  arch: /* 文本 */ z.string(),
  pid: /* 数值 */ z.number().int(),
}); // helloMessageSchema 收口

export const helloAckMessageSchema = z.object({
  // helloAckMessageSchema 的定义
  // helloAckMessageSchema 的定义
  type: /* 字面量 */ z.literal("knorvia-hello-ack"),
  version: /* 文本 */ z.string(),
  clientId: /* 嵌套结构 */ nonEmptyStringSchema,
}); // helloAckMessageSchema 收口

export const rendererLogPayloadSchema = z.object({
  // rendererLogPayloadSchema 的定义
  // rendererLogPayloadSchema 的定义
  level: /* 枚举 */ z.enum(["info", "warn", "error"]),
  args: /* 数组 */ z.array(z.unknown()),
}); // rendererLogPayloadSchema 收口

export const taskNotificationPayloadSchema = z.object({
  // taskNotificationPayloadSchema 的定义
  // taskNotificationPayloadSchema 的定义
  taskId: /* 嵌套结构 */ nonEmptyStringSchema,
  status: z.enum([
    "completed",
    "failed",
    "permission_request",
    "elicitation_request",
    "feedback_update",
  ]),
  requestId: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  title: /* 文本 */ z.string(),
  body: /* 文本 */ z.string(),
}); // taskNotificationPayloadSchema 收口

export const telemetryRendererContextSchema = z.object({
  // telemetryRendererContextSchema 的定义
  // telemetryRendererContextSchema 的定义
  clientTimezone: /* 嵌套结构 */ nonEmptyStringSchema,
  clientLanguage: /* 嵌套结构 */ nonEmptyStringSchema,
  screenResolution: /* 嵌套结构 */ nonEmptyStringSchema,
}); // telemetryRendererContextSchema 收口

export const rendererTelemetryEventPayloadSchema = z.object({
  // rendererTelemetryEventPayloadSchema 的定义
  // rendererTelemetryEventPayloadSchema 的定义
  context: /* 嵌套结构 */ telemetryRendererContextSchema,
  elementName: /* 嵌套结构 */ nonEmptyStringSchema,
  eventRegion: /* 嵌套结构 */ nonEmptyStringSchema,
  eventType: /* 嵌套结构 */ nonEmptyStringSchema,
  eventText: /* 文本 */ z.string().optional(),
  eventExtraDetail: /* 键值记录 */ z.record(z.string(), z.string()),
  userId: /* 文本 */ z.string().optional(),
  talkId: /* 文本 */ z.string().optional(),
  messageId: /* 文本 */ z.string().optional(),
}); // rendererTelemetryEventPayloadSchema 收口

export const armsCustomEventPayloadSchema = z.object({
  // armsCustomEventPayloadSchema 的定义
  // armsCustomEventPayloadSchema 的定义
  name: /* 嵌套结构 */ nonEmptyStringSchema,
  group: /* 嵌套结构 */ nonEmptyStringSchema,
  value: /* 数值 */ z.number().finite().optional(),
  properties: /* 嵌套结构 */ z
    .record(z.string(), z.union([z.string(), z.number().finite(), z.boolean(), z.undefined()])) // 链式修饰
    .optional(), // 修饰链
}); // armsCustomEventPayloadSchema 收口

export const broadcastMessageSchema = z.object({
  // broadcastMessageSchema 的定义
  // broadcastMessageSchema 的定义
  channel: /* 嵌套结构 */ nonEmptyStringSchema,
  payload: /* 任意值 */ z.unknown(),
  sourceWindowId: /* 数值 */ z.number().int().optional(),
}); // broadcastMessageSchema 收口

export const remoteAssetDirsSchema = z.object({
  // remoteAssetDirsSchema 的定义
  // remoteAssetDirsSchema 的定义
  mockCdnDir: /* 文本 */ z.string().optional(),
  remoteCdnBaseUrl: /* 文本 */ z.string().optional(),
  remoteCdnBaseUrls: /* 数组 */ z.array(z.string()).optional(),
  remoteCacheDir: /* 文本 */ z.string().optional(),
}); // remoteAssetDirsSchema 收口

const hostAgentWarmupTargetSchema = z.object({
  // hostAgentWarmupTargetSchema 的定义
  workspacePath: /* 嵌套结构 */ nonEmptyStringSchema,
  workspaceIdentity: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
}); // remoteAssetDirsSchema 收口

export const hostInitLocalMessageSchema = z.object({
  // hostInitLocalMessageSchema 的定义
  // hostInitLocalMessageSchema 的定义
  type: /* 字面量 */ z.literal("init-local"),
  databaseStartupId: /* 非空文本 */ z.string().min(1).max(128).optional(),
  hostId: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  deliveryKind: /* 嵌套结构 */ taskRealtimeHostDeliveryKindSchema.optional(),
  deviceMid: /* 文本 */ z.string().optional(),
  workspacePath: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  workspaceIdentity: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  agentWarmupTargets: /* 数组 */ z.array(hostAgentWarmupTargetSchema).max(3).optional(),
  agentSpawnFallbackCwd: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  knorviaBuiltinProviderConfigFilePath: /* 嵌套结构 */ nonEmptyStringSchema,
  runtimeProcessEnvPatch: /* 嵌套结构 */ z
    .record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string()) // 链式修饰
    .optional(), // 修饰链
}); // hostInitLocalMessageSchema 收口

export const windowHostRemoteWorkspaceDescriptorSchema = z // windowHostRemoteWorkspaceDescriptorSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    remoteSessionId: /* 嵌套结构 */ nonEmptyStringSchema,
    target: /* 嵌套结构 */ remoteTargetSchema,
    workspacePath: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
    workspaceIdentity: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
    generation: /* 数值 */ z.number().int().positive(),
  }) // windowHostRemoteWorkspaceDescriptorSchema 收口
  .strict(); // 修饰链
export type WindowHostRemoteWorkspaceDescriptor = z.infer<
  // 由 schema 派生
  typeof windowHostRemoteWorkspaceDescriptorSchema
>;

export const windowHostAttachmentScopeSchema = z.discriminatedUnion("kind", [
  // windowHostAttachmentScopeSchema 的定义
  // windowHostAttachmentScopeSchema 的定义
  z.object({ kind: z.literal("local") }).strict(), // 分支对象
  z
    .object({
      // 链式修饰
      // 修饰链
      kind: /* 字面量 */ z.literal("remote"),
      remoteSessionId: /* 嵌套结构 */ nonEmptyStringSchema,
      workspacePath: /* 嵌套结构 */ nonEmptyStringSchema,
      workspaceIdentity: /* 嵌套结构 */ nonEmptyStringSchema,
    }) // windowHostAttachmentScopeSchema 收口
    .strict(), // 修饰链
]);
export type WindowHostAttachmentScope = z.infer<typeof windowHostAttachmentScopeSchema>; // 由 schema 派生

export const hostConnectRemoteWorkspaceMessageSchema = z // hostConnectRemoteWorkspaceMessageSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("connect-remote-workspace"),
    requestId: /* 嵌套结构 */ nonEmptyStringSchema,
    target: /* 嵌套结构 */ remoteTargetSchema,
    remoteAssets: /* 嵌套结构 */ remoteAssetDirsSchema,
    workspacePath: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
    workspaceIdentity: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  }) // hostConnectRemoteWorkspaceMessageSchema 收口
  .strict(); // 修饰链

export const hostCancelRemoteWorkspaceConnectMessageSchema = z // hostCancelRemoteWorkspaceConnectMessageSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("cancel-remote-workspace-connect"),
    requestId: /* 嵌套结构 */ nonEmptyStringSchema,
  }) // hostCancelRemoteWorkspaceConnectMessageSchema 收口
  .strict(); // 修饰链

export const hostBindRemoteWorkspaceContextMessageSchema = z // hostBindRemoteWorkspaceContextMessageSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("bind-remote-workspace-context"),
    requestId: /* 嵌套结构 */ nonEmptyStringSchema,
    remoteSessionId: /* 嵌套结构 */ nonEmptyStringSchema,
    workspacePath: /* 嵌套结构 */ nonEmptyStringSchema,
    workspaceIdentity: /* 嵌套结构 */ nonEmptyStringSchema,
  }) // hostBindRemoteWorkspaceContextMessageSchema 收口
  .strict(); // 修饰链

export const hostDisposeRemoteWorkspaceSessionMessageSchema = z // hostDisposeRemoteWorkspaceSessionMessageSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("dispose-remote-workspace-session"),
    requestId: /* 嵌套结构 */ nonEmptyStringSchema,
    remoteSessionId: /* 嵌套结构 */ nonEmptyStringSchema,
  }) // hostDisposeRemoteWorkspaceSessionMessageSchema 收口
  .strict(); // 修饰链

export const hostAttachServicePortMessageSchema = z // hostAttachServicePortMessageSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("attach-service-port"),
    requestId: /* 嵌套结构 */ nonEmptyStringSchema,
    attachmentId: /* 嵌套结构 */ nonEmptyStringSchema,
    clientMode: /* 枚举 */ z.enum(["desktop-continuous", "web-remote-replayable"]),
    scope: /* 嵌套结构 */ windowHostAttachmentScopeSchema,
  }) // hostAttachServicePortMessageSchema 收口
  .strict(); // 修饰链

export const hostDetachServicePortMessageSchema = z.object({
  // hostDetachServicePortMessageSchema 的定义
  // hostDetachServicePortMessageSchema 的定义
  type: /* 字面量 */ z.literal("detach-service-port"),
  attachmentId: /* 嵌套结构 */ nonEmptyStringSchema,
}); // hostDetachServicePortMessageSchema 收口

export const hostDisposeMessageSchema = z.object({
  // hostDisposeMessageSchema 的定义
  // hostDisposeMessageSchema 的定义
  type: /* 字面量 */ z.literal("dispose"),
}); // hostDisposeMessageSchema 收口

export const hostBroadcastEnvelopeSchema = z.object({
  // hostBroadcastEnvelopeSchema 的定义
  // hostBroadcastEnvelopeSchema 的定义
  type: /* 字面量 */ z.literal("broadcast"),
  message: /* 嵌套结构 */ broadcastMessageSchema,
}); // hostBroadcastEnvelopeSchema 收口

export const hostBroadcastClaimResultMessageSchema = z.discriminatedUnion("status", [
  // hostBroadcastClaimResultMessageSchema 的定义
  // hostBroadcastClaimResultMessageSchema 的定义
  z.object({
    // 分支对象
    type: /* 字面量 */ z.literal("broadcast-claim-result"),
    requestId: /* 嵌套结构 */ nonEmptyStringSchema,
    status: /* 字面量 */ z.literal("acquired"),
    claimToken: /* 嵌套结构 */ nonEmptyStringSchema,
  }),
  z.object({
    // 分支对象
    type: /* 字面量 */ z.literal("broadcast-claim-result"),
    requestId: /* 嵌套结构 */ nonEmptyStringSchema,
    status: /* 字面量 */ z.literal("busy"),
    retryAfterMs: /* 数值 */ z.number().int().nonnegative(),
  }),
  z.object({
    // 分支对象
    type: /* 字面量 */ z.literal("broadcast-claim-result"),
    requestId: /* 嵌套结构 */ nonEmptyStringSchema,
    status: /* 字面量 */ z.literal("committed"),
  }),
]);

export const hostTaskRealtimeDeliverMessageSchema = z.object({
  // hostTaskRealtimeDeliverMessageSchema 的定义
  // hostTaskRealtimeDeliverMessageSchema 的定义
  type: /* 字面量 */ z.literal("task-realtime-deliver"),
  event: /* 嵌套结构 */ taskRealtimeDeliveredEventSchema,
}); // hostTaskRealtimeDeliverMessageSchema 收口

export const hostTaskRunLeaseResultMessageSchema = z.object({
  // hostTaskRunLeaseResultMessageSchema 的定义
  // hostTaskRunLeaseResultMessageSchema 的定义
  type: /* 字面量 */ z.literal("task-run-lease-result"),
  result: /* 嵌套结构 */ taskRunLeaseResultSchema,
}); // hostTaskRunLeaseResultMessageSchema 收口

export const hostTaskOwnerCommandDeliverMessageSchema = z.object({
  // hostTaskOwnerCommandDeliverMessageSchema 的定义
  // hostTaskOwnerCommandDeliverMessageSchema 的定义
  type: /* 字面量 */ z.literal("task-owner-command-deliver"),
  command: /* 嵌套结构 */ taskOwnerCommandDeliverySchema,
}); // hostTaskOwnerCommandDeliverMessageSchema 收口

export const hostTaskOwnerCommandResultMessageSchema = z.object({
  // hostTaskOwnerCommandResultMessageSchema 的定义
  // hostTaskOwnerCommandResultMessageSchema 的定义
  type: /* 字面量 */ z.literal("task-owner-command-result"),
  result: /* 嵌套结构 */ taskOwnerCommandResultSchema,
}); // hostTaskOwnerCommandResultMessageSchema 收口

export const sessionMessageRequestSchema = z.object({
  // sessionMessageRequestSchema 的定义
  // sessionMessageRequestSchema 的定义
  content: /* 嵌套结构 */ nonEmptyStringSchema,
  createdAt: /* 嵌套结构 */ nonEmptyStringSchema,
  fromSessionId: /* 嵌套结构 */ nonEmptyStringSchema,
  messageId: /* 嵌套结构 */ nonEmptyStringSchema,
  requestId: /* 嵌套结构 */ nonEmptyStringSchema,
  toSessionId: /* 嵌套结构 */ nonEmptyStringSchema,
}); // sessionMessageRequestSchema 收口

export const sessionMessageDeliveryResultSchema = z.object({
  // sessionMessageDeliveryResultSchema 的定义
  // sessionMessageDeliveryResultSchema 的定义
  error: /* 文本 */ z.string().optional(),
  messageId: /* 嵌套结构 */ nonEmptyStringSchema,
  requestId: /* 嵌套结构 */ nonEmptyStringSchema,
  sessionId: /* 嵌套结构 */ nonEmptyStringSchema,
  status: /* 枚举 */ z.enum(["success", "failed"]),
}); // sessionMessageDeliveryResultSchema 收口

export const sessionRouteSchema = z.object({
  // sessionRouteSchema 的定义
  // sessionRouteSchema 的定义
  sessionId: /* 嵌套结构 */ nonEmptyStringSchema,
}); // sessionRouteSchema 收口

export const hostSessionMessageDeliverMessageSchema = z.object({
  // hostSessionMessageDeliverMessageSchema 的定义
  // hostSessionMessageDeliverMessageSchema 的定义
  type: /* 字面量 */ z.literal("session-message-deliver"),
  request: /* 嵌套结构 */ sessionMessageRequestSchema,
}); // hostSessionMessageDeliverMessageSchema 收口

export const hostSessionMessageDeliveryResultMessageSchema = z.object({
  // hostSessionMessageDeliveryResultMessageSchema 的定义
  // hostSessionMessageDeliveryResultMessageSchema 的定义
  type: /* 字面量 */ z.literal("session-message-delivery-result"),
  result: /* 嵌套结构 */ sessionMessageDeliveryResultSchema,
}); // hostSessionMessageDeliveryResultMessageSchema 收口

export const hostFeedbackLogArchiveResultMessageSchema = z.object({
  // hostFeedbackLogArchiveResultMessageSchema 的定义
  // hostFeedbackLogArchiveResultMessageSchema 的定义
  type: /* 字面量 */ z.literal("feedback-log-archive-result"),
  requestId: /* 嵌套结构 */ nonEmptyStringSchema,
  ok: /* 布尔 */ z.boolean(),
  path: /* 文本 */ z.string().optional(),
  size: /* 数值 */ z.number().int().nonnegative().optional(),
  error: /* 文本 */ z.string().optional(),
}); // hostFeedbackLogArchiveResultMessageSchema 收口

export const hostCronRunMessageSchema = z.object({
  // hostCronRunMessageSchema 的定义
  // hostCronRunMessageSchema 的定义
  type: /* 字面量 */ z.literal("cron-run"),
  automationId: /* 嵌套结构 */ nonEmptyStringSchema,
  runId: /* 嵌套结构 */ nonEmptyStringSchema,
  workspacePath: /* 嵌套结构 */ nonEmptyStringSchema,
  workspaceIdentity: /* 文本 */ z.string().optional(),
  prompt: /* 嵌套结构 */ nonEmptyStringSchema,
  targetTaskId: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  studioWorkflowId: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  modelSelection: /* 嵌套结构 */ modelSelectionSchema.optional(),
  mode: /* 文本 */ z.string().optional(),
}); // hostCronRunMessageSchema 收口

export const hostOffPeakRunMessageSchema = z.object({
  // hostOffPeakRunMessageSchema 的定义
  // hostOffPeakRunMessageSchema 的定义
  type: /* 字面量 */ z.literal("off-peak-run"),
  offPeakTaskId: /* 嵌套结构 */ nonEmptyStringSchema,
  workspacePath: /* 嵌套结构 */ nonEmptyStringSchema,
  workspaceIdentity: /* 文本 */ z.string().optional(),
  prompt: /* 嵌套结构 */ nonEmptyStringSchema,
  permissionMode: /* 嵌套结构 */ nonEmptyStringSchema,
  modelSelection: /* 嵌套结构 */ modelSelectionSchema,
  conversationId: /* 文本 */ z.string().optional(),
  sessionId: /* 文本 */ z.string().optional(),
  serverTicketId: /* 文本 */ z.string().optional(),
}); // hostOffPeakRunMessageSchema 收口

export const hostBrowserExecuteResultMessageSchema = z.object({
  // hostBrowserExecuteResultMessageSchema 的定义
  // hostBrowserExecuteResultMessageSchema 的定义
  type: /* 字面量 */ z.literal("browser-execute-result"),
  requestId: /* 嵌套结构 */ nonEmptyStringSchema,
  result: /* 嵌套结构 */ browserCommandResultSchema,
}); // hostBrowserExecuteResultMessageSchema 收口

export const hostLocalMediaPreviewPathAuthorizeResultMessageSchema = z // hostLocalMediaPreviewPathAuthorizeResultMessageSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("local-media-preview-path-authorize-result"),
    requestId: /* 嵌套结构 */ nonEmptyStringSchema,
    ok: /* 布尔 */ z.boolean(),
    path: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
    error: /* 文本 */ z.string().optional(),
  }) // hostLocalMediaPreviewPathAuthorizeResultMessageSchema 收口
  .strict(); // 修饰链

export const hostCuaPipFocusChangedMessageSchema = z // hostCuaPipFocusChangedMessageSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("cua-pip-focus-changed"),
    event: /* 嵌套结构 */ z
      .object({
        // 链式修饰
        // 修饰链
        kind: /* 字面量 */ z.literal("focus-changed"),
        revision: /* 数值 */ z.number().int().nonnegative().safe(),
        sourceWindowId: /* 嵌套结构 */ nonEmptyStringSchema.max(255),
        sessionId: /* 可空嵌套结构 */ nonEmptyStringSchema.max(255).nullable(),
      }) // hostCuaPipFocusChangedMessageSchema 收口
      .strict(), // 修饰链
  }) // hostCuaPipFocusChangedMessageSchema 收口
  .strict(); // 修饰链

export const hostResourceUsageSnapshotRequestMessageSchema = z // hostResourceUsageSnapshotRequestMessageSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("resource-usage-snapshot-request"),
    requestId: /* 嵌套结构 */ nonEmptyStringSchema,
  }) // hostResourceUsageSnapshotRequestMessageSchema 收口
  .strict(); // 修饰链
export type HostResourceUsageSnapshotRequestMessage = z.infer<
  // 由 schema 派生
  typeof hostResourceUsageSnapshotRequestMessageSchema
>;

export const hostIncomingMessageSchema = z.discriminatedUnion("type", [
  // hostIncomingMessageSchema 的定义
  // hostIncomingMessageSchema 的定义
  z
    .object({ type: z.literal("database-startup-control"), control: databaseStartupControlSchema }) // 修饰链
    .strict(), // 修饰链
  hostResourceUsageSnapshotRequestMessageSchema, // 判别联合成员
  z
    .object({ type: z.literal("resource-usage-snapshot-cancel"), requestId: nonEmptyStringSchema }) // 修饰链
    .strict(), // 修饰链
  hostInitLocalMessageSchema, // 判别联合成员
  hostConnectRemoteWorkspaceMessageSchema, // 判别联合成员
  hostCancelRemoteWorkspaceConnectMessageSchema, // 判别联合成员
  hostBindRemoteWorkspaceContextMessageSchema, // 判别联合成员
  hostDisposeRemoteWorkspaceSessionMessageSchema, // 判别联合成员
  hostAttachServicePortMessageSchema, // 判别联合成员
  hostDetachServicePortMessageSchema, // 判别联合成员
  hostDisposeMessageSchema, // 判别联合成员
  hostBroadcastEnvelopeSchema, // 判别联合成员
  hostBroadcastClaimResultMessageSchema, // 判别联合成员
  hostTaskRealtimeDeliverMessageSchema, // 判别联合成员
  hostTaskRunLeaseResultMessageSchema, // 判别联合成员
  hostTaskOwnerCommandDeliverMessageSchema, // 判别联合成员
  hostTaskOwnerCommandResultMessageSchema, // 判别联合成员
  hostSessionMessageDeliverMessageSchema, // 判别联合成员
  hostSessionMessageDeliveryResultMessageSchema, // 判别联合成员
  hostFeedbackLogArchiveResultMessageSchema, // 判别联合成员
  hostCronRunMessageSchema, // 判别联合成员
  hostOffPeakRunMessageSchema, // 判别联合成员
  hostBrowserExecuteResultMessageSchema, // 判别联合成员
  hostLocalMediaPreviewPathAuthorizeResultMessageSchema, // 判别联合成员
  hostCuaPipFocusChangedMessageSchema, // 判别联合成员
]);

export const hostRemoteWorkspaceConnectedResponseSchema = z // hostRemoteWorkspaceConnectedResponseSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("remote-workspace-connected"),
    requestId: /* 嵌套结构 */ nonEmptyStringSchema,
    descriptor: /* 嵌套结构 */ windowHostRemoteWorkspaceDescriptorSchema,
  }) // hostRemoteWorkspaceConnectedResponseSchema 收口
  .strict(); // 修饰链

export const hostRemoteWorkspaceConnectionLogResponseSchema = z // hostRemoteWorkspaceConnectionLogResponseSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("remote-workspace-connection-log"),
    requestId: /* 嵌套结构 */ nonEmptyStringSchema,
    level: /* 枚举 */ z.enum(["info", "warn", "error"]),
    message: /* 嵌套结构 */ nonEmptyStringSchema,
  }) // hostRemoteWorkspaceConnectionLogResponseSchema 收口
  .strict(); // 修饰链

export const hostRemoteWorkspaceConnectFailedResponseSchema = z // hostRemoteWorkspaceConnectFailedResponseSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("remote-workspace-connect-failed"),
    requestId: /* 嵌套结构 */ nonEmptyStringSchema,
    error: /* 嵌套结构 */ nonEmptyStringSchema,
  }) // hostRemoteWorkspaceConnectFailedResponseSchema 收口
  .strict(); // 修饰链

export const hostRemoteWorkspaceClosedResponseSchema = z // hostRemoteWorkspaceClosedResponseSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("remote-workspace-closed"),
    remoteSessionId: /* 嵌套结构 */ nonEmptyStringSchema,
    reason: /* 枚举 */ z.enum(["connection-closed", "disposed", "connect-cancelled"]),
    exitCode: /* 可空数值 */ z.number().int().nullable().optional(),
    signal: /* 可空文本 */ z.string().nullable().optional(),
    error: /* 文本 */ z.string().optional(),
  }) // hostRemoteWorkspaceClosedResponseSchema 收口
  .strict(); // 修饰链

export const hostLogResponseSchema = z.object({
  // hostLogResponseSchema 的定义
  // hostLogResponseSchema 的定义
  type: /* 字面量 */ z.literal("log"),
  level: /* 枚举 */ z.enum(["info", "warn", "error"]),
  source: /* 文本 */ z.string(),
  message: /* 文本 */ z.string(),
}); // hostLogResponseSchema 收口

export { knorviaProviderSchema };

export const knorviaTaskMigrationSourceSchema = z.enum(["claudeCode"]); // knorviaTaskMigrationSourceSchema 的定义

export const hostAgentProcessSpawnedResponseSchema = z.object({
  // hostAgentProcessSpawnedResponseSchema 的定义
  // hostAgentProcessSpawnedResponseSchema 的定义
  type: /* 字面量 */ z.literal("agent-process-spawned"),
  lane: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  pid: /* 数值 */ z.number().int().positive(),
  provider: /* 嵌套结构 */ knorviaProviderSchema,
  workspacePath: /* 嵌套结构 */ nonEmptyStringSchema,
  command: /* 文本 */ z.string(),
  args: /* 数组 */ z.array(z.string()),
  startedAt: /* 数值 */ z.number().int().nonnegative(),
  runtimeGeneration: /* 数值 */ z.number().int().positive().optional(),
  runtimeInstanceId: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
}); // hostAgentProcessSpawnedResponseSchema 收口
export type HostAgentProcessSpawnedResponse = z.infer<typeof hostAgentProcessSpawnedResponseSchema>; // 由 schema 派生

export const hostAgentProcessReadyResponseSchema = z.object({
  // hostAgentProcessReadyResponseSchema 的定义
  // hostAgentProcessReadyResponseSchema 的定义
  type: /* 字面量 */ z.literal("agent-process-ready"),
  lane: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  pid: /* 数值 */ z.number().int().positive(),
  provider: /* 嵌套结构 */ knorviaProviderSchema,
  workspacePath: /* 嵌套结构 */ nonEmptyStringSchema,
  readyAt: /* 数值 */ z.number().int().nonnegative(),
  startupDurationMs: /* 数值 */ z.number().int().nonnegative(),
  runtimeGeneration: /* 数值 */ z.number().int().positive(),
  runtimeInstanceId: /* 嵌套结构 */ nonEmptyStringSchema,
}); // hostAgentProcessReadyResponseSchema 收口
export type HostAgentProcessReadyResponse = z.infer<typeof hostAgentProcessReadyResponseSchema>; // 由 schema 派生

export const hostAgentProcessExitedResponseSchema = z.object({
  // hostAgentProcessExitedResponseSchema 的定义
  // hostAgentProcessExitedResponseSchema 的定义
  type: /* 字面量 */ z.literal("agent-process-exited"),
  lane: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  pid: /* 数值 */ z.number().int().positive(),
  provider: /* 嵌套结构 */ knorviaProviderSchema,
  workspacePath: /* 嵌套结构 */ nonEmptyStringSchema,
  exitCode: /* 可空数值 */ z.number().int().nullable(),
  signal: /* 可空文本 */ z.string().nullable(),
  endedAt: /* 数值 */ z.number().int().nonnegative(),
  terminationKind: /* 枚举 */ z.enum(["expected", "unexpected", "watchdog_recycle"]),
  terminationReason: /* 文本 */ z.string().optional(),
  runtimeReady: /* 布尔 */ z.boolean().optional(),
  runtimeGeneration: /* 数值 */ z.number().int().positive(),
  runtimeInstanceId: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  uptimeMs: /* 数值 */ z.number().int().nonnegative(),
  stderrLineCount: /* 数值 */ z.number().int().nonnegative(),
  stderrTail: /* 数组 */ z.array(z.string().max(1_100)).max(20).optional(),
}); // hostAgentProcessExitedResponseSchema 收口

export type HostAgentProcessExitedResponse = z.infer<typeof hostAgentProcessExitedResponseSchema>; // 由 schema 派生

export const hostAgentProcessErrorResponseSchema = z.object({
  // hostAgentProcessErrorResponseSchema 的定义
  // hostAgentProcessErrorResponseSchema 的定义
  type: /* 字面量 */ z.literal("agent-process-error"),
  lane: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  pid: /* 可空数值 */ z.number().int().positive().nullable(),
  provider: /* 嵌套结构 */ knorviaProviderSchema,
  workspacePath: /* 嵌套结构 */ nonEmptyStringSchema,
  command: /* 文本 */ z.string(),
  args: /* 数组 */ z.array(z.string()),
  errorName: /* 嵌套结构 */ nonEmptyStringSchema,
  errorCode: /* 文本 */ z.string().optional(),
  errorMessage: /* 文本 */ z.string(),
  errorStack: /* 文本 */ z.string().optional(),
  runtimeGeneration: /* 数值 */ z.number().int().positive(),
  runtimeInstanceId: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  occurredAt: /* 数值 */ z.number().int().nonnegative(),
}); // hostAgentProcessErrorResponseSchema 收口

export type HostAgentProcessErrorResponse = z.infer<typeof hostAgentProcessErrorResponseSchema>; // 由 schema 派生

export const hostAgentProcessExceptionResponseSchema = z // hostAgentProcessExceptionResponseSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("agent-process-exception"),
    lane: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
    pid: /* 数值 */ z.number().int().positive(),
    provider: /* 嵌套结构 */ knorviaProviderSchema,
    workspacePath: /* 嵌套结构 */ nonEmptyStringSchema,
    runtimeGeneration: /* 数值 */ z.number().int().positive(),
    runtimeInstanceId: /* 嵌套结构 */ nonEmptyStringSchema,
    diagnostic: /* 嵌套结构 */ knorviaProcessDiagnosticSchema,
  }) // hostAgentProcessExceptionResponseSchema 收口
  .strict(); // 修饰链
export type HostAgentProcessExceptionResponse = z.infer<
  // 由 schema 派生
  typeof hostAgentProcessExceptionResponseSchema
>;

export const processResourceCliLaneSchema = z.enum(PROCESS_RESOURCE_CLI_LANES); // processResourceCliLaneSchema 的定义
export const agentLaneResourceSampleSchema = knorviaProcessResourceSampleSchema // agentLaneResourceSampleSchema 的定义
  .extend({ lane: processResourceCliLaneSchema.optional() }) // 链式修饰
  .strict(); // 修饰链
export type AgentLaneResourceSample = z.infer<typeof agentLaneResourceSampleSchema>; // 由 schema 派生

const resourceTelemetryEnvironmentKeySchema = z.string().regex(/^[a-f0-9]{64}$/); // resourceTelemetryEnvironmentKeySchema 的定义

export const hostAgentResourceSampleResponseSchema = z // hostAgentResourceSampleResponseSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("agent-resource-sample"),
    runtimeSurface: /* 枚举 */ z.enum(["local", "remote"]),
    environmentKey: /* 嵌套结构 */ resourceTelemetryEnvironmentKeySchema.optional(),
    sample: /* 嵌套结构 */ agentLaneResourceSampleSchema,
  }) // hostAgentResourceSampleResponseSchema 收口
  .strict(); // 修饰链
export type HostAgentResourceSampleResponse = z.infer<typeof hostAgentResourceSampleResponseSchema>; // 由 schema 派生

export const nodeSelfResourceSampleSchema = z // nodeSelfResourceSampleSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    cpuPercent: /* 数值 */ z.number().finite().nonnegative().max(100_000),
    rssKb: /* 数值 */ z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
    heapUsedKb: /* 数值 */ z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }) // nodeSelfResourceSampleSchema 收口
  .strict(); // 修饰链
export type NodeSelfResourceSample = z.infer<typeof nodeSelfResourceSampleSchema>; // 由 schema 派生

export const rendererHeapSampleSchema = z // rendererHeapSampleSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    heapUsedKb: /* 数值 */ z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }) // rendererHeapSampleSchema 收口
  .strict(); // 修饰链
export type RendererHeapSample = z.infer<typeof rendererHeapSampleSchema>; // 由 schema 派生

export const hostResourceSampleResponseSchema = z // hostResourceSampleResponseSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("host-resource-sample"),
    sample: /* 嵌套结构 */ nodeSelfResourceSampleSchema,
  }) // hostResourceSampleResponseSchema 收口
  .strict(); // 修饰链
export type HostResourceSampleResponse = z.infer<typeof hostResourceSampleResponseSchema>; // 由 schema 派生

export const hostMcpResourceSamplesResponseSchema = z // hostMcpResourceSamplesResponseSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("mcp-resource-samples"),
    runtimeSurface: /* 枚举 */ z.enum(["local", "remote"]),
    environmentKey: /* 嵌套结构 */ resourceTelemetryEnvironmentKeySchema.optional(),
    samples: /* 嵌套结构 */ knorviaMcpResourceSamplesSchema,
  }) // hostMcpResourceSamplesResponseSchema 收口
  .strict(); // 修饰链
export type HostMcpResourceSamplesResponse = z.infer<typeof hostMcpResourceSamplesResponseSchema>; // 由 schema 派生

export const hostToolExecResourceResponseSchema = z // hostToolExecResourceResponseSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("tool-exec-resource"),
    runtimeSurface: /* 枚举 */ z.enum(["local", "remote"]),
    sample: /* 嵌套结构 */ knorviaToolExecResourceSchema,
  }) // hostToolExecResourceResponseSchema 收口
  .strict(); // 修饰链
export type HostToolExecResourceResponse = z.infer<typeof hostToolExecResourceResponseSchema>; // 由 schema 派生

export const hostMcpTelemetryResponseSchema = z // hostMcpTelemetryResponseSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("mcp-telemetry"),
    runtimeSurface: /* 枚举 */ z.enum(["local", "remote"]),
    event: /* 嵌套结构 */ knorviaMcpTelemetryEventSchema,
  }) // hostMcpTelemetryResponseSchema 收口
  .strict(); // 修饰链
export type HostMcpTelemetryResponse = z.infer<typeof hostMcpTelemetryResponseSchema>; // 由 schema 派生

export const hostSessionCreateTelemetryResponseSchema = z // hostSessionCreateTelemetryResponseSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("session-create-telemetry"),
    event: /* 嵌套结构 */ automationSessionCreateTelemetrySchema,
  }) // hostSessionCreateTelemetryResponseSchema 收口
  .strict(); // 修饰链
export type HostSessionCreateTelemetryResponse = z.infer<
  // 由 schema 派生
  typeof hostSessionCreateTelemetryResponseSchema
>;

export const hostAgentRunningTaskCountChangedResponseSchema = z.object({
  // hostAgentRunningTaskCountChangedResponseSchema 的定义
  // hostAgentRunningTaskCountChangedResponseSchema 的定义
  type: /* 字面量 */ z.literal("agent-running-task-count-changed"),
  runningTaskCount: /* 数值 */ z.number().int().nonnegative(),
}); // hostAgentRunningTaskCountChangedResponseSchema 收口

export const hostWorkspaceRunningTaskCountChangedResponseSchema = z.object({
  // hostWorkspaceRunningTaskCountChangedResponseSchema 的定义
  // hostWorkspaceRunningTaskCountChangedResponseSchema 的定义
  type: /* 字面量 */ z.literal("workspace-running-task-count-changed"),
  workspacePath: /* 嵌套结构 */ nonEmptyStringSchema,
  workspaceIdentity: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  runningTaskCount: /* 数值 */ z.number().int().nonnegative(),
}); // hostWorkspaceRunningTaskCountChangedResponseSchema 收口

export const hostCuaOperationStateResponseSchema = z // hostCuaOperationStateResponseSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("cua-operation-state"),
    active: /* 布尔 */ z.boolean(),
    sessionId: /* 嵌套结构 */ nonEmptyStringSchema,
    turnId: /* 嵌套结构 */ nonEmptyStringSchema,
    workspacePath: /* 嵌套结构 */ nonEmptyStringSchema,
    workspaceIdentity: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  }) // hostCuaOperationStateResponseSchema 收口
  .strict(); // 修饰链

export type HostCuaOperationStateResponse = z.infer<typeof hostCuaOperationStateResponseSchema>; // 由 schema 派生

export const hostBroadcastClaimRequestResponseSchema = z.object({
  // hostBroadcastClaimRequestResponseSchema 的定义
  // hostBroadcastClaimRequestResponseSchema 的定义
  type: /* 字面量 */ z.literal("broadcast-claim-request"),
  requestId: /* 嵌套结构 */ nonEmptyStringSchema,
  key: /* 嵌套结构 */ nonEmptyStringSchema.max(1_024),
}); // hostBroadcastClaimRequestResponseSchema 收口

export const hostBroadcastClaimCommitResponseSchema = z.object({
  // hostBroadcastClaimCommitResponseSchema 的定义
  // hostBroadcastClaimCommitResponseSchema 的定义
  type: /* 字面量 */ z.literal("broadcast-claim-commit"),
  key: /* 嵌套结构 */ nonEmptyStringSchema.max(1_024),
  claimToken: /* 嵌套结构 */ nonEmptyStringSchema,
}); // hostBroadcastClaimCommitResponseSchema 收口

export const hostBroadcastClaimReleaseResponseSchema = z.object({
  // hostBroadcastClaimReleaseResponseSchema 的定义
  // hostBroadcastClaimReleaseResponseSchema 的定义
  type: /* 字面量 */ z.literal("broadcast-claim-release"),
  key: /* 嵌套结构 */ nonEmptyStringSchema.max(1_024),
  claimToken: /* 嵌套结构 */ nonEmptyStringSchema,
}); // hostBroadcastClaimReleaseResponseSchema 收口

export const hostTaskRealtimePublishResponseSchema = z.object({
  // hostTaskRealtimePublishResponseSchema 的定义
  // hostTaskRealtimePublishResponseSchema 的定义
  type: /* 字面量 */ z.literal("task-realtime-publish"),
  event: /* 嵌套结构 */ taskRealtimeEventSchema,
}); // hostTaskRealtimePublishResponseSchema 收口

export const hostTaskStreamOpPublishResponseSchema = z.object({
  // hostTaskStreamOpPublishResponseSchema 的定义
  // hostTaskStreamOpPublishResponseSchema 的定义
  type: /* 字面量 */ z.literal("task-stream-op-publish"),
  target: /* 嵌套结构 */ taskStreamMirrorTargetSchema,
  op: /* 嵌套结构 */ taskStreamMirrorPublishOpSchema,
}); // hostTaskStreamOpPublishResponseSchema 收口

export const hostTaskRunLeaseAcquireResponseSchema = z.object({
  // hostTaskRunLeaseAcquireResponseSchema 的定义
  // hostTaskRunLeaseAcquireResponseSchema 的定义
  type: /* 字面量 */ z.literal("task-run-lease-acquire"),
  request: /* 嵌套结构 */ taskRunLeaseAcquireRequestSchema,
}); // hostTaskRunLeaseAcquireResponseSchema 收口

export const hostTaskRunLeaseReleaseResponseSchema = z.object({
  // hostTaskRunLeaseReleaseResponseSchema 的定义
  // hostTaskRunLeaseReleaseResponseSchema 的定义
  type: /* 字面量 */ z.literal("task-run-lease-release"),
  target: /* 嵌套结构 */ taskRunLeaseTargetSchema,
}); // hostTaskRunLeaseReleaseResponseSchema 收口

export const hostTaskOwnerCommandRequestResponseSchema = z.object({
  // hostTaskOwnerCommandRequestResponseSchema 的定义
  // hostTaskOwnerCommandRequestResponseSchema 的定义
  type: /* 字面量 */ z.literal("task-owner-command-request"),
  command: /* 嵌套结构 */ taskOwnerCommandRequestSchema,
}); // hostTaskOwnerCommandRequestResponseSchema 收口

export const hostTaskOwnerCommandResultResponseSchema = z.object({
  // hostTaskOwnerCommandResultResponseSchema 的定义
  // hostTaskOwnerCommandResultResponseSchema 的定义
  type: /* 字面量 */ z.literal("task-owner-command-result"),
  result: /* 嵌套结构 */ taskOwnerCommandResultSchema,
}); // hostTaskOwnerCommandResultResponseSchema 收口

export const hostSessionMessageSendRequestedResponseSchema = z.object({
  // hostSessionMessageSendRequestedResponseSchema 的定义
  // hostSessionMessageSendRequestedResponseSchema 的定义
  type: /* 字面量 */ z.literal("session-message-send-requested"),
  request: /* 嵌套结构 */ sessionMessageRequestSchema,
}); // hostSessionMessageSendRequestedResponseSchema 收口

export const hostSessionRouteAnnounceResponseSchema = z.object({
  // hostSessionRouteAnnounceResponseSchema 的定义
  // hostSessionRouteAnnounceResponseSchema 的定义
  type: /* 字面量 */ z.literal("session-route-announce"),
  route: /* 嵌套结构 */ sessionRouteSchema,
}); // hostSessionRouteAnnounceResponseSchema 收口

export const hostSessionMessageDeliverResultResponseSchema = z.object({
  // hostSessionMessageDeliverResultResponseSchema 的定义
  // hostSessionMessageDeliverResultResponseSchema 的定义
  type: /* 字面量 */ z.literal("session-message-deliver-result"),
  result: /* 嵌套结构 */ sessionMessageDeliveryResultSchema,
}); // hostSessionMessageDeliverResultResponseSchema 收口

export const hostFeedbackLogArchiveRequestResponseSchema = z.object({
  // hostFeedbackLogArchiveRequestResponseSchema 的定义
  // hostFeedbackLogArchiveRequestResponseSchema 的定义
  type: /* 字面量 */ z.literal("feedback-log-archive-request"),
  requestId: /* 嵌套结构 */ nonEmptyStringSchema,
  sourceDir: /* 嵌套结构 */ nonEmptyStringSchema,
}); // hostFeedbackLogArchiveRequestResponseSchema 收口

export const hostCronRunResultResponseSchema = z.object({
  // hostCronRunResultResponseSchema 的定义
  // hostCronRunResultResponseSchema 的定义
  type: /* 字面量 */ z.literal("cron-run-result"),
  runId: /* 嵌套结构 */ nonEmptyStringSchema,
  ok: /* 布尔 */ z.boolean(),
  taskId: /* 文本 */ z.string().optional(),
  sessionId: /* 文本 */ z.string().optional(),
  error: /* 文本 */ z.string().optional(),
  failureKind: /* 枚举 */ z.enum(["transient", "permanent"]).optional(),
}); // hostCronRunResultResponseSchema 收口

export const hostOffPeakRunResultResponseSchema = z.object({
  // hostOffPeakRunResultResponseSchema 的定义
  // hostOffPeakRunResultResponseSchema 的定义
  type: /* 字面量 */ z.literal("off-peak-run-result"),
  offPeakTaskId: /* 嵌套结构 */ nonEmptyStringSchema,
  ok: /* 布尔 */ z.boolean(),
  conversationId: /* 文本 */ z.string().optional(),
  sessionId: /* 文本 */ z.string().optional(),
  error: /* 文本 */ z.string().optional(),
  failureKind: /* 枚举 */ z.enum(["transient", "permanent"]).optional(),
}); // hostOffPeakRunResultResponseSchema 收口

export const hostCronSchedulerWakeRequestResponseSchema = z.object({
  // hostCronSchedulerWakeRequestResponseSchema 的定义
  // hostCronSchedulerWakeRequestResponseSchema 的定义
  type: /* 字面量 */ z.literal("cron-scheduler-wake-request"),
  automationId: /* 嵌套结构 */ nonEmptyStringSchema,
}); // hostCronSchedulerWakeRequestResponseSchema 收口

export const hostOffPeakSchedulerWakeRequestResponseSchema = z.object({
  // hostOffPeakSchedulerWakeRequestResponseSchema 的定义
  // hostOffPeakSchedulerWakeRequestResponseSchema 的定义
  type: /* 字面量 */ z.literal("off-peak-scheduler-wake-request"),
  offPeakTaskId: /* 文本 */ z.string().optional(),
}); // hostOffPeakSchedulerWakeRequestResponseSchema 收口

export const hostBrowserExecuteRequestResponseSchema = z.object({
  // hostBrowserExecuteRequestResponseSchema 的定义
  // hostBrowserExecuteRequestResponseSchema 的定义
  type: /* 字面量 */ z.literal("browser-execute-request"),
  requestId: /* 嵌套结构 */ nonEmptyStringSchema,
  browserId: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  browserGeneration: /* 数值 */ z.number().int().nonnegative().optional(),
  sessionId: /* 嵌套结构 */ nonEmptyStringSchema,
  turnId: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  workspaceKey: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  workspacePath: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  workspaceIdentity: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  remoteSessionId: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  clientMode: /* 枚举 */ z.enum(["desktop-continuous", "web-remote-replayable"]).optional(),
  sessionContext: /* 枚举 */ z.enum(["live", "cached"]).optional(),
  command: /* 嵌套结构 */ browserCommandSchema,
}); // hostBrowserExecuteRequestResponseSchema 收口

export const hostLocalMediaPreviewPathAuthorizeRequestResponseSchema = z // hostLocalMediaPreviewPathAuthorizeRequestResponseSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("local-media-preview-path-authorize-request"),
    requestId: /* 嵌套结构 */ nonEmptyStringSchema,
    path: /* 嵌套结构 */ nonEmptyStringSchema,
  }) // hostLocalMediaPreviewPathAuthorizeRequestResponseSchema 收口
  .strict(); // 修饰链

export const networkObservationSchema = z.object({
  // networkObservationSchema 的定义
  // networkObservationSchema 的定义
  transport: /* 枚举 */ z.enum(["http", "websocket", "rpc"]),
  interface: /* 文本 */ z.string(),
  durationMs: /* 数值 */ z.number(),
  ok: /* 布尔 */ z.boolean(),
  statusCode: /* 数值 */ z.number().optional(),
  errorKind: /* 文本 */ z.string().optional(),
  attempt: /* 数值 */ z.number().int().positive().optional(),
  dnsMs: /* 数值 */ z.number().optional(),
  tcpMs: /* 数值 */ z.number().optional(),
  tlsMs: /* 数值 */ z.number().optional(),
  ttfbMs: /* 数值 */ z.number().optional(),
  downloadMs: /* 数值 */ z.number().optional(),
}); // networkObservationSchema 收口

export const hostNetworkTelemetryBatchResponseSchema = z.object({
  // hostNetworkTelemetryBatchResponseSchema 的定义
  // hostNetworkTelemetryBatchResponseSchema 的定义
  type: /* 字面量 */ z.literal("network-telemetry-batch"),
  observations: /* 数组 */ z.array(networkObservationSchema).max(500),
}); // hostNetworkTelemetryBatchResponseSchema 收口

export const hostResourceUsageProcessSchema = z // hostResourceUsageProcessSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    pid: /* 数值 */ z.number().int().positive(),
    name: /* 嵌套结构 */ nonEmptyStringSchema,
    category: /* 枚举 */ z.enum(["base", "builtin-plugin", "community-plugin"]),
    groupKey: /* 嵌套结构 */ nonEmptyStringSchema,
    groupLabel: /* 嵌套结构 */ nonEmptyStringSchema,
    cpuPercent: /* 数值 */ z.number().finite().nonnegative(),
    memoryBytes: /* 数值 */ z.number().finite().nonnegative(),
  }) // hostResourceUsageProcessSchema 收口
  .strict(); // 修饰链

export const hostResourceUsageSnapshotResultResponseSchema = z // hostResourceUsageSnapshotResultResponseSchema 的定义
  .object({
    // 链式修饰
    // 修饰链
    type: /* 字面量 */ z.literal("resource-usage-snapshot-result"),
    requestId: /* 嵌套结构 */ nonEmptyStringSchema,
    sampledAt: /* 数值 */ z.number().int().nonnegative(),
    processes: /* 数组 */ z.array(hostResourceUsageProcessSchema).max(10_000),
  }) // hostResourceUsageSnapshotResultResponseSchema 收口
  .strict(); // 修饰链
export type HostResourceUsageSnapshotResultResponse = z.infer<
  // 由 schema 派生
  typeof hostResourceUsageSnapshotResultResponseSchema
>;

export const hostResponseMessageSchema = z.discriminatedUnion("type", [
  // hostResponseMessageSchema 的定义
  // hostResponseMessageSchema 的定义
  z
    .object({ type: z.literal("database-startup-state"), state: databaseStartupStateSchema }) // 修饰链
    .strict(), // 修饰链
  hostResourceUsageSnapshotResultResponseSchema, // 判别联合成员
  hostRemoteWorkspaceConnectionLogResponseSchema, // 判别联合成员
  hostRemoteWorkspaceConnectedResponseSchema, // 判别联合成员
  hostRemoteWorkspaceConnectFailedResponseSchema, // 判别联合成员
  hostRemoteWorkspaceClosedResponseSchema, // 判别联合成员
  hostLogResponseSchema, // 判别联合成员
  hostAgentProcessSpawnedResponseSchema, // 判别联合成员
  hostAgentProcessReadyResponseSchema, // 判别联合成员
  hostAgentProcessExitedResponseSchema, // 判别联合成员
  hostAgentProcessErrorResponseSchema, // 判别联合成员
  hostAgentProcessExceptionResponseSchema, // 判别联合成员
  hostAgentResourceSampleResponseSchema, // 判别联合成员
  hostResourceSampleResponseSchema, // 判别联合成员
  hostMcpTelemetryResponseSchema, // 判别联合成员
  hostMcpResourceSamplesResponseSchema, // 判别联合成员
  hostToolExecResourceResponseSchema, // 判别联合成员
  hostSessionCreateTelemetryResponseSchema, // 判别联合成员
  hostAgentRunningTaskCountChangedResponseSchema, // 判别联合成员
  hostWorkspaceRunningTaskCountChangedResponseSchema, // 判别联合成员
  hostCuaOperationStateResponseSchema, // 判别联合成员
  hostBroadcastEnvelopeSchema, // 判别联合成员
  hostBroadcastClaimRequestResponseSchema, // 判别联合成员
  hostBroadcastClaimCommitResponseSchema, // 判别联合成员
  hostBroadcastClaimReleaseResponseSchema, // 判别联合成员
  hostTaskRealtimePublishResponseSchema, // 判别联合成员
  hostTaskStreamOpPublishResponseSchema, // 判别联合成员
  hostTaskRunLeaseAcquireResponseSchema, // 判别联合成员
  hostTaskRunLeaseReleaseResponseSchema, // 判别联合成员
  hostTaskOwnerCommandRequestResponseSchema, // 判别联合成员
  hostTaskOwnerCommandResultResponseSchema, // 判别联合成员
  hostSessionMessageSendRequestedResponseSchema, // 判别联合成员
  hostSessionRouteAnnounceResponseSchema, // 判别联合成员
  hostSessionMessageDeliverResultResponseSchema, // 判别联合成员
  hostFeedbackLogArchiveRequestResponseSchema, // 判别联合成员
  hostBrowserExecuteRequestResponseSchema, // 判别联合成员
  hostLocalMediaPreviewPathAuthorizeRequestResponseSchema, // 判别联合成员
  hostNetworkTelemetryBatchResponseSchema, // 判别联合成员
  hostCronRunResultResponseSchema, // 判别联合成员
  hostOffPeakRunResultResponseSchema, // 判别联合成员
  hostCronSchedulerWakeRequestResponseSchema, // 判别联合成员
  hostOffPeakSchedulerWakeRequestResponseSchema, // 判别联合成员
]);

export const knorviaTaskPersistStatusSchema = z.enum(["running", "completed", "error"]); // knorviaTaskPersistStatusSchema 的定义

export const knorviaPromptImageAttachmentSchema = z.object({
  // knorviaPromptImageAttachmentSchema 的定义
  // knorviaPromptImageAttachmentSchema 的定义
  kind: /* 字面量 */ z.literal("image"),
  filename: /* 文本 */ z.string(),
  mimeType: /* 文本 */ z.string(),
  sizeBytes: /* 数值 */ z.number().int().nonnegative().optional(),
  dataBase64: /* 文本 */ z.string().optional(),
  localPath: /* 文本 */ z.string().optional(),
}); // knorviaPromptImageAttachmentSchema 收口

export const knorviaPromptVideoAttachmentSchema = z.object({
  // knorviaPromptVideoAttachmentSchema 的定义
  // knorviaPromptVideoAttachmentSchema 的定义
  kind: /* 字面量 */ z.literal("video"),
  filename: /* 文本 */ z.string(),
  mimeType: /* 文本 */ z.string(),
  sizeBytes: /* 数值 */ z.number().int().nonnegative().optional(),
  dataBase64: /* 文本 */ z.string().optional(),
  localPath: /* 文本 */ z.string().optional(),
}); // knorviaPromptVideoAttachmentSchema 收口

export const knorviaPromptPdfAttachmentSchema = z.object({
  // knorviaPromptPdfAttachmentSchema 的定义
  // knorviaPromptPdfAttachmentSchema 的定义
  kind: /* 字面量 */ z.literal("pdf"),
  filename: /* 文本 */ z.string(),
  mimeType: /* 文本 */ z.string(),
  sizeBytes: /* 数值 */ z.number().int().nonnegative().optional(),
  dataBase64: /* 文本 */ z.string().optional(),
  localPath: /* 文本 */ z.string().optional(),
}); // knorviaPromptPdfAttachmentSchema 收口

export const knorviaPromptFileAttachmentSchema = z.object({
  // knorviaPromptFileAttachmentSchema 的定义
  // knorviaPromptFileAttachmentSchema 的定义
  kind: /* 字面量 */ z.literal("file"),
  filename: /* 文本 */ z.string(),
  mimeType: /* 文本 */ z.string(),
  sizeBytes: /* 数值 */ z.number().int().nonnegative(),
  dataBase64: /* 文本 */ z.string().optional(),
  textContent: /* 文本 */ z.string().optional(),
  localPath: /* 文本 */ z.string().optional(),
}); // knorviaPromptFileAttachmentSchema 收口

export const knorviaPromptAttachmentSchema = z.discriminatedUnion("kind", [
  // knorviaPromptAttachmentSchema 的定义
  // knorviaPromptAttachmentSchema 的定义
  knorviaPromptImageAttachmentSchema, // 判别联合成员
  knorviaPromptVideoAttachmentSchema, // 判别联合成员
  knorviaPromptPdfAttachmentSchema, // 判别联合成员
  knorviaPromptFileAttachmentSchema, // 判别联合成员
]);

export const knorviaPersistedToolCallSchema = z.object({
  // knorviaPersistedToolCallSchema 的定义
  // knorviaPersistedToolCallSchema 的定义
  toolName: /* 文本 */ z.string().optional(),
  title: /* 文本 */ z.string().optional(),
  kind: /* 文本 */ z.string().optional(),
  status: /* 枚举 */ z.enum(["completed", "failed", "denied", "stopped"]).optional(),
  input: /* 任意值 */ z.unknown(),
  output: /* 任意值 */ z.unknown().optional(),
  error: /* 文本 */ z.string().optional(),
  raw: /* 任意值 */ z.unknown().optional(),
  snapshotRefs: /* 嵌套结构 */ z
    .array(
      // 链式修饰
      z.object({
        // 分支对象
        field: /* 枚举 */ z.enum(["input", "output", "raw"]),
        refId: /* 文本 */ z.string(),
        hash: /* 文本 */ z.string(),
        fullBytes: /* 数值 */ z.number().int().nonnegative(),
        previewBytes: /* 数值 */ z.number().int().nonnegative(),
      }),
    )
    .optional(), // 修饰链
}); // knorviaPersistedToolCallSchema 收口

const knorviaPersistedMessagePartSchema = z.discriminatedUnion("type", [
  // knorviaPersistedMessagePartSchema 的定义
  z.object({ type: z.literal("content"), content: z.string() }), // 分支对象
  z.object({ type: z.literal("thought"), content: z.string() }), // 分支对象
  z.object({
    // 分支对象
    type: /* 字面量 */ z.literal("tool-call"),
    toolIndex: /* 数值 */ z.number().int().nonnegative(),
  }),
]);

export const knorviaPersistedMessageSchema = z.object({
  // knorviaPersistedMessageSchema 的定义
  // knorviaPersistedMessageSchema 的定义
  id: /* 文本 */ z.string().optional(),
  role: /* 枚举 */ z.enum(["user", "assistant"]),
  content: /* 文本 */ z.string(),
  timestamp: /* 数值 */ z.number().int().nonnegative(),
  model: /* 文本 */ z.string().optional(),
  characterCount: /* 数值 */ z.number().int().nonnegative().optional(),
  durationMs: /* 数值 */ z.number().int().nonnegative().optional(),
  interrupted: /* 布尔 */ z.boolean().optional(),
  feedback: /* 枚举 */ z.enum(["like", "dislike"]).optional(),
  attachments: /* 数组 */ z.array(knorviaPromptAttachmentSchema).optional(),
  tools: /* 数组 */ z.array(knorviaPersistedToolCallSchema).optional(),
  thought: /* 文本 */ z.string().optional(),
  parts: /* 数组 */ z.array(knorviaPersistedMessagePartSchema).optional(),
  checkpointState: /* 枚举 */ z.enum(["partial"]).optional(),
  checkpointReason: /* 枚举 */ z.enum(["tool_completed", "part_boundary", "periodic"]).optional(),
  checkpointUpdatedAt: /* 数值 */ z.number().int().nonnegative().optional(),
  turnIndex: /* 数值 */ z.number().int().nonnegative().optional(),
  bodyRefs: /* 嵌套结构 */ z
    .array(
      // 链式修饰
      z.object({
        // 分支对象
        field: /* 枚举 */ z.enum(["content", "thought"]),
        refId: /* 文本 */ z.string(),
        hash: /* 文本 */ z.string(),
        fullBytes: /* 数值 */ z.number().int().nonnegative(),
        previewBytes: /* 数值 */ z.number().int().nonnegative(),
      }),
    )
    .optional(), // 修饰链
  toolSlice: /* 嵌套结构 */ z
    .object({
      // 链式修饰
      // 修饰链
      persistedMessageIndex: /* 数值 */ z.number().int().nonnegative(),
      totalTools: /* 数值 */ z.number().int().nonnegative(),
      startToolIndex: /* 数值 */ z.number().int().nonnegative(),
      endToolIndexExclusive: /* 数值 */ z.number().int().nonnegative(),
    }) // knorviaPersistedMessageSchema 收口
    .optional(), // 修饰链
}); // knorviaPersistedMessageSchema 收口

export const knorviaTaskGoalStatusSchema = z.enum([
  // knorviaTaskGoalStatusSchema 的定义
  // knorviaTaskGoalStatusSchema 的定义
  "active", // 枚举值
  "paused", // 枚举值
  "budget_limited", // 枚举值
  "complete", // 枚举值
]);

export const knorviaTaskTargetChangedActionSchema = z.enum([
  // knorviaTaskTargetChangedActionSchema 的定义
  // knorviaTaskTargetChangedActionSchema 的定义
  "set", // 枚举值
  "status_updated", // 枚举值
  "cleared", // 枚举值
  "usage_accounted", // 枚举值
  "run_started", // 枚举值
  "run_finished", // 枚举值
  "summary_updated", // 枚举值
]);

export const knorviaTaskTargetChangedSourceSchema = z.enum(["command", "tool", "runtime"]); // knorviaTaskTargetChangedSourceSchema 的定义

export const knorviaTaskGoalSchema = z.object({
  // knorviaTaskGoalSchema 的定义
  // knorviaTaskGoalSchema 的定义
  sessionID: /* 嵌套结构 */ nonEmptyStringSchema,
  targetID: /* 嵌套结构 */ nonEmptyStringSchema,
  objective: /* 嵌套结构 */ nonEmptyStringSchema,
  summaryTitle: /* 可空非空文本 */ z.string().min(1).nullable().default(null),
  status: /* 嵌套结构 */ knorviaTaskGoalStatusSchema,
  tokenBudget: /* 可空数值 */ z.number().int().positive().nullable(),
  tokensUsed: /* 数值 */ z.number().int().nonnegative(),
  timeUsedSeconds: /* 数值 */ z.number().int().nonnegative(),
  activeInputId: /* 可空嵌套结构 */ nonEmptyStringSchema.nullable().optional(),
  activeRunStartedAtMs: /* 可空数值 */ z.number().int().nonnegative().nullable().optional(),
  activeRunLastSeenAtMs: /* 可空数值 */ z.number().int().nonnegative().nullable().optional(),
  time: z.object({
    created: /* 数值 */ z.number().int().nonnegative(),
    updated: /* 数值 */ z.number().int().nonnegative(),
  }),
}); // knorviaTaskGoalSchema 收口

export const knorviaTaskGoalChangedPatchSchema = z.object({
  // knorviaTaskGoalChangedPatchSchema 的定义
  // knorviaTaskGoalChangedPatchSchema 的定义
  action: /* 嵌套结构 */ knorviaTaskTargetChangedActionSchema,
  source: /* 嵌套结构 */ knorviaTaskTargetChangedSourceSchema,
  target: /* 可空嵌套结构 */ knorviaTaskGoalSchema.nullable(),
  previousTarget: /* 可空嵌套结构 */ knorviaTaskGoalSchema.nullable().optional(),
}); // knorviaTaskGoalChangedPatchSchema 收口

export const knorviaTaskTargetStatusSchema = knorviaTaskGoalStatusSchema; // knorviaTaskTargetStatusSchema 的定义
export const knorviaTaskTargetSchema = knorviaTaskGoalSchema; // knorviaTaskTargetSchema 的定义
export const knorviaTaskTargetChangedPatchSchema = knorviaTaskGoalChangedPatchSchema; // knorviaTaskTargetChangedPatchSchema 的定义

export const knorviaTaskMetaSchema = z.object({
  // knorviaTaskMetaSchema 的定义
  // knorviaTaskMetaSchema 的定义
  taskId: /* 嵌套结构 */ nonEmptyStringSchema,
  traceId: /* 嵌套结构 */ nonEmptyStringSchema,
  title: /* 文本 */ z.string(),
  titleOverridden: /* 布尔 */ z.boolean().optional(),
  workspacePath: /* 嵌套结构 */ nonEmptyStringSchema,
  workspaceIdentity: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  workspacePurpose: /* 枚举 */ z.enum(["project", "conversation"]).optional(),
  createdAt: /* 数值 */ z.number().int().nonnegative(),
  updatedAt: /* 数值 */ z.number().int().nonnegative(),
  mode: /* 嵌套结构 */ knorviaTaskModeSchema,
  model: /* 文本 */ z.string().optional(),
  thoughtLevel: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  runtimeEpoch: /* 数值 */ z.number().int().nonnegative().optional(),
  provider: /* 嵌套结构 */ persistedAgentProviderSchema.optional(),
  migrationSource: /* 嵌套结构 */ knorviaTaskMigrationSourceSchema.optional(),
  forkedFromTaskId: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  cronAutomationId: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  offPeakTaskId: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
  unreadAt: /* 数值 */ z.number().int().nonnegative().optional(),
  status: /* 嵌套结构 */ knorviaTaskPersistStatusSchema.optional(),
  lastError: /* 嵌套结构 */ z
    .object({
      // 链式修饰
      // 修饰链
      code: /* 文本 */ z.string().optional(),
      detail: /* 文本 */ z.string().optional(),
      message: /* 非空文本 */ z.string().min(1),
      traceId: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
      taskId: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
      attribution: /* 嵌套结构 */ errorAttributionSchema.optional(),
    }) // knorviaTaskMetaSchema 收口
    .optional(), // 修饰链
  changeSummary: /* 嵌套结构 */ z
    .object({
      // 链式修饰
      // 修饰链
      fileCount: /* 数值 */ z.number().int().nonnegative(),
      added: /* 数值 */ z.number().int().nonnegative(),
      removed: /* 数值 */ z.number().int().nonnegative(),
      files: z.array(
        z.object({
          // 分支对象
          path: /* 文本 */ z.string(),
          added: /* 数值 */ z.number().int().nonnegative(),
          removed: /* 数值 */ z.number().int().nonnegative(),
          writeCount: /* 数值 */ z.number().int().positive(),
          lastTurnIndex: /* 数值 */ z.number().int().nonnegative(),
        }),
      ),
    }) // knorviaTaskMetaSchema 收口
    .optional(), // 修饰链
  target: /* 可空嵌套结构 */ knorviaTaskGoalSchema.nullable().optional(),
}); // knorviaTaskMetaSchema 收口

export const knorviaTaskIndexEntrySchema = z.object({
  // knorviaTaskIndexEntrySchema 的定义
  // knorviaTaskIndexEntrySchema 的定义
  workspaceHash: /* 嵌套结构 */ nonEmptyStringSchema,
  taskId: /* 嵌套结构 */ nonEmptyStringSchema,
}); // knorviaTaskIndexEntrySchema 收口

export const knorviaPinnedTasksFileSchema = z.object({
  // knorviaPinnedTasksFileSchema 的定义
  // knorviaPinnedTasksFileSchema 的定义
  version: /* 字面量 */ z.literal("1"),
  tasks: /* 数组 */ z.array(knorviaTaskIndexEntrySchema),
}); // knorviaPinnedTasksFileSchema 收口

const knorviaPersistedFileSnapshotSchema = z.object({
  // knorviaPersistedFileSnapshotSchema 的定义
  path: /* 文本 */ z.string(),
  beforeContent: /* 可空文本 */ z.string().nullable(),
  afterContent: /* 文本 */ z.string(),
  writeCount: /* 数值 */ z.number().int().positive(),
  contentRefs: /* 嵌套结构 */ z
    .array(
      // 链式修饰
      z.object({
        // 分支对象
        field: /* 枚举 */ z.enum(["beforeContent", "afterContent"]),
        refId: /* 文本 */ z.string(),
        hash: /* 文本 */ z.string(),
        fullBytes: /* 数值 */ z.number().int().nonnegative(),
        previewBytes: /* 数值 */ z.number().int().nonnegative(),
      }),
    )
    .optional(), // 修饰链
}); // knorviaPinnedTasksFileSchema 收口

const knorviaPersistedFileChangeSchema = z.object({
  // knorviaPersistedFileChangeSchema 的定义
  turnIndex: /* 数值 */ z.number().int().nonnegative(),
  snapshots: /* 数组 */ z.array(knorviaPersistedFileSnapshotSchema),
  fileState: /* 枚举 */ z.enum(["applied", "reverted"]).optional(),
}); // knorviaPinnedTasksFileSchema 收口

const knorviaPersistedTurnCheckpointSchema = z.object({
  // knorviaPersistedTurnCheckpointSchema 的定义
  turnIndex: /* 数值 */ z.number().int().nonnegative(),
  baseFileCheckpointId: /* 嵌套结构 */ nonEmptyStringSchema,
  resultFileCheckpointId: /* 嵌套结构 */ nonEmptyStringSchema.optional(),
}); // knorviaPinnedTasksFileSchema 收口

export const sessionFileSchema = z.object({
  // sessionFileSchema 的定义
  // sessionFileSchema 的定义
  meta: /* 嵌套结构 */ knorviaTaskMetaSchema,
  messages: /* 数组 */ z.array(knorviaPersistedMessageSchema),
  fileChanges: /* 数组 */ z.array(knorviaPersistedFileChangeSchema).optional(),
  turnCheckpoints: /* 数组 */ z.array(knorviaPersistedTurnCheckpointSchema).optional(),
}); // sessionFileSchema 收口
