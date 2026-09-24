import {
  databaseStartupErrorCodeSchema,
  databaseStartupErrorDetailsSchema,
  databaseMigrationFactsSchema,
} from "../database-startup.js";
/* oxlint-disable eslint(max-lines) -- Knorvia Protocol schema 需要单文件导出，方便 app 与 agent 共享同一份协议契约。 */
// ── 旧协议删除边界──────────────────────
// 剩余 ~257 个导出：旧 Knorvia Protocol 方法契约、请求/响应/事件 schema、
// session/workspace state snapshot 投影等（承重类型已迁 protocol-legacy-types.ts）。
// 已连根删除的死词（词表+schema+两侧实现）：session/steer、session/rewind、
// session/rewindCascade、session/previewFileRewind、session/applyFileRewind、
// prompt/enhance 全簇（含 promptEnhanceResult 通知）、plugins/marketplace/list；
// session/fork 客户端链已删（op+schema 留存 = v4 forkSessionAtMessage 钩子消费）。
// 消费者：services 旧栈（protocolClient/agent/agentService/session*）、
// CLI bootstrap 旧协议 server（protocol/server-operations、plugins、session-mapper 等）、
// UI 旧投影（sessionProjection 等读路径）。
// 上述旧协议 client/server 组删除时，本文件整体删除。
// 注：外部零消费 schema 多为存活 schema 联合的内部依赖，随宿主文件一起处理，勿单删。
import { bashOutputDisplaySchema } from "../bash-output-display.js";
// 后台详情共享精简的只读响应 schema，不携带命令或计时元数据。
export * from "../background-bash-output.js";
import { executionOutputPreviewSchema } from "../execution-output-preview.js";
import { z } from "zod";
export * from "../process-diagnostic.js";
import { errorAttributionSchema } from "../protocol-v4/snapshot.js";
import { modelSelectionSchema } from "../model-selection.js";
import { completeModelPropertiesDataSchema } from "../model-config.js";
import { accountProviderUnavailableReasonSchema } from "../account-provider-state.js";
import { modelExecutionSchema } from "../model-execution.js";
import { APP_USAGE_RANGES, appUsageSnapshotSchema } from "../usage-stats.js";
// browser-use 命令/结果契约单一来源：agent 构造、协议校验和 main executor 共用同一 schema。
import { browserClientModeSchema, browserCommandSchema } from "../browser-use/commands.js";
import {
  browserBackendListResultSchema,
  browserSessionContextKindSchema,
} from "../browser-use/backend.js";
import { browserCommandResultSchema } from "../browser-use/result.js";
import { integratedTerminalShellSelectionSchema } from "../validationAppSettings.js";
import { knorviaTaskModeSchema } from "../task-mode-schema.js";
import { OFFICIAL_MCP_AUTH_PORT_FAILURE_REASONS } from "../official-mcp-auth.js";
import {
  knorviaDeliveryKindSchema,
  knorviaMessageVisibilitySchema,
  knorviaSyntheticUserMessageSourceSchema as legacyKnorviaSyntheticUserMessageSourceSchema,
  knorviaWorkspaceRefSchema,
  knorviaPermissionDecisionSchema,
  knorviaPermissionResponseSchema,
  knorviaPermissionUpdateSchema,
  sessionModeSchema,
  sessionStatusSchema,
  sessionKindSchema,
  sessionGoalSchema,
  sessionGoalVerificationSchema,
  sessionGoalVerificationTimelineSchema,
  knorviaInteractionRequestOriginSchema,
  knorviaToolStateSchema,
  sessionApiRetryStatusSchema,
  sessionContextUsageSchema,
  sessionInfoSchema,
  sessionRuntimeStateSchema,
  knorviaMessageWithPartsSchema,
  knorviaMessagePartSchema,
} from "../protocol-legacy-types.js";

export {
  hookExecutionProjectionSchema,
  hookInvocationRowSchema,
  type HookExecutionProjection,
  type HookInvocationRow,
} from "../protocol-v4/rows.js";

export const KNORVIA_PROTOCOL_NAME = "Knorvia Studio Protocol" as const;
export const KNORVIA_PROTOCOL_VERSION = 1 as const;
// V4 wire 与 legacy 主协议并存；禁止为了 V4 physical framing 改写 legacy 版本。
export const KNORVIA_PROTOCOL_V4_WIRE_VERSION = 3 as const;
export const knorviaRuntimeCapabilitiesSchema = z.object({
  independentPlanState: z.boolean().optional(),
});
export const knorviaProtocolErrorCodes = {
  sessionUnavailable: -32004,
} as const;

const nonEmptyString = z.string().trim().min(1);
const jsonObjectSchema = z.record(z.string(), z.unknown());
const timestampMsSchema = z.number().int().nonnegative();
const protocolInstantSchema = z.union([timestampMsSchema, nonEmptyString, z.date()]);

// Tool result display 不受模型文本 budget 约束；Node REPL 图片必须在 Agent/App 协议边界
// 做严格限长，避免截图把 continuous 或 replayable 消息扩成无界载荷。
export const knorviaNodeReplImageToolResultDisplaySchema = z
  .object({
    kind: z.literal("node_repl_images"),
    images: z
      .array(
        z
          .object({
            base64: z
              .string()
              .min(1)
              .max(200 * 1024),
            mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/iu),
          })
          .strict(),
      )
      .min(1)
      .max(2),
    truncated: z.boolean().optional(),
    source: z.literal("browser_turn_end").optional(),
  })
  .strict();

// 同理：CreateWorkflow 的类型检查诊断也是 display 通道，必须在协议边界限长，
// 避免大量诊断把 continuous/replayable 消息扩成无界载荷。
// causalityGraph 在工具输出边界已限长，这里镜像同一组上界（与 v4 rows 保持一致）。
// 图的词汇表刻意很小：step 卡片 + actor 车道 + 一种箭头（runs after，`back` 只标回边）+
// 返回物标记。分析器的 kind / certainty / exact / region 不进载荷。
// 名字只在运行时成形（`` agent(`研究员${i + 1}`) ``）时静态能拿到的形状：第一个洞之前的
// 字面量（head）与最后一个洞之后的字面量（tail）。至少一个在场，两者都已 trim 且含实义字符。
// Bug 修复：这两个字段随 0a8b059f40 落进 contracts 与 v4 镜像，v3 这份漏改——.strict()
// 之下带插值名的工作流会让整个 display 验证失败、图整块消失，所以这里必须与 v4 逐字段对齐。
const knorviaWorkflowNamePatternSchema = z
  .object({
    head: z.string().min(1).max(128).optional(),
    tail: z.string().min(1).max(128).optional(),
  })
  .strict();

// 一条边 = runs after；step 边与阶段边同形，`back` 只标循环回边。
const knorviaWorkflowEdgeSchema = z
  .object({
    from: z.string().min(1).max(64),
    to: z.string().min(1).max(64),
    back: z.literal(true).optional(),
  })
  .strict();

const knorviaCreateWorkflowCausalityGraphDisplaySchema = z
  .object({
    steps: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            kind: z.enum(["ask", "world-read"]),
            label: z.string().min(1).max(128),
            // 内联 `agent()` receiver 让 label 落到兜底串时，那个名字的静态形状。
            labelPattern: knorviaWorkflowNamePatternSchema.optional(),
            line: z.number().int().positive().optional(),
            column: z.number().int().positive().optional(),
            lane: z.string().min(1).max(64),
            lanes: z.array(z.string().min(1).max(64)).max(32).optional(),
            // 展开自的站点 id，只出现在 may-set 车道展开的拷贝上（实时叠加的关联键）；
            // 加字段是 additive 的，不带它的旧载荷照常通过 .strict()。
            source: z.string().min(1).max(64).optional(),
            // 作者用 `phase("…")` 标记划入的阶段。
            // 与图的 phases / phaseEdges / exits 同进同退：全在场或全缺席。
            phase: z.string().min(1).max(64).optional(),
            repeat: z.enum(["stack", "serial"]).optional(),
          })
          .strict(),
      )
      .max(64),
    lanes: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            name: z.string().min(1).max(128).optional(),
            // `name` 缺席而 agent() 首参是带洞的模板串时的静态形状；与 name 互斥。
            namePattern: knorviaWorkflowNamePatternSchema.optional(),
            line: z.number().int().positive().optional(),
            column: z.number().int().positive().optional(),
          })
          .strict(),
      )
      .max(32),
    // 参与者与交接；镜像 v4。
    participants: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            phase: z.string().min(1).max(64),
            lane: z.string().min(1).max(64),
            steps: z.array(z.string().min(1).max(64)).min(1).max(64),
            member: z
              .object({ index: z.number().int().nonnegative(), of: z.number().int().positive() })
              .strict()
              .optional(),
            many: z.literal(true).optional(),
          })
          .strict(),
      )
      .max(64),
    handoffs: z
      .array(
        knorviaWorkflowEdgeSchema
          .extend({ types: z.array(z.string().min(1).max(128)).min(1).max(8).optional() })
          .strict(),
      )
      .max(256),
    // 阶段词汇表：作者施加的分组结构，主画面以它为节点。与 phaseEdges / exits / Step.phase
    // 全有或全无——零标记脚本全缺席，UI 据此退回 step/车道视图。零成员阶段也在表里。
    // `unphased` 无 name，显示名由 UI 本地化。
    phases: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            name: z.string().min(1).max(128).optional(),
            line: z.number().int().positive().optional(),
            column: z.number().int().positive().optional(),
            // 进入本阶段时还在跑的其他阶段（它们的 strand 尚未 join），阶段表序，不含自己，
            // 为空时缺席。是节点事实而不是边——控制没有从那里转移过来，所以不进 phaseEdges。
            // 时间轴据此把相邻阶段折成一条分叉的「带」，侧栏迷你轨道画成双线段。
            alongside: z.array(z.string().min(1).max(64)).min(1).max(32).optional(),
          })
          .strict(),
      )
      .max(32)
      .optional(),
    phaseEdges: z.array(knorviaWorkflowEdgeSchema).max(128).optional(),
    // 控制流可在其后正常完成的阶段（阶段视图的「阶段 → 返回物」箭头）；组内可为空数组。
    exits: z.array(z.string().min(1).max(64)).max(32).optional(),
    sink: z.array(z.string().min(1).max(64)).max(64).optional(),
    truncated: z.boolean().optional(),
  })
  .strict();

export const knorviaCreateWorkflowToolResultDisplaySchema = z
  .object({
    kind: z.literal("create_workflow"),
    ok: z.boolean(),
    errorCount: z.number().int().nonnegative(),
    diagnostics: z
      .array(
        z
          .object({
            line: z.number().int().nonnegative(),
            column: z.number().int().nonnegative(),
            code: z.number().int().nonnegative(),
            message: z.string().min(1).max(2_048),
          })
          .strict(),
      )
      .max(100),
    causalityGraph: knorviaCreateWorkflowCausalityGraphDisplaySchema.optional(),
    truncated: z.boolean().optional(),
  })
  .strict();

const knorviaToolResultObjectSchema = jsonObjectSchema.superRefine((result, context) => {
  const display = result.display;
  if (typeof display !== "object" || display === null || Array.isArray(display)) {
    return;
  }
  const kind = (display as Record<string, unknown>).kind;
  const schemaByKind: Record<string, z.ZodTypeAny> = {
    node_repl_images: knorviaNodeReplImageToolResultDisplaySchema,
    create_workflow: knorviaCreateWorkflowToolResultDisplaySchema,
    bash_output: bashOutputDisplaySchema,
  };
  const schema = typeof kind === "string" ? schemaByKind[kind] : undefined;
  if (!schema) return;
  const parsed = schema.safeParse(display);
  if (parsed.success) return;
  for (const issue of parsed.error.issues) {
    context.addIssue({ ...issue, path: ["display", ...issue.path] });
  }
});

export const knorviaProtocolRequestIdSchema = z.union([z.string(), z.number().int()]);
export type KnorviaProtocolRequestId = z.infer<typeof knorviaProtocolRequestIdSchema>;

export const knorviaProtocolTraceSchema = z
  .object({
    traceparent: nonEmptyString.optional(),
    traceId: nonEmptyString.optional(),
    parentId: nonEmptyString.optional(),
    spanId: nonEmptyString.optional(),
  })
  .strict();
export type KnorviaProtocolTrace = z.infer<typeof knorviaProtocolTraceSchema>;

export const knorviaProtocolRequestSchema = z
  .object({
    id: knorviaProtocolRequestIdSchema,
    method: nonEmptyString,
    params: z.unknown().optional(),
    trace: knorviaProtocolTraceSchema.optional(),
  })
  .strict();
export type KnorviaProtocolRequest = z.infer<typeof knorviaProtocolRequestSchema>;

export const knorviaProtocolNotificationSchema = z
  .object({
    method: nonEmptyString,
    params: z.unknown().optional(),
    trace: knorviaProtocolTraceSchema.optional(),
  })
  .strict();
export type KnorviaProtocolNotification = z.infer<typeof knorviaProtocolNotificationSchema>;

export const knorviaProtocolResponseSchema = z
  .object({
    id: knorviaProtocolRequestIdSchema,
    result: z.unknown(),
  })
  .strict();
export type KnorviaProtocolResponse = z.infer<typeof knorviaProtocolResponseSchema>;

export const knorviaProtocolErrorSchema = z
  .object({
    id: knorviaProtocolRequestIdSchema,
    error: z
      .object({
        code: z.number().int(),
        message: nonEmptyString,
        data: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();
export type KnorviaProtocolError = z.infer<typeof knorviaProtocolErrorSchema>;

export const knorviaProtocolMessageSchema = z.union([
  knorviaProtocolRequestSchema,
  knorviaProtocolNotificationSchema,
  knorviaProtocolResponseSchema,
  knorviaProtocolErrorSchema,
]);
export type KnorviaProtocolMessage = z.infer<typeof knorviaProtocolMessageSchema>;

export const knorviaProtocolNotifications = {
  storageStartup: "startup/storageState",
  providerRuntimeHeadersCancelled: "interaction/providerRuntimeHeadersCancelled",
  mcpTelemetry: "process/mcpTelemetry",
  mcpResourceSamples: "process/mcpResourceSamples",
  toolExecResource: "process/toolExecResource",
  pluginOperationProgress: "plugins/operationProgress",
  processResourceSample: "process/resourceSample",
} as const;

/** 启动控制面独立于 task stream；数据库身份不可携带路径/凭据。 */
export const knorviaStorageStartupStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    attemptId: z.string().min(1).max(128),
    sequence: z.number().int().positive(),
    databaseId: z.string().min(1).max(128),
    databaseKind: z.enum(["session", "tasks-index"]),
    phase: z.enum(["checking", "waiting_for_lock", "migrating", "committing", "ready", "failed"]),
    // 包含锁内、版本 SQL 之前的可选 lastAppliedMigrationId；旧通知仍可解析。
    migration: databaseMigrationFactsSchema.optional(),
    elapsedMs: z.number().nonnegative().finite(),
    completed: z.number().int().nonnegative().optional(),
    total: z.number().int().nonnegative().optional(),
    errorCode: databaseStartupErrorCodeSchema.optional(),
    ...databaseStartupErrorDetailsSchema.shape,
  })
  .strict()
  .superRefine((state, context) => {
    if (state.phase === "failed" && !state.errorCode)
      context.addIssue({ code: "custom", message: "failed requires errorCode" });
  });
export type KnorviaStorageStartupState = z.infer<typeof knorviaStorageStartupStateSchema>;

const knorviaMcpTelemetryPlatformSchema = z.enum([
  "aix",
  "android",
  "darwin",
  "freebsd",
  "haiku",
  "linux",
  "netbsd",
  "openbsd",
  "sunos",
  "win32",
  "cygwin",
]);
const knorviaMcpTelemetryArchSchema = z.enum([
  "arm",
  "arm64",
  "ia32",
  "loong64",
  "mips",
  "mipsel",
  "ppc",
  "ppc64",
  "riscv64",
  "s390",
  "s390x",
  "x64",
]);
const knorviaMcpTelemetryBaseSchema = z
  .object({
    arch: knorviaMcpTelemetryArchSchema,
    occurredAt: z.number().int().nonnegative(),
    platform: knorviaMcpTelemetryPlatformSchema,
  })
  .strict();
const knorviaMcpProcessTelemetryBaseShape = {
  mcpId: z
    .string()
    .regex(
      /^(?:builtin:(?:[A-Za-z0-9._~-]|%[0-9A-F]{2})+(?::(?:[A-Za-z0-9._~-]|%[0-9A-F]{2})+)*|(?:plugin|custom):[a-f0-9]{12})$/,
    ),
  mcpInstanceId: nonEmptyString,
  mcpIsolation: z.enum(["session", "workspace"]),
  mcpSource: z.enum(["builtin", "plugin", "custom"]),
} as const;

export const knorviaMcpTelemetryEventSchema = z.discriminatedUnion("kind", [
  knorviaMcpTelemetryBaseSchema
    .extend({
      kind: z.literal("process_start"),
      ...knorviaMcpProcessTelemetryBaseShape,
    })
    .strict(),
  knorviaMcpTelemetryBaseSchema
    .extend({
      kind: z.literal("process_crash"),
      ...knorviaMcpProcessTelemetryBaseShape,
      affectedSessionCount: z.number().int().nonnegative().max(10_000),
      exitCode: z.number().int().nullable(),
      signal: nonEmptyString.nullable(),
      uptimeMs: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
    })
    .strict(),
  knorviaMcpTelemetryBaseSchema
    .extend({
      kind: z.literal("session_startup"),
      configuredCount: z.number().int().nonnegative().max(10_000),
      connectedCount: z.number().int().nonnegative().max(10_000),
      failedCount: z.number().int().nonnegative().max(10_000),
      processCount: z.number().int().nonnegative().max(10_000),
      sessionId: nonEmptyString,
    })
    .strict(),
  knorviaMcpTelemetryBaseSchema
    .extend({
      kind: z.literal("memory"),
      ...knorviaMcpProcessTelemetryBaseShape,
      memoryKb: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
      memoryScope: z.enum(["process_tree", "direct_process"]),
      orphanSuspected: z.boolean(),
      ownerSessionCount: z.number().int().nonnegative().max(10_000),
      unownedSeconds: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
    })
    .strict(),
]);
export type KnorviaMcpTelemetryEvent = z.infer<typeof knorviaMcpTelemetryEventSchema>;

/** MCP 每五分钟只探测一次，周期由生产者与设备总量过期判据共用。 */
export const KNORVIA_MCP_RESOURCE_SAMPLE_INTERVAL_MS = 5 * 60_000;

export const knorviaMcpResourceSampleSchema = z
  .object({
    mcpId: knorviaMcpProcessTelemetryBaseShape.mcpId,
    instanceToken: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    sampledAt: z.number().int().nonnegative(),
    intervalMs: z.number().finite().positive(),
    processCount: z.number().int().positive().max(100_000),
    rssKbTotal: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
    rssKbMaxProcess: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
    cpuTimeMsDelta: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
    uptimeMinutes: z.number().int().nonnegative(),
    platform: knorviaMcpTelemetryPlatformSchema,
    arch: knorviaMcpTelemetryArchSchema,
    logicalCpuCount: z.number().int().positive().max(4_096),
    totalMemoryGb: z.number().int().nonnegative().max(1_048_576),
  })
  .strict();
export type KnorviaMcpResourceSample = z.infer<typeof knorviaMcpResourceSampleSchema>;
// 通知输入有界；main 另按每个上报窗口的 32 个 MCP 分组执行事件额度。
export const knorviaMcpResourceSamplesSchema = z.array(knorviaMcpResourceSampleSchema).max(1_024);

export const BASH_RESOURCE_SAMPLE_INTERVAL_MS = 15_000;
export const BASH_RESOURCE_MAX_SAMPLES = 20;

/** Bash 子进程的有界完成事实；禁止命令、路径与会话标识进入遥测旁路。 */
export const knorviaToolExecResourceSchema = z
  .object({
    // 同一完成事实可能经多个 Host 转发；随机标识仅供 main 去重，旧 CLI 缺字段仍兼容。
    completionToken: z.string().uuid().optional(),
    platform: knorviaMcpTelemetryPlatformSchema,
    toolName: z.literal("bash"),
    durationMs: z.number().finite().min(BASH_RESOURCE_SAMPLE_INTERVAL_MS),
    exitKind: z.enum(["completed", "timeout", "killed", "error"]),
    treeRssKbPeak: z.number().finite().nonnegative().optional(),
    treeCpuTimeMs: z.number().finite().nonnegative().optional(),
    sampleCount: z.number().int().nonnegative().max(BASH_RESOURCE_MAX_SAMPLES),
    cliRssKb: z.number().finite().nonnegative(),
    systemFreeMemoryKb: z.number().finite().nonnegative(),
  })
  .strict();
export type KnorviaToolExecResource = z.infer<typeof knorviaToolExecResourceSchema>;

export const knorviaProcessResourceSampleSchema = z
  .object({
    platform: z.enum([
      "aix",
      "android",
      "darwin",
      "freebsd",
      "haiku",
      "linux",
      "netbsd",
      "openbsd",
      "sunos",
      "win32",
      "cygwin",
    ]),
    arch: z.enum([
      "arm",
      "arm64",
      "ia32",
      "loong64",
      "mips",
      "mipsel",
      "ppc",
      "ppc64",
      "riscv64",
      "s390",
      "s390x",
      "x64",
    ]),
    logicalCpuCount: z.number().int().positive().max(4_096),
    intervalMs: z
      .number()
      .int()
      .positive()
      .max(7 * 24 * 60 * 60 * 1_000),
    cpuCores: z.number().finite().nonnegative().max(4_096),
    cpuPercent: z.number().finite().nonnegative().max(100_000),
    rssKb: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
    /**
     * 以下四项为遥测新增字段，全部可选：旧 CLI 发来的样本仍能通过校验，因此
     * **不递增协议握手版本号**（握手版本是兼容性开关，不是字段版本）。
     */
    heapUsedKb: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    uptimeMinutes: z
      .number()
      .int()
      .nonnegative()
      .max(10 * 365 * 24 * 60)
      .optional(),
    totalMemoryGb: z.number().int().nonnegative().max(1_048_576).optional(),
    /**
     * CLI 进程启动时随机生成的实例标识，仅供 app 侧 main 统计「同时存活几个 CLI 进程」
     * 与「最大单进程 RSS」。不进 ARMS 属性、不含 pid。收紧字符集是隐私红线的机械保障：
     * 路径、workspace 标识这类内容不可能通过校验。
     */
    instanceToken: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,64}$/)
      .optional(),
  })
  .strict();
export type KnorviaProcessResourceSample = z.infer<typeof knorviaProcessResourceSampleSchema>;

export const knorviaProcessChildProcessesParamsSchema = z.object({}).strict();
export const knorviaProcessChildProcessSchema = z
  .object({
    pid: z.number().int().positive(),
    serverName: nonEmptyString,
    mcpSource: z.enum(["builtin", "plugin", "custom"]),
    /** 官方/第三方插件的插件名（`plugin:<name>:<key>` 的 name，或官方 host MCP 对应插件）；custom 无 */
    pluginName: nonEmptyString.optional(),
  })
  .strict();
export const knorviaProcessChildProcessesResultSchema = z
  .object({
    processes: z.array(knorviaProcessChildProcessSchema).max(10_000),
  })
  .strict();
export type KnorviaProcessChildProcess = z.infer<typeof knorviaProcessChildProcessSchema>;
export type KnorviaProcessChildProcessesResult = z.infer<
  typeof knorviaProcessChildProcessesResultSchema
>;

export type KnorviaDeliveryKind = z.infer<typeof knorviaDeliveryKindSchema>;
// TurnStarted 与持久 message 必须共用同一来源词表；否则 live event 能通过而 cold
// message 在 app/agent 边界被拒绝，造成 continuous/replayable 语义分叉。
const knorviaTurnInputSourceSchema = legacyKnorviaSyntheticUserMessageSourceSchema;
export const sessionPersistenceSchema = z.enum(["immediate", "deferred"]);
export type KnorviaSessionPersistence = z.infer<typeof sessionPersistenceSchema>;
export type KnorviaWorkspaceRef = z.infer<typeof knorviaWorkspaceRefSchema>;
export const knorviaPermissionOptionSchema = z
  .object({
    optionId: nonEmptyString,
    kind: nonEmptyString,
    name: nonEmptyString,
    description: z.string().optional(),
    response: knorviaPermissionResponseSchema,
  })
  .strict();

const knorviaProtocolMcpEntrySchema = z
  .object({
    name: nonEmptyString,
    value: z.string(),
  })
  .strict();

const knorviaProtocolMcpOAuthSchema = z.union([
  z
    .object({
      type: z.literal("client_credentials"),
      clientId: nonEmptyString,
      clientSecret: nonEmptyString,
      clientName: nonEmptyString.optional(),
      scope: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("authorization_code"),
      clientId: nonEmptyString.optional(),
      clientSecret: nonEmptyString.optional(),
      clientName: nonEmptyString.optional(),
      redirectPath: nonEmptyString.optional(),
      scope: z.string().optional(),
    })
    .strict(),
]);

export const knorviaProtocolMcpServerSchema = z.union([
  z
    .object({
      name: nonEmptyString,
      command: nonEmptyString,
      args: z.array(z.string()),
      env: z.array(knorviaProtocolMcpEntrySchema),
      isolation: z.enum(["session", "workspace"]).optional(),
      protocolVersion: z.enum(["legacy", "auto", "2026-07-28"]).optional(),
      timeoutMs: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      name: nonEmptyString,
      type: z.enum(["http", "sse"]),
      url: nonEmptyString,
      headers: z.array(knorviaProtocolMcpEntrySchema),
      oauth: knorviaProtocolMcpOAuthSchema.optional(),
      isolation: z.enum(["session", "workspace"]).optional(),
      protocolVersion: z.enum(["legacy", "auto", "2026-07-28"]).optional(),
      timeoutMs: z.number().int().positive().optional(),
    })
    .strict(),
]);
export type KnorviaProtocolMcpServer = z.infer<typeof knorviaProtocolMcpServerSchema>;

export const knorviaMcpServerStatusKindSchema = z.enum([
  "connecting",
  "connected",
  "disabled",
  "disconnected",
  "failed",
  "untrusted",
]);
export const MCP_SERVER_FAILURE_KINDS = [
  "config_invalid",
  "runtime_unavailable",
  "process_start_failed",
  "network_unreachable",
  "connection_timeout",
  "protocol_negotiation_failed",
  "tool_list_failed",
  "unexpected_disconnect",
  "oauth_authorization_failed",
  "official_origin_untrusted",
  "not_authenticated",
  "coding_plan_required",
  "server_not_found",
  "server_unavailable",
  "rate_limited",
  "server_internal_error",
  "protocol_error",
  "status_unavailable",
  "connection_failed",
] as const;
export const mcpServerFailureKindSchema = z.enum(MCP_SERVER_FAILURE_KINDS);
export type McpServerFailureKind = z.infer<typeof mcpServerFailureKindSchema>;
export const knorviaMcpServerStatusSnapshotSchema = z
  .object({
    status: knorviaMcpServerStatusKindSchema,
    transport: z.enum(["stdio", "http", "sse"]),
    toolCount: z.number().int().nonnegative(),
    updatedAt: nonEmptyString,
    error: z.string().optional(),
    failureKind: mcpServerFailureKindSchema.optional(),
    serverRequestId: nonEmptyString.optional(),
    protocolEra: z.enum(["legacy", "modern"]).optional(),
    authorization: z
      .object({
        type: z.literal("oauth_authorization_code"),
        authorizationUrl: nonEmptyString,
        startedAt: nonEmptyString,
      })
      .strict()
      .optional(),
  })
  .strict();
export type KnorviaMcpServerStatusSnapshot = z.infer<typeof knorviaMcpServerStatusSnapshotSchema>;

export const knorviaMcpListModeSchema = z.enum(["connect", "status"]);
export type KnorviaMcpListMode = z.infer<typeof knorviaMcpListModeSchema>;

export const knorviaMcpListParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    mcpServers: z.array(knorviaProtocolMcpServerSchema).optional(),
    mode: knorviaMcpListModeSchema.default("connect"),
  })
  .strict();
export const knorviaMcpListResultSchema = z
  .object({
    statuses: z.record(z.string(), knorviaMcpServerStatusSnapshotSchema),
  })
  .strict();
export type KnorviaMcpListResult = z.infer<typeof knorviaMcpListResultSchema>;

export const sessionImportMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    timestamp: timestampMsSchema.optional(),
  })
  .strict();
export type KnorviaSessionImportMessage = z.infer<typeof sessionImportMessageSchema>;

export const sessionImportHistorySchema = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal("claudeCode"),
      title: z.string().optional(),
      createdAt: timestampMsSchema.optional(),
      updatedAt: timestampMsSchema.optional(),
      messages: z.array(sessionImportMessageSchema).min(1),
    })
    .strict(),
  z
    .object({
      source: z.literal("sharedContext"),
      title: z.string().trim().min(1),
      createdAt: timestampMsSchema.optional(),
      markdown: z.string().min(1),
      provenance: z
        .object({
          shareId: z.string().trim().min(1),
          contextId: z.string().trim().min(1).optional(),
          shareUrl: z.string().url().optional(),
          status: z.enum(["pending", "reserved", "attached", "discarded"]).optional(),
          projectionSha256: z.string().regex(/^[0-9a-f]{64}$/u),
          artifactSetSha256: z.string().regex(/^[0-9a-f]{64}$/u),
          formatterVersion: z.literal(1),
          markdownSha256: z.string().regex(/^[0-9a-f]{64}$/u),
          installedArtifacts: z.array(
            z
              .object({
                artifactId: z.string().trim().min(1),
                workspaceRelativePath: z.string().trim().min(1),
              })
              .strict(),
          ),
        })
        .strict(),
    })
    .strict(),
]);
export type KnorviaSessionImportHistory = z.infer<typeof sessionImportHistorySchema>;

export const knorviaThoughtLevelOptionSchema = z
  .object({
    value: nonEmptyString,
    label: nonEmptyString,
    description: z.string().optional(),
  })
  .strict();
export const knorviaModelReasoningOptionsSchema = z
  .object({
    levels: z.array(knorviaThoughtLevelOptionSchema),
    defaultLevel: nonEmptyString.optional(),
  })
  .strict();
export type KnorviaModelReasoningOptions = z.infer<typeof knorviaModelReasoningOptionsSchema>;

export const knorviaModelFormatPropertiesSchema = completeModelPropertiesDataSchema.pick({
  inputFormat: true,
  outputFormat: true,
});
export type KnorviaModelFormatProperties = z.infer<typeof knorviaModelFormatPropertiesSchema>;

export const knorviaModelOptionSchema = z
  .object({
    ref: modelSelectionSchema,
    label: nonEmptyString,
    providerLabel: nonEmptyString.optional(),
    description: z.string().optional(),
    contextWindow: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    reasoning: knorviaModelReasoningOptionsSchema.optional(),
    properties: knorviaModelFormatPropertiesSchema,
    disabledReason: z.string().optional(),
  })
  .strict();
export type KnorviaModelOption = z.infer<typeof knorviaModelOptionSchema>;

export const knorviaAccountAccessSchema = z.discriminatedUnion("planKind", [
  z
    .object({
      type: z.literal("zhipu-account"),
      family: z.enum(["zai", "bigmodel"]),
      planKind: z.literal("start-plan"),
    })
    .strict(),
  z
    .object({
      type: z.literal("zhipu-account"),
      family: z.enum(["zai", "bigmodel"]),
      planKind: z.literal("individual-coding-plan"),
    })
    .strict(),
  z
    .object({
      type: z.literal("zhipu-account"),
      family: z.enum(["zai", "bigmodel"]),
      planKind: z.literal("team-coding-plan"),
      productId: nonEmptyString,
      organizationId: nonEmptyString,
      projectId: nonEmptyString,
    })
    .strict(),
]);
export type KnorviaAccountAccess = z.infer<typeof knorviaAccountAccessSchema>;

/** Active Model 固定的账号访问类别；当前商品和 Team scope 由账号服务在请求期解析。 */
export const knorviaProviderAccountAccessSchema = z
  .object({
    type: z.literal("zhipu-account"),
    accountType: z.enum(["zai", "bigmodel"]),
    mode: z.enum(["start-plan", "individual-coding-plan", "team-coding-plan", "off-peak"]),
    entitled: z.boolean(),
  })
  .strict();
export type KnorviaProviderAccountAccess = z.infer<typeof knorviaProviderAccountAccessSchema>;

export type KnorviaSessionMode = z.infer<typeof sessionModeSchema>;
export type KnorviaSessionKind = z.infer<typeof sessionKindSchema>;
export type KnorviaSessionGoal = z.infer<typeof sessionGoalSchema>;

export const sessionTodoItemSchema = z
  .object({
    content: nonEmptyString,
    status: z.enum(["pending", "in_progress", "completed"]),
    priority: z.enum(["high", "medium", "low"]),
  })
  .strict();
export const sessionGoalStatsSchema = z
  .object({
    timeUsedSeconds: z.number().int().nonnegative(),
    tokensUsed: z.number().int().nonnegative(),
    tokenBudget: z.number().int().positive().nullable(),
    contextUsed: z.number().int().nonnegative(),
    contextWindow: z.number().int().nonnegative(),
    toolCallCount: z.number().int().nonnegative(),
    iterationCount: z.number().int().nonnegative(),
  })
  .strict();
export type KnorviaSessionGoalStats = z.infer<typeof sessionGoalStatsSchema>;
export type KnorviaSessionGoalVerification = z.infer<typeof sessionGoalVerificationSchema>;
export type KnorviaSessionGoalVerificationTimeline = z.infer<
  typeof sessionGoalVerificationTimelineSchema
>;

export const sessionTodoGroupSchema = z
  .object({
    id: nonEmptyString,
    source: z.enum(["goal_iteration", "session"]),
    goalIteration: z.number().int().positive().optional(),
    targetId: nonEmptyString.optional(),
    startedAt: timestampMsSchema.optional(),
    updatedAt: timestampMsSchema.optional(),
    todos: z.array(sessionTodoItemSchema),
  })
  .strict();
export type KnorviaSessionTodoGroup = z.infer<typeof sessionTodoGroupSchema>;

export const sessionSettingsStateSchema = z
  .object({
    model: z
      .object({
        // 未绑定是合法恢复状态；不能为满足协议而伪造模型或阻断历史读取。
        current: modelSelectionSchema.optional(),
        available: z.array(knorviaModelOptionSchema),
        lastUsed: modelSelectionSchema.optional(),
      })
      .strict(),
    thoughtLevel: z
      .object({
        enabled: z.boolean(),
        current: nonEmptyString.optional(),
        defaultLevel: nonEmptyString.optional(),
        available: z.array(knorviaThoughtLevelOptionSchema),
      })
      .strict(),
    mode: z
      .object({
        current: sessionModeSchema,
      })
      .strict(),
    permission: z
      .object({
        mode: sessionModeSchema.optional(),
        rulesRevision: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type KnorviaSessionSettingsState = z.infer<typeof sessionSettingsStateSchema>;
export const knorviaPendingPermissionSchema = z
  .object({
    requestId: nonEmptyString,
    toolCallId: nonEmptyString,
    toolName: nonEmptyString,
    reason: z.string(),
    riskLevel: z.enum(["low", "medium", "high", "critical"]),
    input: z.unknown().optional(),
    origin: knorviaInteractionRequestOriginSchema.optional(),
    options: z.array(knorviaPermissionOptionSchema).min(1),
    requestedAt: timestampMsSchema,
  })
  .strict();
export type KnorviaPendingPermission = z.infer<typeof knorviaPendingPermissionSchema>;

export const knorviaActiveToolCallSchema = z
  .object({
    toolCallId: nonEmptyString,
    toolName: nonEmptyString,
    status: z.enum(["pending", "running", "completed", "failed", "denied"]),
    startedAt: timestampMsSchema.optional(),
  })
  .strict();
export type KnorviaActiveToolCall = z.infer<typeof knorviaActiveToolCallSchema>;

export const sessionProjectionSchema = z
  .object({
    sessionId: nonEmptyString,
    status: sessionStatusSchema,
    mode: sessionModeSchema,
    turnCount: z.number().int().nonnegative(),
    totalTokenCount: z.number().int().nonnegative(),
    contextUsed: z.number().int().nonnegative(),
    contextWindow: z.number().int().nonnegative(),
    currentTurnId: nonEmptyString.optional(),
    pendingPermissions: z.array(knorviaPendingPermissionSchema),
    activeToolCalls: z.array(knorviaActiveToolCallSchema),
    backgroundJobs: z.array(jsonObjectSchema),
    target: sessionGoalSchema.nullable().optional(),
    lastError: z
      .object({
        type: nonEmptyString,
        code: nonEmptyString.optional(),
        message: nonEmptyString,
        detail: z.string().optional(),
        attribution: errorAttributionSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type KnorviaSessionProjection = z.infer<typeof sessionProjectionSchema>;
export type KnorviaToolState = z.infer<typeof knorviaToolStateSchema>;
export const knorviaSlashCommandSchema = z
  .object({
    name: nonEmptyString,
    description: z.string(),
    inputHint: z.string().optional(),
    source: z.enum(["builtin", "custom"]).optional(),
  })
  .strict();
export type KnorviaSessionApiRetryStatus = z.infer<typeof sessionApiRetryStatusSchema>;
export type KnorviaSessionContextUsage = z.infer<typeof sessionContextUsageSchema>;
export const knorviaModelStreamingKindSchema = z.enum([
  "start",
  "finish",
  "error",
  "text_start",
  "text_delta",
  "text_end",
  "reasoning_start",
  "reasoning_delta",
  "reasoning_end",
  "tool_input_start",
  "tool_input_delta",
  "tool_input_end",
  "tool_call",
]);
export const knorviaModelStreamingEventPayloadSchema = z
  .object({
    assistantMessageId: z.string().optional(),
    delta: z.string().optional(),
    done: z.boolean().optional(),
    input: z.unknown().optional(),
    kind: knorviaModelStreamingKindSchema,
    partId: z.string().optional(),
    providerExecuted: z.boolean().optional(),
    toolCallId: z.string().optional(),
    toolName: z.string().optional(),
  })
  .strict();
export const sessionStateSnapshotSchema = z
  .object({
    protocol: z
      .object({
        name: z.literal(KNORVIA_PROTOCOL_NAME),
        version: z.literal(KNORVIA_PROTOCOL_VERSION),
      })
      .strict(),
    session: sessionInfoSchema,
    settings: sessionSettingsStateSchema,
    projection: sessionProjectionSchema,
    runtime: sessionRuntimeStateSchema,
    messages: z.array(knorviaMessageWithPartsSchema),
    goalStats: sessionGoalStatsSchema.optional(),
    todos: z.array(sessionTodoItemSchema).optional(),
    todoGroups: z.array(sessionTodoGroupSchema).optional(),
    slashCommands: z.array(knorviaSlashCommandSchema).optional(),
  })
  .strict();
export type KnorviaSessionStateSnapshot = z.infer<typeof sessionStateSnapshotSchema>;

export const knorviaEventEnvelopeSchema = z
  .object({
    eventId: nonEmptyString,
    sessionId: nonEmptyString,
    turnId: nonEmptyString.optional(),
    seq: z.number().int().nonnegative(),
    traceId: nonEmptyString.optional(),
    timestamp: timestampMsSchema,
    deliveryKind: knorviaDeliveryKindSchema.optional(),
  })
  .strict();

const knorviaComputerUseOperationEventBaseSchema = z
  .object({
    eventId: nonEmptyString,
    sequenceNumber: z.number().int().nonnegative(),
    sessionId: nonEmptyString,
    timestamp: timestampMsSchema,
  })
  .strict();

const knorviaComputerUseTurnStartedEventSchema = knorviaComputerUseOperationEventBaseSchema.extend({
  kind: z.literal("turn-started"),
  turnId: nonEmptyString,
});
const knorviaComputerUseTurnCompletedEventSchema = knorviaComputerUseOperationEventBaseSchema.extend({
  kind: z.literal("turn-completed"),
  turnId: nonEmptyString,
});
const knorviaComputerUseTurnFailedEventSchema = knorviaComputerUseOperationEventBaseSchema.extend({
  kind: z.literal("turn-failed"),
  turnId: nonEmptyString,
});
const knorviaComputerUseToolScheduledEventSchema = knorviaComputerUseOperationEventBaseSchema.extend({
  kind: z.literal("tool-scheduled"),
  turnId: nonEmptyString,
  toolCallId: nonEmptyString,
  toolName: nonEmptyString,
  // 这个 cell 是否在用 Computer Use。只表达布尔事实，不再携带动作名——旧的
  // operationAction 靠从模型源码里抽取动作名得到，SDK 面一变就整体失配（见
  // bootstrap/src/protocol/computer-use-operation-event.ts 的 usesComputerUse）。
  // 只挂在 scheduled 上：ToolCallStartedPayload 没有 input，start 时已拿不到模型源码。
  computerUse: z.literal(true).optional(),
});
const knorviaComputerUseToolStartedEventSchema = knorviaComputerUseOperationEventBaseSchema.extend({
  kind: z.literal("tool-started"),
  turnId: nonEmptyString.optional(),
  toolCallId: nonEmptyString,
  toolName: nonEmptyString.optional(),
});
const knorviaComputerUseSessionClosedEventSchema = knorviaComputerUseOperationEventBaseSchema.extend({
  kind: z.literal("session-closed"),
});

export const knorviaComputerUseOperationEventSchema = z.discriminatedUnion("kind", [
  knorviaComputerUseTurnStartedEventSchema,
  knorviaComputerUseTurnCompletedEventSchema,
  knorviaComputerUseTurnFailedEventSchema,
  knorviaComputerUseToolScheduledEventSchema,
  knorviaComputerUseToolStartedEventSchema,
  knorviaComputerUseSessionClosedEventSchema,
]);
export type KnorviaComputerUseOperationEvent = z.infer<typeof knorviaComputerUseOperationEventSchema>;

export const sessionEventTypeSchema = z.enum([
  "session.created",
  "session.resumed",
  "session.updated",
  "session.titleUpdated",
  "session.closed",
  "turn.started",
  "turn.steerQueued",
  "turn.steerDrained",
  "turn.completed",
  "turn.failed",
  "message.upserted",
  "message.removed",
  "part.started",
  "part.delta",
  "part.upserted",
  "part.removed",
  "model.streaming",
  "tool.updated",
  "permission.requested",
  "permission.resolved",
  "userInput.requested",
  "userInput.resolved",
  "checkpoint.created",
  "rewind.triggered",
  "streamRecovery.updated",
]);
export type KnorviaSessionEventType = z.infer<typeof sessionEventTypeSchema>;

export const knorviaProtocolErrorDetailSchema = z
  .object({
    type: nonEmptyString,
    message: nonEmptyString,
    stack: z.string().optional(),
    code: z.string().optional(),
    detail: z.string().optional(),
    underlyingErrorMessage: z.string().optional(),
    underlyingErrorDetail: z.string().optional(),
    attribution: errorAttributionSchema.optional(),
    retryable: z.boolean().optional(),
    data: z.unknown().optional(),
  })
  .strict();
export const sessionCreatedEventPayloadSchema = z
  .object({
    mode: sessionModeSchema,
    contextWindow: z.number().int().nonnegative(),
  })
  .strict();
export const sessionResumedEventPayloadSchema = z
  .object({
    directory: nonEmptyString,
    interruptedToolCount: z.number().int().nonnegative(),
    messageCount: z.number().int().nonnegative(),
    partCount: z.number().int().nonnegative(),
    recoveredCompactTimelineCount: z.number().int().nonnegative().optional(),
    recoveredSteerInputCount: z.number().int().nonnegative().optional(),
    resumedTodoCount: z.number().int().nonnegative().optional(),
  })
  .strict();
export const sessionTitleUpdatedEventPayloadSchema = z
  .object({
    messageID: nonEmptyString.optional(),
    previousTitle: z.string(),
    source: z.enum(["default", "first_input", "generated", "custom"]),
    title: z.string(),
  })
  .strict();
export const knorviaTurnStartedEventPayloadSchema = z
  .object({
    turnNumber: z.number().int().nonnegative(),
    input: z.string(),
    inputId: nonEmptyString.optional(),
    queryId: nonEmptyString.optional(),
    inputSource: knorviaTurnInputSourceSchema.optional(),
    inputVisibility: knorviaMessageVisibilitySchema.optional(),
    executionKind: z.enum(["agent", "controlOnly"]).optional(),
    targetId: nonEmptyString.optional(),
    messageId: nonEmptyString.optional(),
    foregroundExecutionId: nonEmptyString.optional(),
    intent: jsonObjectSchema.optional(),
    originMeta: jsonObjectSchema.optional(),
    // runtime 会透传后台唤醒来源，strict schema 必须同步声明以免丢弃整条事件。
    backgroundSource: z.enum(["bash", "subagent"]).optional(),
    attachments: z.array(jsonObjectSchema).optional(),
  })
  .strict();
const knorviaTurnSteerSourceSchema = z.enum(["plan_approval_feedback", "workflow_refine_feedback"]);
const knorviaTurnSteerCommandKindSchema = z.enum(["sendText", "sendGoalCommand", "compact"]);
const knorviaTurnSteerDeliverySchema = z.enum(["queue", "guide"]);

export const knorviaTurnSteerQueuedEventPayloadSchema = z
  .object({
    pendingInputId: nonEmptyString,
    inputId: nonEmptyString.optional(),
    queryId: nonEmptyString.optional(),
    input: z.string(),
    inputPreview: z.string(),
    inputSize: z.number().int().nonnegative(),
    commandKind: knorviaTurnSteerCommandKindSchema.optional(),
    source: knorviaTurnSteerSourceSchema.optional(),
    toolDisallowlist: z.array(nonEmptyString).optional(),
    delivery: knorviaTurnSteerDeliverySchema.optional(),
    targetTurnId: nonEmptyString,
    queueLength: z.number().int().nonnegative(),
    intent: jsonObjectSchema.optional(),
  })
  .strict();
export const knorviaTurnSteerDrainedEventPayloadSchema = z
  .object({
    pendingInputIds: z.array(nonEmptyString),
    queryIds: z.array(nonEmptyString).optional(),
    targetTurnId: nonEmptyString,
    injectedMessageIds: z.array(nonEmptyString),
    drainedInputs: z
      .array(
        z
          .object({
            pendingInputId: nonEmptyString,
            messageId: nonEmptyString,
            text: z.string(),
            delivery: knorviaTurnSteerDeliverySchema.optional(),
            intent: jsonObjectSchema.optional(),
            toolDisallowlist: z.array(nonEmptyString).optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
export const knorviaTurnCompletedEventPayloadSchema = z
  .object({
    response: z.string(),
    tokenCount: z.number().int().nonnegative(),
    usage: z.unknown().optional(),
    toolCallCount: z.number().int().nonnegative(),
    historyRoundCount: z.number().int().nonnegative().optional(),
    duration: z.number().nonnegative(),
    // runtime turn.completed 会附带 cacheStats，协议 schema 之前漏掉该字段。
    // strict 校验失败会让桌面端丢掉终态事件，表现为消息已完成但 UI 一直没有回复。
    cacheStats: z
      .object({
        totalMessages: z.number().int().nonnegative(),
        cachedMessages: z.number().int().nonnegative(),
        lastCacheHit: z.boolean(),
        cacheReadTokens: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
    inputId: nonEmptyString.optional(),
    resultType: z.enum([
      "success",
      // "cancelled": 用户主动中断属于正常结束，复用 turn.completed 上报，避免被映射成 turn.failed。
      "cancelled",
      "error_max_turns",
      "error_max_budget",
      "error_during_execution",
      "error_max_tool_calls",
    ]),
    backgroundSubagentResultConsumed: z.boolean().optional(),
  })
  .strict();
export const knorviaTurnFailedEventPayloadSchema = z
  .object({
    error: knorviaProtocolErrorDetailSchema,
    turnPhase: z.string(),
    inputId: nonEmptyString.optional(),
    backgroundSubagentResultConsumed: z.boolean().optional(),
  })
  .strict();
export const knorviaMessageUpsertedEventPayloadSchema = z
  .object({
    content: z.string(),
    attachments: z.array(z.unknown()).optional(),
    toolCalls: z.array(z.unknown()).optional(),
    type: z.string().optional(),
    compactBoundary: z.unknown().optional(),
  })
  .strict();
export const knorviaMessageRemovedEventPayloadSchema = z
  .object({
    messageId: nonEmptyString,
    reason: z.string().optional(),
  })
  .strict();
export const knorviaMessagePartDeltaEventPayloadSchema = z
  .object({
    messageId: nonEmptyString,
    partId: nonEmptyString,
    field: z.enum(["text", "reasoning", "input", "output"]).optional(),
    delta: z.string(),
  })
  .strict();
export const knorviaMessagePartUpsertedEventPayloadSchema = z
  .object({
    part: knorviaMessagePartSchema,
  })
  .strict();
export const knorviaMessagePartRemovedEventPayloadSchema = z
  .object({
    messageId: nonEmptyString,
    partId: nonEmptyString,
    reason: z.string().optional(),
  })
  .strict();
const knorviaToolCallBasePayloadSchema = z
  .object({
    toolCallId: nonEmptyString,
    toolName: z.string().optional(),
    parentToolCallId: nonEmptyString.optional(),
    source: z.enum(["subagent"]).optional(),
    agentId: nonEmptyString.optional(),
    agentType: nonEmptyString.optional(),
    // subagent mirror 会携带后台归因；strict schema 漏字段会让 session/event 整条被丢弃。
    background: z.boolean().optional(),
    childSessionId: nonEmptyString.optional(),
    childToolCallId: nonEmptyString.optional(),
    description: z.string().optional(),
  })
  .strict();

export const knorviaToolUpdatedEventPayloadSchema = z.discriminatedUnion("kind", [
  knorviaToolCallBasePayloadSchema
    .extend({
      kind: z.literal("scheduled"),
      // 修复：CLI 调度事件已携带所属消息 ID；漏声明会让严格校验丢弃整条事件。
      assistantMessageId: nonEmptyString.optional(),
      toolName: nonEmptyString,
      input: z.unknown().optional(),
      inputByteLength: z.number().int().nonnegative().optional(),
      inputOmitted: z.boolean().optional(),
      inputRef: z.literal("model_stream").optional(),
      dependencies: z.array(nonEmptyString).optional(),
      parallelGroupIndex: z.number().int().nonnegative().optional(),
      canRunParallel: z.boolean().optional(),
      schedule: jsonObjectSchema.optional(),
    })
    .strict(),
  knorviaToolCallBasePayloadSchema
    .extend({
      kind: z.literal("started"),
      startedAt: protocolInstantSchema,
    })
    .strict(),
  knorviaToolCallBasePayloadSchema
    .extend({
      kind: z.literal("progress"),
      elapsedMs: z.number().nonnegative().optional(),
      pid: z.number().int().optional(),
      stdoutBytes: z.number().int().nonnegative().optional(),
      stderrBytes: z.number().int().nonnegative().optional(),
      outputBytes: z.number().int().nonnegative().optional(),
      outputPreview: executionOutputPreviewSchema.optional(),
      stdoutTail: z.string().optional(),
      stderrTail: z.string().optional(),
    })
    .strict(),
  knorviaToolCallBasePayloadSchema
    .extend({
      kind: z.literal("result"),
      result: knorviaToolResultObjectSchema,
      duration: z.number().nonnegative(),
    })
    .strict(),
  knorviaToolCallBasePayloadSchema
    .extend({
      kind: z.literal("error"),
      error: knorviaProtocolErrorDetailSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("batch"),
      toolCallIds: z.array(nonEmptyString),
      successCount: z.number().int().nonnegative(),
      errorCount: z.number().int().nonnegative(),
    })
    .strict(),
  knorviaToolCallBasePayloadSchema
    .extend({
      kind: z.literal("raw"),
      payload: jsonObjectSchema,
    })
    .strict(),
]);
export const knorviaPermissionRequestedEventPayloadSchema = z
  .object({
    requestId: nonEmptyString.optional(),
    toolCallId: nonEmptyString,
    toolName: nonEmptyString,
    riskLevel: z.enum(["low", "medium", "high", "critical"]),
    reason: z.string(),
    input: z.unknown(),
    suggestedPermissionUpdates: z.array(knorviaPermissionUpdateSchema).optional(),
    origin: knorviaInteractionRequestOriginSchema.optional(),
    options: z.array(knorviaPermissionOptionSchema).min(1),
    childSessionId: nonEmptyString.optional(),
    background: z.boolean().optional(),
  })
  .strict();
export const knorviaPermissionResolvedEventPayloadSchema = z
  .object({
    requestId: nonEmptyString.optional(),
    toolCallId: nonEmptyString,
    toolName: nonEmptyString.optional(),
    decision: knorviaPermissionDecisionSchema.optional(),
    reason: z.string().optional(),
    modifiedInput: z.unknown().optional(),
    inputSummary: z.unknown().optional(),
    childSessionId: nonEmptyString.optional(),
    background: z.boolean().optional(),
  })
  .strict();
export const knorviaUserInputRequestedEventPayloadSchema = z
  .object({
    requestId: nonEmptyString,
    prompt: z.string(),
    inputType: z.enum(["text", "choice", "confirm"]).optional(),
    choices: z.array(z.string()).optional(),
  })
  .strict();
export const knorviaUserInputResolvedEventPayloadSchema = z
  .object({
    requestId: nonEmptyString,
    value: z.unknown().optional(),
    cancelled: z.boolean().optional(),
  })
  .strict();
export const sessionClosedEventPayloadSchema = z
  .object({
    reason: z.string().optional(),
  })
  .strict();

function sessionEventEnvelopeFor<T extends KnorviaSessionEventType>(
  type: T,
  payload: z.ZodTypeAny,
) {
  return knorviaEventEnvelopeSchema.extend({
    type: z.literal(type),
    payload: payload.optional(),
  });
}

export const sessionEventSchema = z.discriminatedUnion("type", [
  sessionEventEnvelopeFor("session.created", sessionCreatedEventPayloadSchema),
  sessionEventEnvelopeFor("session.resumed", sessionResumedEventPayloadSchema),
  sessionEventEnvelopeFor("session.updated", jsonObjectSchema),
  sessionEventEnvelopeFor("session.titleUpdated", sessionTitleUpdatedEventPayloadSchema),
  sessionEventEnvelopeFor("session.closed", sessionClosedEventPayloadSchema),
  sessionEventEnvelopeFor("turn.started", knorviaTurnStartedEventPayloadSchema),
  sessionEventEnvelopeFor("turn.steerQueued", knorviaTurnSteerQueuedEventPayloadSchema),
  sessionEventEnvelopeFor("turn.steerDrained", knorviaTurnSteerDrainedEventPayloadSchema),
  sessionEventEnvelopeFor("turn.completed", knorviaTurnCompletedEventPayloadSchema),
  sessionEventEnvelopeFor("turn.failed", knorviaTurnFailedEventPayloadSchema),
  sessionEventEnvelopeFor("message.upserted", knorviaMessageUpsertedEventPayloadSchema),
  sessionEventEnvelopeFor("message.removed", knorviaMessageRemovedEventPayloadSchema),
  sessionEventEnvelopeFor("part.started", knorviaMessagePartUpsertedEventPayloadSchema),
  sessionEventEnvelopeFor("part.delta", knorviaMessagePartDeltaEventPayloadSchema),
  sessionEventEnvelopeFor("part.upserted", knorviaMessagePartUpsertedEventPayloadSchema),
  sessionEventEnvelopeFor("part.removed", knorviaMessagePartRemovedEventPayloadSchema),
  sessionEventEnvelopeFor("model.streaming", knorviaModelStreamingEventPayloadSchema),
  sessionEventEnvelopeFor("tool.updated", knorviaToolUpdatedEventPayloadSchema),
  sessionEventEnvelopeFor("permission.requested", knorviaPermissionRequestedEventPayloadSchema),
  sessionEventEnvelopeFor("permission.resolved", knorviaPermissionResolvedEventPayloadSchema),
  sessionEventEnvelopeFor("userInput.requested", knorviaUserInputRequestedEventPayloadSchema),
  sessionEventEnvelopeFor("userInput.resolved", knorviaUserInputResolvedEventPayloadSchema),
  sessionEventEnvelopeFor("checkpoint.created", jsonObjectSchema),
  sessionEventEnvelopeFor("rewind.triggered", jsonObjectSchema),
  sessionEventEnvelopeFor("streamRecovery.updated", jsonObjectSchema),
]);
export type KnorviaSessionEvent = z.infer<typeof sessionEventSchema>;

export const sessionEventsResultSchema = z
  .object({
    events: z.array(sessionEventSchema),
  })
  .strict();
export const sessionMessagesResultSchema = z
  .object({
    messages: z.array(knorviaMessageWithPartsSchema),
  })
  .strict();
export const knorviaStateUpdatedNotificationSchema = z
  .object({
    type: z.literal("state.updated"),
    scope: z.enum(["server", "workspace", "session"]),
    workspace: knorviaWorkspaceRefSchema.optional(),
    sessionId: nonEmptyString.optional(),
    revision: z.number().int().nonnegative(),
    reason: z.string().optional(),
    patch: z.unknown(),
  })
  .strict();
export type KnorviaStateUpdatedNotification = z.infer<typeof knorviaStateUpdatedNotificationSchema>;

export const sessionSubscribeParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    deliveryKind: knorviaDeliveryKindSchema,
    afterSeq: z.number().int().nonnegative().optional(),
    includeSnapshot: z.boolean().default(false),
  })
  .strict();
export type KnorviaSessionSubscribeParams = z.infer<typeof sessionSubscribeParamsSchema>;

export const sessionSubscribeResultSchema = z
  .object({
    sessionId: nonEmptyString,
    eventSeq: z.number().int().nonnegative(),
    events: z.array(sessionEventSchema),
    snapshot: sessionStateSnapshotSchema.optional(),
  })
  .strict();
export const sessionListResultSchema = z
  .object({
    sessions: z.array(sessionInfoSchema),
  })
  .strict();

const sessionSubagentBaseSchema = z
  .object({
    childSessionId: nonEmptyString,
    agentId: nonEmptyString.optional(),
    toolCallId: nonEmptyString.optional(),
    subagentType: nonEmptyString,
    title: nonEmptyString,
    summary: z.string().optional(),
    startedAt: z.number().int().nonnegative().optional(),
    endedAt: z.number().int().nonnegative().optional(),
  })
  .strict();

export const sessionRunningSubagentSchema = sessionSubagentBaseSchema.extend({
  status: z.enum(["running", "waiting", "blocked"]),
});
export type KnorviaSessionRunningSubagent = z.infer<typeof sessionRunningSubagentSchema>;

export const sessionEndedSubagentSchema = sessionSubagentBaseSchema.extend({
  status: z.enum(["success", "failed", "cancelled", "lost"]),
});
export type KnorviaSessionEndedSubagent = z.infer<typeof sessionEndedSubagentSchema>;

export const sessionSubagentsResultSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    childSessionIds: z.array(nonEmptyString),
    running: z.array(sessionRunningSubagentSchema),
    ended: z
      .object({
        total: z.number().int().nonnegative(),
        items: z.array(sessionEndedSubagentSchema),
        nextCursor: nonEmptyString.optional(),
      })
      .strict(),
  })
  .strict();
export type KnorviaSessionSubagentsResult = z.infer<typeof sessionSubagentsResultSchema>;
export const sessionCreateParamsSchema = z
  .object({
    sessionId: nonEmptyString.optional(),
    workspace: knorviaWorkspaceRefSchema,
    parentSessionId: nonEmptyString.optional(),
    mode: sessionModeSchema.optional(),
    model: modelSelectionSchema.optional(),
    persistence: sessionPersistenceSchema.optional(),
    thoughtLevel: nonEmptyString.optional(),
    titleGenerationEnabled: z.boolean().optional(),
    mcpServers: z.array(knorviaProtocolMcpServerSchema).optional(),
    toolAllowlist: z.array(nonEmptyString).optional(),
    toolDenylist: z.array(nonEmptyString).optional(),
    importedHistory: sessionImportHistorySchema.optional(),
    // host 只按本地服务装配/远程/端形态决定是否注册工具，不读取灰度；
    // 缺省不下发 = 不注册；灰度与套餐准入在实际创建的 Host handler 校验。
    offPeakToolEnabled: z.boolean().optional(),
    // 动态工作流灰度：与 offPeakToolEnabled 同一
    // 模式——host 裁决后下发，缺省不下发 = 不注册工作流工具簇（fail-closed）。
    dynamicWorkflowEnabled: z.boolean().optional(),
  })
  .strict();
export type KnorviaSessionCreateParams = z.infer<typeof sessionCreateParamsSchema>;

export const sessionResumeParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    workspace: knorviaWorkspaceRefSchema.optional(),
    // 旧 session 尚无 runtime/model_selection entry 时，由同 task 的索引元数据提供迁移 hint。
    thoughtLevel: nonEmptyString.optional(),
    mcpServers: z.array(knorviaProtocolMcpServerSchema).optional(),
    // 冷恢复重建 runtime 时必须沿用 create 的工具面约束（否则会绕过 allow/deny，尤其 CUA 会话）。
    toolAllowlist: z.array(nonEmptyString).optional(),
    toolDenylist: z.array(nonEmptyString).optional(),
    // 与 create 同语义；resume 不带会导致冷恢复丢 Off-Peak 工具面。
    offPeakToolEnabled: z.boolean().optional(),
    // 与 create 同语义；resume 不带会导致冷恢复丢工作流工具簇。
    dynamicWorkflowEnabled: z.boolean().optional(),
  })
  .strict();
export type KnorviaSessionResumeParams = z.infer<typeof sessionResumeParamsSchema>;

export const sessionListParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema.optional(),
    // 显式身份查询包含隐藏会话；普通列表仍只返回主任务，避免索引修复激活 runtime。
    sessionIds: z.array(nonEmptyString).min(1).max(64).optional(),
    includeArchived: z.boolean().default(false),
    limit: z.number().int().positive().optional(),
  })
  .strict();
export type KnorviaSessionListParams = z.infer<typeof sessionListParamsSchema>;

export const sessionSubagentsParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    endedCursor: nonEmptyString.optional(),
    endedLimit: z.number().int().positive().max(100).default(20),
  })
  .strict();
export type KnorviaSessionSubagentsParams = z.infer<typeof sessionSubagentsParamsSchema>;

export const knorviaUsageStatsParamsSchema = z
  .object({
    range: z.enum(APP_USAGE_RANGES),
    timeZone: z.string().optional(),
  })
  .strict();
export const knorviaUsageStatsResultSchema = appUsageSnapshotSchema;
export const knorviaTaskTokenUsageParamsSchema = z
  .object({
    sessionId: nonEmptyString,
  })
  .strict();
export const knorviaTaskTokenUsageResultSchema = z
  .object({
    sessionId: nonEmptyString,
    totalTokens: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative(),
    cacheCreationTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative(),
    modelRequestCount: z.number().int().nonnegative(),
    modelErrorCount: z.number().int().nonnegative(),
    inputBaselineBySource: z.record(z.string(), z.number().int().nonnegative()),
  })
  .strict();
export type KnorviaTaskTokenUsageResult = z.infer<typeof knorviaTaskTokenUsageResultSchema>;

export const sessionReadParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    deliveryKind: knorviaDeliveryKindSchema.optional(),
    messageLimit: z.number().int().positive().optional(),
    afterSeq: z.number().int().nonnegative().optional(),
  })
  .strict();
export type KnorviaSessionReadParams = z.infer<typeof sessionReadParamsSchema>;

export const sessionMessagesParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    afterMessageId: nonEmptyString.optional(),
    limit: z.number().int().positive().optional(),
  })
  .strict();
export type KnorviaSessionMessagesParams = z.infer<typeof sessionMessagesParamsSchema>;

export const sessionEventsParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    afterSeq: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().optional(),
  })
  .strict();
export type KnorviaSessionEventsParams = z.infer<typeof sessionEventsParamsSchema>;

export const sessionRuntimePreferencesScopeSchema = z.enum([
  "runtime-materialization",
  "user-execution",
]);
export type KnorviaSessionRuntimePreferencesScope = z.infer<
  typeof sessionRuntimePreferencesScopeSchema
>;

export const KNORVIA_SESSION_RUNTIME_PREFERENCES_REQUEST_TIMEOUT_MS = 15_000;

export const sessionRequestRuntimePreferencesParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    scope: sessionRuntimePreferencesScopeSchema,
  })
  .strict();
export type KnorviaSessionRequestRuntimePreferencesParams = z.infer<
  typeof sessionRequestRuntimePreferencesParamsSchema
>;

export const DEFAULT_KNORVIA_MODEL_CONTEXT_BUDGET_STRATEGY = "preflight-v1" as const;

// 3.12.2：legacy 仅为旧协议接收兼容；Runtime 一律归一为上面的共享默认策略。
export const knorviaModelContextBudgetStrategySchema = z.enum(["legacy", "preflight-v1"]);
export type KnorviaModelContextBudgetStrategy = z.infer<typeof knorviaModelContextBudgetStrategySchema>;

export const sessionRuntimePreferencesResultSchema = z
  .object({
    nativeSearchEnhancementsEnabled: z.boolean(),
    memoryEnabled: z.boolean().default(false),
    askUserQuestionAutoResolutionEnabled: z.boolean().default(true),
    integratedTerminalShell: integratedTerminalShellSelectionSchema.optional(),
    // 兼容旧 Host：缺少字段时在协议解析边界使用当前默认策略。
    modelContextBudgetStrategy: knorviaModelContextBudgetStrategySchema.default(
      DEFAULT_KNORVIA_MODEL_CONTEXT_BUDGET_STRATEGY,
    ),
  })
  .strict();
export type KnorviaSessionRuntimePreferencesResult = z.infer<
  typeof sessionRuntimePreferencesResultSchema
>;

/**
 * App 在提交 prompt 前只读采集的 IAB 可见状态。该字段只用于 provider-visible
 * ambient context，不进入用户可见 transcript；内容有界，禁止携带页面正文或凭据。
 */
export const knorviaBrowserAmbientContextSchema = z
  .object({
    tabCount: z.number().int().positive().max(100),
    currentUrl: z.string().trim().min(1).max(4096).optional(),
  })
  .strict();
export type KnorviaBrowserAmbientContext = z.infer<typeof knorviaBrowserAmbientContextSchema>;

export const sessionSendParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    modelSelection: modelSelectionSchema.optional(),
    modelExecution: modelExecutionSchema.optional(),
    inputId: nonEmptyString.optional(),
    queryId: nonEmptyString.optional(),
    content: z.string(),
    attachments: z.array(jsonObjectSchema).optional(),
    browserAmbientContext: knorviaBrowserAmbientContextSchema.optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
    expectedProviderRevision: nonEmptyString.optional(),
    automationId: nonEmptyString.optional(),
    offPeakTaskId: nonEmptyString.optional(),
    offPeakRunType: z.enum(["init", "resume"]).optional(),
    toolDenylist: z.array(nonEmptyString).optional(),
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.automationId && payload.offPeakTaskId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "automationId and offPeakTaskId are mutually exclusive",
      });
    }
    if (payload.offPeakRunType && !payload.offPeakTaskId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "offPeakRunType requires offPeakTaskId",
        path: ["offPeakRunType"],
      });
    }
    if (payload.modelExecution && !payload.modelSelection) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "modelExecution requires modelSelection",
        path: ["modelExecution"],
      });
    }
  });
export const sessionSendResultSchema = z
  .object({
    sessionId: nonEmptyString,
    accepted: z.literal(true),
    stateRevision: z.number().int().nonnegative(),
  })
  .strict();
export type KnorviaSessionSendResult = z.infer<typeof sessionSendResultSchema>;

export const sessionHistoryTargetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("turn"),
      turnIndex: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("message"),
      messageId: nonEmptyString,
    })
    .strict(),
  z
    .object({
      kind: z.literal("checkpoint"),
      checkpointId: nonEmptyString,
    })
    .strict(),
  z
    .object({
      kind: z.literal("latestCheckpoint"),
    })
    .strict(),
]);
export type KnorviaSessionHistoryTarget = z.infer<typeof sessionHistoryTargetSchema>;

export const sessionForkParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    target: sessionHistoryTargetSchema.default({
      kind: "latestCheckpoint",
    }),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type KnorviaSessionForkParams = z.infer<typeof sessionForkParamsSchema>;

export const sessionForkResultSchema = z
  .object({
    forkedSessionId: nonEmptyString,
    parentSessionId: nonEmptyString.optional(),
    targetMessageId: nonEmptyString.optional(),
    targetCheckpointId: nonEmptyString.optional(),
    response: z.string(),
    snapshot: sessionStateSnapshotSchema,
  })
  .strict();
export type KnorviaSessionForkResult = z.infer<typeof sessionForkResultSchema>;

export const sessionCompactParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    inputId: nonEmptyString.optional(),
    instructions: z.string().optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type KnorviaSessionCompactParams = z.infer<typeof sessionCompactParamsSchema>;

export const sessionCompactResultSchema = z
  .object({
    response: z.string(),
    snapshot: sessionStateSnapshotSchema,
    compact: z
      .object({
        state: z.enum(["accepted", "already_running"]),
        inputId: nonEmptyString.optional(),
        operationId: nonEmptyString.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type KnorviaSessionCompactResult = z.infer<typeof sessionCompactResultSchema>;

export const sessionGoalActionSchema = z.enum([
  "show",
  "set",
  "replace",
  "pause",
  "resume",
  "clear",
]);
export type KnorviaSessionGoalAction = z.infer<typeof sessionGoalActionSchema>;

export const sessionGoalParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    inputId: nonEmptyString.optional(),
    action: sessionGoalActionSchema,
    objective: z.string().optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type KnorviaSessionGoalParams = z.infer<typeof sessionGoalParamsSchema>;

export const sessionGoalResultSchema = z
  .object({
    response: z.string(),
    snapshot: sessionStateSnapshotSchema,
    startedTurn: z.boolean().optional(),
  })
  .strict();
export type KnorviaSessionGoalResult = z.infer<typeof sessionGoalResultSchema>;

export const sessionStopParamsSchema = z
  .object({
    sessionId: nonEmptyString,
  })
  .strict();
const knorviaBackgroundTaskInfoStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
  "timed_out",
  "cancelled",
  "spawn_error",
  "lost",
]);

export const knorviaBackgroundTaskInfoSchema = z
  .object({
    taskId: nonEmptyString,
    toolCallId: nonEmptyString.optional(),
    toolName: nonEmptyString.optional(),
    taskKind: z.enum(["bash", "subagent"]).optional(),
    blocked: z.boolean().optional(),
    blockedReason: z.string().optional(),
    cancellable: z.boolean().optional(),
    cancelRequestedAt: protocolInstantSchema.optional(),
    command: z.string().optional(),
    description: z.string().optional(),
    status: knorviaBackgroundTaskInfoStatusSchema,
    pid: z.number().int().positive().optional(),
    startedAt: protocolInstantSchema.optional(),
    completedAt: protocolInstantSchema.optional(),
    outputPath: z.string().optional(),
    stderrPersistedOutputPath: z.string().optional(),
    stdoutPersistedOutputPath: z.string().optional(),
    outputBytes: z.number().int().nonnegative().optional(),
    outputTruncated: z.boolean().optional(),
    outputTail: z.string().optional(),
    stderrBytes: z.number().int().nonnegative().optional(),
    stderrTail: z.string().optional(),
    stdoutBytes: z.number().int().nonnegative().optional(),
    stdoutTail: z.string().optional(),
    terminalId: nonEmptyString.optional(),
  })
  .strict();
export const sessionCancelBackgroundTaskParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    taskId: nonEmptyString,
  })
  .strict();
export type KnorviaSessionCancelBackgroundTaskParams = z.infer<
  typeof sessionCancelBackgroundTaskParamsSchema
>;

export const sessionCancelBackgroundTaskResultSchema = z
  .object({
    cancelled: z.boolean(),
    reason: z.string().optional(),
    snapshot: knorviaBackgroundTaskInfoSchema.optional(),
    status: knorviaBackgroundTaskInfoStatusSchema,
    taskId: nonEmptyString,
  })
  .strict();
export type KnorviaSessionCancelBackgroundTaskResult = z.infer<
  typeof sessionCancelBackgroundTaskResultSchema
>;

export const sessionSetModelParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    model: modelSelectionSchema,
    expectedRevision: z.number().int().nonnegative().optional(),
    persistAsWorkspaceLastUsed: z.boolean().default(true),
  })
  .strict();
export type KnorviaSessionSetModelParams = z.infer<typeof sessionSetModelParamsSchema>;

export const sessionSetThoughtLevelParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    thoughtLevel: nonEmptyString.optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
    persistAsWorkspaceLastUsed: z.boolean().default(true),
  })
  .strict();
export type KnorviaSessionSetThoughtLevelParams = z.infer<
  typeof sessionSetThoughtLevelParamsSchema
>;

export const sessionSetModeParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    mode: sessionModeSchema,
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type KnorviaSessionSetModeParams = z.infer<typeof sessionSetModeParamsSchema>;

export const sessionCloseParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    expectedPersistence: sessionPersistenceSchema.optional(),
  })
  .strict();
export type KnorviaSessionCloseParams = z.infer<typeof sessionCloseParamsSchema>;
export const sessionCloseResultSchema = z
  .object({
    closed: z.boolean().optional(),
  })
  .strict();
export type KnorviaSessionCloseResult = z.infer<typeof sessionCloseResultSchema>;
export const knorviaWorkspaceReadPresentationParamsSchema = z
  .object({ workspace: knorviaWorkspaceRefSchema })
  .strict();
export const knorviaWorkspacePresentationSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    mode: sessionModeSchema,
    slashCommands: z.array(knorviaSlashCommandSchema),
  })
  .strict();
export type KnorviaWorkspacePresentation = z.infer<typeof knorviaWorkspacePresentationSchema>;
const workspaceHookSha256DigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const knorviaWorkspaceHookTrustGrantParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    bundleDigest: workspaceHookSha256DigestSchema,
    hookDeclarationDigest: workspaceHookSha256DigestSchema,
  })
  .strict();
export type KnorviaWorkspaceHookTrustGrantParams = z.infer<
  typeof knorviaWorkspaceHookTrustGrantParamsSchema
>;
export const knorviaWorkspaceHookTrustGrantReasonCodeSchema = z.enum([
  "workspace_hooks_blocked_by_policy",
  "workspace_hooks_bundle_changed",
  "workspace_hooks_snapshot_mismatch",
  "workspace_hooks_policy_requires_pretrust",
  "workspace_hooks_trust_store_corrupt",
  "workspace_hooks_config_unreadable",
]);
export type KnorviaWorkspaceHookTrustGrantReasonCode = z.infer<
  typeof knorviaWorkspaceHookTrustGrantReasonCodeSchema
>;
export const knorviaWorkspaceHookTrustGrantResultSchema = z
  .object({
    accepted: z.boolean(),
    reasonCode: knorviaWorkspaceHookTrustGrantReasonCodeSchema.optional(),
  })
  .strict();
export type KnorviaWorkspaceHookTrustGrantResult = z.infer<
  typeof knorviaWorkspaceHookTrustGrantResultSchema
>;
const knorviaWorkspaceModelToolCallSchema = z
  .object({
    id: nonEmptyString,
    name: nonEmptyString,
    input: z.unknown(),
  })
  .strict();
const knorviaWorkspaceModelMessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("system"), content: z.string() }).strict(),
  z.object({ role: z.literal("user"), content: z.string() }).strict(),
  z
    .object({
      role: z.literal("assistant"),
      content: z.string(),
      toolCalls: z.array(knorviaWorkspaceModelToolCallSchema).optional(),
    })
    .strict(),
  z
    .object({
      role: z.literal("tool"),
      content: z.string(),
      toolCallId: nonEmptyString,
      toolName: nonEmptyString,
      isError: z.boolean().optional(),
    })
    .strict(),
]);
const knorviaWorkspaceModelToolSchema = z
  .object({
    name: nonEmptyString,
    description: z.string().optional(),
    inputSchema: z.record(z.string(), z.unknown()),
  })
  .strict();

export const knorviaWorkspaceGenerateTextParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    selection: modelSelectionSchema,
    prompt: nonEmptyString.optional(),
    messages: z.array(knorviaWorkspaceModelMessageSchema).min(1).optional(),
    tools: z.array(knorviaWorkspaceModelToolSchema).optional(),
    querySource: nonEmptyString,
    maxOutputTokens: z.number().int().positive().optional(),
    operationId: nonEmptyString.optional(),
  })
  .strict()
  .refine((value) => value.prompt !== undefined || value.messages !== undefined, {
    message: "prompt 或 messages 至少需要提供一个",
  });
export const knorviaWorkspaceGenerateTextResultSchema = z
  .object({
    text: z.string(),
    selection: modelSelectionSchema,
    toolCalls: z.array(knorviaWorkspaceModelToolCallSchema).optional(),
    // 可选以兼容仍在运行的旧 app-server；新 CLI 始终返回结构化结束原因。
    finishReason: z.string().optional(),
    usage: z
      .object({
        inputTokens: z.number().nonnegative().optional(),
        outputTokens: z.number().nonnegative().optional(),
        totalTokens: z.number().nonnegative().optional(),
        cacheReadTokens: z.number().nonnegative().optional(),
        cacheWriteTokens: z.number().nonnegative().optional(),
        reasoningTokens: z.number().nonnegative().optional(),
        serverToolUse: z
          .object({
            webSearchRequests: z.number().nonnegative().optional(),
            webFetchRequests: z.number().nonnegative().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type KnorviaWorkspaceGenerateTextParams = z.infer<
  typeof knorviaWorkspaceGenerateTextParamsSchema
>;
export type KnorviaWorkspaceModelMessage = z.infer<typeof knorviaWorkspaceModelMessageSchema>;
export type KnorviaWorkspaceModelTool = z.infer<typeof knorviaWorkspaceModelToolSchema>;
export type KnorviaWorkspaceGenerateTextResult = z.infer<
  typeof knorviaWorkspaceGenerateTextResultSchema
>;
export const knorviaWorkspaceCancelGenerateTextParamsSchema = z
  .object({ operationId: nonEmptyString })
  .strict();
export const knorviaWorkspaceCancelGenerateTextResultSchema = z
  .object({ operationId: nonEmptyString, cancelled: z.boolean() })
  .strict();

export const knorviaProviderTestModelConnectivityParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    selection: modelSelectionSchema,
  })
  .strict();
export const knorviaProviderTestModelConnectivityResultSchema = z
  .object({ success: z.literal(true) })
  .strict();
export type KnorviaProviderTestModelConnectivityParams = z.infer<
  typeof knorviaProviderTestModelConnectivityParamsSchema
>;
export type KnorviaProviderTestModelConnectivityResult = z.infer<
  typeof knorviaProviderTestModelConnectivityResultSchema
>;

export const knorviaProviderUpdateAccountConfigParamsSchema = z
  .object({
    revision: nonEmptyString,
    basedOnKnorviaBuiltinRevision: nonEmptyString,
    // Provider Config 的字段校验由 @knorvia/provider 负责；协议层只约束可传输信封。
    providers: z.record(z.string(), z.unknown()),
    // 账号状态与 Overlay 必须一起传递，否则 Worker 会丢失非当前套餐的执行门禁。
    states: z.record(
      z.string(),
      z
        .object({
          availability: z.enum(["available", "pending", "unavailable", "unknown"]),
          entitled: z.boolean(),
          unavailableReason: accountProviderUnavailableReasonSchema.optional(),
          current: z.boolean().optional(),
          connectionKey: z.string().optional(),
          effectiveAt: z.number().finite().optional(),
        })
        .strict(),
    ),
  })
  .strict();
export const knorviaProviderUpdateAccountConfigResultSchema = z
  .object({
    // 收到账号结果不代表配套 Built-in 已到达；应用版本只能读取 Registry 快照。
    receivedRevision: nonEmptyString,
    providerCount: z.number().int().nonnegative(),
    status: z.enum(["received", "unchanged"]),
  })
  .strict();
export type KnorviaProviderUpdateAccountConfigResult = z.infer<
  typeof knorviaProviderUpdateAccountConfigResultSchema
>;
export const knorviaInteractionPreferencesSchema = z
  .object({
    askUserQuestionAutoResolutionEnabled: z.boolean(),
  })
  .strict();
export type KnorviaInteractionPreferences = z.infer<typeof knorviaInteractionPreferencesSchema>;

export const knorviaWorkspaceUpdateInteractionPreferencesParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    preferences: knorviaInteractionPreferencesSchema,
  })
  .strict();
export type KnorviaWorkspaceUpdateInteractionPreferencesParams = z.infer<
  typeof knorviaWorkspaceUpdateInteractionPreferencesParamsSchema
>;

export const knorviaWorkspaceUpdateInteractionPreferencesResultSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    askUserQuestionAutoResolutionEnabled: z.boolean(),
    snoozedInteractionCount: z.number().int().nonnegative(),
  })
  .strict();
export type KnorviaWorkspaceUpdateInteractionPreferencesResult = z.infer<
  typeof knorviaWorkspaceUpdateInteractionPreferencesResultSchema
>;

export const knorviaModelIoPreferencesSchema = z
  .object({
    fullRetentionEnabled: z.boolean(),
  })
  .strict();
export type KnorviaModelIoPreferences = z.infer<typeof knorviaModelIoPreferencesSchema>;

export const knorviaWorkspaceUpdateModelIoPreferencesParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    preferences: knorviaModelIoPreferencesSchema,
  })
  .strict();
export type KnorviaWorkspaceUpdateModelIoPreferencesParams = z.infer<
  typeof knorviaWorkspaceUpdateModelIoPreferencesParamsSchema
>;

export const knorviaWorkspaceUpdateModelIoPreferencesResultSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    fullRetentionEnabled: z.boolean(),
    updatedSessionCount: z.number().int().nonnegative(),
  })
  .strict();
export type KnorviaWorkspaceUpdateModelIoPreferencesResult = z.infer<
  typeof knorviaWorkspaceUpdateModelIoPreferencesResultSchema
>;

export const knorviaWorkspaceUpdateOffPeakToolPolicyParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    enabled: z.boolean(),
  })
  .strict();
export type KnorviaWorkspaceUpdateOffPeakToolPolicyParams = z.infer<
  typeof knorviaWorkspaceUpdateOffPeakToolPolicyParamsSchema
>;

export const knorviaWorkspaceUpdateOffPeakToolPolicyResultSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    enabled: z.boolean(),
  })
  .strict();
export type KnorviaWorkspaceUpdateOffPeakToolPolicyResult = z.infer<
  typeof knorviaWorkspaceUpdateOffPeakToolPolicyResultSchema
>;

// 动态工作流灰度门禁：workspace 级事实，
// 与 Off-Peak 同一套 host→CLI 同步模式；旧 CLI method-not-found → host 降级忽略。
export const knorviaWorkspaceUpdateDynamicWorkflowPolicyParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    enabled: z.boolean(),
  })
  .strict();
export type KnorviaWorkspaceUpdateDynamicWorkflowPolicyParams = z.infer<
  typeof knorviaWorkspaceUpdateDynamicWorkflowPolicyParamsSchema
>;

export const knorviaWorkspaceUpdateDynamicWorkflowPolicyResultSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    enabled: z.boolean(),
  })
  .strict();
export type KnorviaWorkspaceUpdateDynamicWorkflowPolicyResult = z.infer<
  typeof knorviaWorkspaceUpdateDynamicWorkflowPolicyResultSchema
>;

export const knorviaPermissionRequestParamsSchema = z
  .object({
    requestId: nonEmptyString,
    sessionId: nonEmptyString,
    turnId: nonEmptyString.optional(),
    toolCallId: nonEmptyString,
    toolName: nonEmptyString,
    reason: z.string(),
    riskLevel: z.enum(["low", "medium", "high", "critical"]),
    input: z.unknown(),
    origin: knorviaInteractionRequestOriginSchema.optional(),
    options: z.array(knorviaPermissionOptionSchema).min(1),
  })
  .strict();
export type KnorviaPermissionRequestParams = z.infer<typeof knorviaPermissionRequestParamsSchema>;

/** Agent 请求 app 枚举当前 workspace/session 可达且已完成握手的 browser backend。 */
export const knorviaBrowserListParamsSchema = z
  .object({
    requestId: nonEmptyString,
    sessionId: nonEmptyString,
    turnId: nonEmptyString.optional(),
    workspaceKey: nonEmptyString,
    workspacePath: nonEmptyString,
    workspaceIdentity: nonEmptyString.optional(),
    remoteSessionId: nonEmptyString.optional(),
    clientMode: browserClientModeSchema,
    sessionContext: browserSessionContextKindSchema,
  })
  .strict();
export type KnorviaBrowserListParams = z.infer<typeof knorviaBrowserListParamsSchema>;

export const knorviaBrowserListResultSchema = browserBackendListResultSchema;
export type KnorviaBrowserListResult = z.infer<typeof knorviaBrowserListResultSchema>;

/** Agent 把一条 browser-use 命令发送给 app 执行。 */
export const knorviaBrowserExecuteParamsSchema = z
  .object({
    requestId: nonEmptyString,
    sessionId: nonEmptyString,
    turnId: nonEmptyString.optional(),
    browserId: nonEmptyString.optional(),
    browserGeneration: z.number().int().nonnegative().optional(),
    workspaceKey: nonEmptyString.optional(),
    workspacePath: nonEmptyString.optional(),
    workspaceIdentity: nonEmptyString.optional(),
    remoteSessionId: nonEmptyString.optional(),
    clientMode: browserClientModeSchema.optional(),
    sessionContext: browserSessionContextKindSchema.optional(),
    command: browserCommandSchema,
  })
  .strict();
export type KnorviaBrowserExecuteParams = z.infer<typeof knorviaBrowserExecuteParamsSchema>;

// browser command result 是 app/agent 的同源协议结果；其中 duplicate_request_id 用于在真正维护
// pending/running 生命周期的边界拒绝 correlation key 冲突，不能依赖上游 UUID 概率保证。
export const knorviaBrowserExecuteResultSchema = browserCommandResultSchema;
export type KnorviaBrowserExecuteResult = z.infer<typeof knorviaBrowserExecuteResultSchema>;

export const knorviaUserInputOptionSchema = z
  .object({
    value: nonEmptyString,
    label: nonEmptyString,
    description: z.string().optional(),
    preview: z.string().optional(),
  })
  .strict();
export const knorviaUserInputQuestionSchema = z
  .object({
    question: nonEmptyString,
    header: nonEmptyString,
    options: z.array(knorviaUserInputOptionSchema).min(1),
    multiSelect: z.boolean().optional(),
  })
  .strict();
export type KnorviaUserInputQuestion = z.infer<typeof knorviaUserInputQuestionSchema>;

export const knorviaUserInputRequestParamsSchema = z
  .object({
    requestId: nonEmptyString,
    sessionId: nonEmptyString,
    turnId: nonEmptyString.optional(),
    toolCallId: nonEmptyString.optional(),
    toolName: nonEmptyString.optional(),
    prompt: z.string().optional(),
    questions: z.array(knorviaUserInputQuestionSchema).min(1).optional(),
    input: z.unknown().optional(),
    origin: knorviaInteractionRequestOriginSchema.optional(),
    schema: z.unknown().optional(),
  })
  .strict();
export type KnorviaUserInputRequestParams = z.infer<typeof knorviaUserInputRequestParamsSchema>;

export const knorviaUserInputResponseSchema = z
  .object({
    action: z.enum(["accept", "decline", "cancel"]),
    content: jsonObjectSchema.optional(),
    reason: z.string().optional(),
  })
  .strict();
export type KnorviaUserInputResponse = z.infer<typeof knorviaUserInputResponseSchema>;

export const knorviaProviderRuntimeHeadersRequestReasonSchema = z.enum(["model-request"]);
export const knorviaProviderRuntimeHeadersRequestParamsSchema = z
  .object({
    requestId: nonEmptyString,
    sessionId: nonEmptyString,
    turnId: nonEmptyString.optional(),
    workspace: knorviaWorkspaceRefSchema,
    modelSelection: modelSelectionSchema,
    providerId: nonEmptyString,
    accountAccess: knorviaProviderAccountAccessSchema.optional(),
    reason: knorviaProviderRuntimeHeadersRequestReasonSchema,
  })
  .strict();
export type KnorviaProviderRuntimeHeadersRequestParams = z.infer<
  typeof knorviaProviderRuntimeHeadersRequestParamsSchema
>;

/** 请求取消只作用于同 workspace/session 的这一轮凭据刷新。 */
export const knorviaProviderRuntimeHeadersCancelledSchema = z
  .object({
    requestId: nonEmptyString,
    sessionId: nonEmptyString,
    workspace: knorviaWorkspaceRefSchema,
  })
  .strict();
export type KnorviaProviderRuntimeHeadersCancelled = z.infer<
  typeof knorviaProviderRuntimeHeadersCancelledSchema
>;

export const knorviaProviderRuntimeHeadersResponseSchema = z.discriminatedUnion("headersApplied", [
  z
    .object({
      headersApplied: z.literal(true),
      // 合并重接：成功必须携带当前请求的鉴权材料，不依赖旧 Registry 已被写入。
      requestAuth: z
        .object({
          apiKey: nonEmptyString.optional(),
          headers: z.record(nonEmptyString, nonEmptyString).optional(),
        })
        .strict(),
      errorMessage: nonEmptyString.optional(),
    })
    .strict(),
  z
    .object({
      headersApplied: z.literal(false),
      errorMessage: nonEmptyString.optional(),
    })
    .strict(),
]);
export type KnorviaProviderRuntimeHeadersResponse = z.infer<
  typeof knorviaProviderRuntimeHeadersResponseSchema
>;

// ── 官方 Server MCP 鉴权──
// Agent 进程不是用户身份权威：它把 (pluginId, mcpKey, targetOrigin) 报给 host，由 host
// 解析当前 Coding Plan 凭证并回传本次请求的身份头。请求侧不含任何秘密。
// 与 interaction/requestProviderRuntimeHeaders 同类：Agent 发起、host 自动响应、零 UI。
export const knorviaOfficialMcpAuthHeadersRequestParamsSchema = z
  .object({
    requestId: nonEmptyString,
    workspace: knorviaWorkspaceRefSchema,
    pluginId: nonEmptyString,
    mcpKey: nonEmptyString,
    targetOrigin: nonEmptyString,
  })
  .strict();
export type KnorviaOfficialMcpAuthHeadersRequestParams = z.infer<
  typeof knorviaOfficialMcpAuthHeadersRequestParamsSchema
>;

/**
 * 失败原因必须可枚举，避免调用方按文本分流；因此响应不含 errorMessage。
 *
 * `official_mcp_origin_untrusted` 是 host 侧二次校验的拒绝原因：`targetOrigin` 不等于当前
 * Knorvia API origin。判定只看 origin，`pluginId` / `mcpKey` 仅用于日志归属。与"未登录/无凭据"
 * 分开，才能在排查时区分"被拒绝"和"没身份"。
 */
export const knorviaOfficialMcpAuthFailureReasonSchema = z.enum(
  OFFICIAL_MCP_AUTH_PORT_FAILURE_REASONS,
);

export const knorviaOfficialMcpAuthHeadersResponseSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      headers: z.record(z.string(), z.string()),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      reason: knorviaOfficialMcpAuthFailureReasonSchema,
    })
    .strict(),
]);
export type KnorviaOfficialMcpAuthHeadersResponse = z.infer<
  typeof knorviaOfficialMcpAuthHeadersResponseSchema
>;

// ── Plugin management (list + enable/disable) ──
// 镜像 @knorvia/contracts 的 PluginMetadata, 仅保留 UI 需要的可序列化字段。
export const knorviaPluginOptionValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export type KnorviaPluginOptionValue = z.infer<typeof knorviaPluginOptionValueSchema>;
export const knorviaPluginScopeSchema = z.enum(["user", "workspace"]);
export type KnorviaPluginScope = z.infer<typeof knorviaPluginScopeSchema>;
export const knorviaPluginHookDetailSchema = z
  .object({
    event: nonEmptyString,
    matcher: z.string().optional(),
    type: z.enum(["command", "process"]),
    command: nonEmptyString,
    args: z.array(z.string()).optional(),
    async: z.boolean().optional(),
    shell: z.union([z.literal(true), z.string()]).optional(),
    timeout: z.number().positive().optional(),
    timeoutMs: z.number().int().positive().optional(),
    statusMessage: z.string().optional(),
    sourcePath: z.string(),
    runnable: z.boolean(),
  })
  .strict();
export const knorviaPluginUserConfigOptionSchema = z
  .object({
    default: knorviaPluginOptionValueSchema.optional(),
    description: z.string().optional(),
    required: z.boolean().optional(),
    sensitive: z.boolean().optional(),
    title: z.string().optional(),
    type: z.enum(["string", "number", "boolean", "directory", "file"]).optional(),
  })
  .strict();
export type KnorviaPluginUserConfigOption = z.infer<typeof knorviaPluginUserConfigOptionSchema>;

// 组件类型与详情弹窗/市场详情共用的分组顺序保持一致：agent / command / skill / hook / mcp。
// 注意：这三个 schema 必须定义在 knorviaPluginInfoSchema 之前，因为后者（.strict()）的 components 字段引用了它们。
export const knorviaPluginComponentKindSchema = z.enum(["agent", "command", "skill", "hook", "mcp"]);
export type KnorviaPluginComponentKind = z.infer<typeof knorviaPluginComponentKindSchema>;

export const knorviaPluginComponentItemSchema = z
  .object({
    name: nonEmptyString,
    // 描述来自组件 frontmatter（SKILL.md / command / agent）或 manifest；缺失时省略，不伪造。
    description: z.string().optional(),
  })
  .strict();
export const knorviaPluginComponentGroupSchema = z
  .object({
    kind: knorviaPluginComponentKindSchema,
    items: z.array(knorviaPluginComponentItemSchema),
  })
  .strict();
export type KnorviaPluginComponentGroup = z.infer<typeof knorviaPluginComponentGroupSchema>;

export const knorviaPluginInfoSchema = z
  .object({
    id: nonEmptyString,
    name: nonEmptyString,
    description: z.string().optional(),
    version: z.string().optional(),
    enabled: z.boolean(),
    source: nonEmptyString,
    marketplace: nonEmptyString,
    // manifest（plugin.json）的作者/主页回退字段；商店 listing 缺失时详情页信息区用它兜底。
    author: z.string().optional(),
    authorUrl: z.string().optional(),
    homepage: z.string().optional(),
    skillCount: z.number().int().nonnegative().optional(),
    skillRootCount: z.number().int().nonnegative(),
    commandRootCount: z.number().int().nonnegative(),
    // 权威组件清单（名称 + 可选描述），由 CLI 对插件根目录枚举得出，与启用态无关。
    // 详情 UI 直接展示，取代旧的「数量取协议、名称靠 UI 侧 join」脆弱方案。optional 兼容旧 payload。
    components: z.array(knorviaPluginComponentGroupSchema).optional(),
    declaredMcpServerNames: z.array(z.string()).optional(),
    hostMcpServerNames: z.array(z.string()).optional(),
    mcpServerNames: z.array(z.string()),
    hookDetails: z.array(knorviaPluginHookDetailSchema).optional(),
    rootPath: z.string(),
    userConfig: z.record(z.string(), knorviaPluginUserConfigOptionSchema).optional(),
    configuredOptions: z.record(z.string(), knorviaPluginOptionValueSchema).optional(),
    // 缺省表示 package 可用；missing 用于保留已声明但目标 Host 尚未物化的配置行。
    packageStatus: z.literal("missing").optional(),
    rootSource: knorviaPluginScopeSchema.optional(),
    enabledSource: knorviaPluginScopeSchema.optional(),
    optionSources: z.record(z.string(), knorviaPluginScopeSchema).optional(),
  })
  .strict();
export type KnorviaPluginInfo = z.infer<typeof knorviaPluginInfoSchema>;

export const knorviaPluginDiagnosticSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    severity: z.enum(["warning", "error"]).optional(),
    pluginId: z.string().optional(),
  })
  .strict();
export type KnorviaPluginDiagnostic = z.infer<typeof knorviaPluginDiagnosticSchema>;

export const knorviaPluginsListParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    configScope: knorviaPluginScopeSchema.optional(),
  })
  .strict();
export const knorviaPluginsListResultSchema = z
  .object({
    plugins: z.array(knorviaPluginInfoSchema),
    diagnostics: z.array(knorviaPluginDiagnosticSchema),
  })
  .strict();
export type KnorviaPluginsListResult = z.infer<typeof knorviaPluginsListResultSchema>;

// ── Plugin 对话引用 catalog──
// Session-scoped 只读投影：带 sessionId → 该 Session 创建时冻结的身份 catalog；
// 不带 → workspace 当前 catalog（新建草稿 Picker）。身份与能力字段保持
// identifiers-only，不携带 rootPath/配置等；可选 icon/displayName(I18n)/description(I18n)
// 仅供 UI 展示与 Picker 搜索，不参与身份、权限或 runtime reminder。
export const knorviaPluginReferenceCatalogEntrySchema = z
  .object({
    // 仅 referenceCatalogWithCategory 返回；旧入口保持原结构。
    category: nonEmptyString.optional(),
    pluginId: nonEmptyString,
    name: nonEmptyString,
    marketplace: nonEmptyString,
    icon: z.string().optional(),
    // 商店 listing 的 display-only 本地化显示名投影（沿 icon 先例）：让 Picker 能按
    // 中文显示名搜索/展示；locale 解析复用 shared 的 plugin-display-name helper。
    displayName: z.string().optional(),
    displayNameI18n: z.record(z.string(), z.string()).optional(),
    // 仅供 Picker 展示，不进入能力身份或 model-only reminder。
    description: z.string().optional(),
    descriptionI18n: z.record(z.string(), z.string()).optional(),
    enabled: z.boolean(),
    // 非空 = 与其他 enabled Plugin 共享 manifest name 的 V1 fail closed 冲突：
    // Picker 禁选并展示原因，runtime 解析按 ambiguous 跳过。
    conflictingPluginIds: z.array(nonEmptyString),
    skillQualifiedNames: z.array(nonEmptyString),
    mcpServerNames: z.array(nonEmptyString),
    // 旧 Host 不投影该字段时按空数组兼容；只有新 Agent 会把它用于 reminder live 交集。
    subagentNames: z.array(nonEmptyString).default([]),
  })
  .strict();
export type KnorviaPluginReferenceCatalogEntry = z.infer<
  typeof knorviaPluginReferenceCatalogEntrySchema
>;

export const knorviaPluginsReferenceCatalogParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    // 已有 Session 的 Picker 必须带 sessionId 才能拿到 session-owned catalog；
    // session 不存在时按协议错误 fail closed，禁止静默回退 workspace authority。
    sessionId: nonEmptyString.optional(),
  })
  .strict();
export type KnorviaPluginsReferenceCatalogParams = z.infer<
  typeof knorviaPluginsReferenceCatalogParamsSchema
>;
export const knorviaPluginsReferenceCatalogResultSchema = z
  .object({
    authority: z.enum(["session", "workspace"]),
    plugins: z.array(knorviaPluginReferenceCatalogEntrySchema),
  })
  .strict();
export type KnorviaPluginsReferenceCatalogResult = z.infer<
  typeof knorviaPluginsReferenceCatalogResultSchema
>;

// ── Skill 对话引用 catalog──
// 新草稿读取 workspace 当前目录；已有 Session 读取 AgentRuntime 首次 context
// 初始化时冻结的发现结果。该协议只承载 Composer 的只读引用投影，不替代 Settings
// 的 Skill 管理接口，也不持久化 runtime 快照。
export const knorviaSkillReferenceCatalogEntrySchema = z
  .object({
    id: nonEmptyString,
    name: nonEmptyString,
    description: z.string(),
    path: nonEmptyString,
    scope: z.enum(["workspace", "user", "plugin"]),
    enabled: z.literal(true),
    pluginName: nonEmptyString.optional(),
  })
  .strict();
export type KnorviaSkillReferenceCatalogEntry = z.infer<typeof knorviaSkillReferenceCatalogEntrySchema>;

export const knorviaSkillsReferenceCatalogParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    // 带 sessionId 时必须命中该进程内的 resident Session；未知 Session fail closed，
    // 禁止回退到 workspace 当前目录而把新 Skill 泄漏进旧对话。
    sessionId: nonEmptyString.optional(),
  })
  .strict();
export type KnorviaSkillsReferenceCatalogParams = z.infer<
  typeof knorviaSkillsReferenceCatalogParamsSchema
>;
export const knorviaSkillsReferenceCatalogResultSchema = z
  .object({
    authority: z.enum(["session", "workspace"]),
    skills: z.array(knorviaSkillReferenceCatalogEntrySchema),
  })
  .strict();
export type KnorviaSkillsReferenceCatalogResult = z.infer<
  typeof knorviaSkillsReferenceCatalogResultSchema
>;

// ── 已保存工作流的 GUI 中枢──
// workspace 级、无会话的五个方法，照 skills/referenceCatalog 的先例：每次调用现扫
// `<cwd>/.knorvia-studio/workflows/`（挂载时快照会漏掉手改的文件）。形状与 @knorvia/contracts 的
// saved-workflow.ts 逐字对齐——依赖方向是 contracts → shared，所以这里结构化地再声明一遍，
// 而不是 import；两边的 strict 形状由 bootstrap 侧的协议测试互相钉住。
export const knorviaSavedWorkflowArgTypeSchema = z.enum(["string", "number", "boolean", "json"]);
export type KnorviaSavedWorkflowArgType = z.infer<typeof knorviaSavedWorkflowArgTypeSchema>;
export const knorviaSavedWorkflowArgDeclarationSchema = z
  .object({
    type: knorviaSavedWorkflowArgTypeSchema,
    description: z.string().optional(),
    required: z.boolean().optional(),
    default: z.unknown().optional(),
  })
  .strict();
export type KnorviaSavedWorkflowArgDeclaration = z.infer<
  typeof knorviaSavedWorkflowArgDeclarationSchema
>;
export const knorviaSavedWorkflowArgsDeclarationSchema = z.record(
  z.string(),
  knorviaSavedWorkflowArgDeclarationSchema,
);
export type KnorviaSavedWorkflowArgsDeclaration = z.infer<
  typeof knorviaSavedWorkflowArgsDeclarationSchema
>;
export const knorviaSavedWorkflowMetaSchema = z
  .object({
    description: nonEmptyString,
    whenToUse: nonEmptyString.optional(),
    args: knorviaSavedWorkflowArgsDeclarationSchema.optional(),
  })
  .strict();
export type KnorviaSavedWorkflowMeta = z.infer<typeof knorviaSavedWorkflowMetaSchema>;
// 作用域两档：项目档落 `<cwd>/.knorvia-studio/workflows/`、全局档落 agent 机器的 `~/.knorvia-studio/workflows/`。作用域由文件所在目录推得，frontmatter 不存 scope。
export const knorviaSavedWorkflowScopeSchema = z.enum(["project", "global"]);
export type KnorviaSavedWorkflowScope = z.infer<typeof knorviaSavedWorkflowScopeSchema>;
export const knorviaSavedWorkflowEntrySchema = z
  .object({
    name: nonEmptyString,
    description: z.string(),
    whenToUse: z.string().optional(),
    args: knorviaSavedWorkflowArgsDeclarationSchema.optional(),
    scope: knorviaSavedWorkflowScopeSchema,
    path: nonEmptyString,
  })
  .strict();
export type KnorviaSavedWorkflowEntry = z.infer<typeof knorviaSavedWorkflowEntrySchema>;
export const knorviaSavedWorkflowInvalidEntrySchema = z
  .object({ path: nonEmptyString, reason: nonEmptyString })
  .strict();
export type KnorviaSavedWorkflowInvalidEntry = z.infer<typeof knorviaSavedWorkflowInvalidEntrySchema>;
/** 名字非法 / 未找到 / frontmatter 坏 / 读错——与 core store 的 resolve 失败四态逐字对应。 */
export const knorviaSavedWorkflowFailureReasonSchema = z.enum([
  "invalid_name",
  "not_found",
  "parse_error",
  "read_error",
]);
export type KnorviaSavedWorkflowFailureReason = z.infer<typeof knorviaSavedWorkflowFailureReasonSchema>;
const knorviaSavedWorkflowFailureSchema = z
  .object({
    ok: z.literal(false),
    reason: knorviaSavedWorkflowFailureReasonSchema,
    detail: z.string().optional(),
  })
  .strict();

export const knorviaWorkflowsListParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    // 缺省即 `project`（本项目档）。给 `global` 时改扫本机 `~/.knorvia-studio/workflows/`；此时 `workspace`
    // 仍必填，但只是**载体运行时**——协议处理器对全局档不读它的路径。
    scope: knorviaSavedWorkflowScopeSchema.optional(),
  })
  .strict();
export type KnorviaWorkflowsListParams = z.infer<typeof knorviaWorkflowsListParamsSchema>;
export const knorviaWorkflowsListResultSchema = z
  .object({
    workflows: z.array(knorviaSavedWorkflowEntrySchema),
    invalid: z.array(knorviaSavedWorkflowInvalidEntrySchema),
    // 扫过的目录（本地绝对路径），即使目录还不存在也回：GUI 的文件监听靠它 watch。
    dir: nonEmptyString,
  })
  .strict();
export type KnorviaWorkflowsListResult = z.infer<typeof knorviaWorkflowsListResultSchema>;

export const knorviaWorkflowsGetParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    name: nonEmptyString,
    // 缺省 `project`；`global` 时只查本机全局根。`workspace` 语义同 list（全局档只当载体）。
    scope: knorviaSavedWorkflowScopeSchema.optional(),
  })
  .strict();
export type KnorviaWorkflowsGetParams = z.infer<typeof knorviaWorkflowsGetParamsSchema>;
export const knorviaWorkflowsGetResultSchema = z.union([
  z
    .object({
      ok: z.literal(true),
      name: nonEmptyString,
      path: nonEmptyString,
      scope: knorviaSavedWorkflowScopeSchema,
      meta: knorviaSavedWorkflowMetaSchema,
      /** 脚本本体（frontmatter 之后逐字节），即被类型检查与执行的那一份。 */
      script: z.string(),
    })
    .strict(),
  knorviaSavedWorkflowFailureSchema,
]);
export type KnorviaWorkflowsGetResult = z.infer<typeof knorviaWorkflowsGetResultSchema>;

export const knorviaWorkflowsUpdateMetaParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    name: nonEmptyString,
    meta: knorviaSavedWorkflowMetaSchema,
    // 缺省 `project`；`global` 时只写本机全局根那一份。`workspace` 语义同 list。
    scope: knorviaSavedWorkflowScopeSchema.optional(),
  })
  .strict();
export type KnorviaWorkflowsUpdateMetaParams = z.infer<typeof knorviaWorkflowsUpdateMetaParamsSchema>;
export const knorviaWorkflowsUpdateMetaResultSchema = z.union([
  z.object({ ok: z.literal(true), path: nonEmptyString }).strict(),
  knorviaSavedWorkflowFailureSchema,
]);
export type KnorviaWorkflowsUpdateMetaResult = z.infer<typeof knorviaWorkflowsUpdateMetaResultSchema>;

export const knorviaWorkflowsDeleteParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    name: nonEmptyString,
    // 缺省 `project`；`global` 时按 scope 选根删除（不再写死 roots[0]）。`workspace` 语义同 list。
    scope: knorviaSavedWorkflowScopeSchema.optional(),
  })
  .strict();
export type KnorviaWorkflowsDeleteParams = z.infer<typeof knorviaWorkflowsDeleteParamsSchema>;
export const knorviaWorkflowsDeleteResultSchema = z.union([
  z.object({ ok: z.literal(true), path: nonEmptyString }).strict(),
  knorviaSavedWorkflowFailureSchema,
]);
export type KnorviaWorkflowsDeleteResult = z.infer<typeof knorviaWorkflowsDeleteResultSchema>;

export const KNORVIA_WORKFLOWS_RUNS_MAX_LIMIT = 50;
export const knorviaWorkflowsRunsParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    /** 只要这个名字的 run（`dwf_run.name` 字面等值）；缺省即本项目全部 run。 */
    name: nonEmptyString.optional(),
    limit: z.number().int().min(1).max(KNORVIA_WORKFLOWS_RUNS_MAX_LIMIT),
    // 缺省 `project`：只查 `dwf_run.cwd === workspacePath` 的 run。`global` 时**不**按 cwd 过滤，
    // 跨所有项目取该名字的运行历史（全局工作流在任何项目里跑，历史因此跨 cwd）；结果行带 `cwd`
    // 供 GUI 标项目。`workspace` 语义同 list（全局档只当载体）。
    scope: knorviaSavedWorkflowScopeSchema.optional(),
  })
  .strict();
export type KnorviaWorkflowsRunsParams = z.infer<typeof knorviaWorkflowsRunsParamsSchema>;
// 三终态词汇：errored = 脚本之错，stopped = 被停下（可恢复）。
export const knorviaSavedWorkflowRunStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "errored",
  "stopped",
]);
export type KnorviaSavedWorkflowRunStatus = z.infer<typeof knorviaSavedWorkflowRunStatusSchema>;
export const knorviaSavedWorkflowRunStopReasonSchema = z.enum([
  "user",
  "model",
  "provider",
  "interrupted",
  "superseded",
]);
export const knorviaSavedWorkflowRunSchema = z
  .object({
    runId: nonEmptyString,
    name: z.string().optional(),
    status: knorviaSavedWorkflowRunStatusSchema,
    // `status === "stopped"` 才在场。
    stopReason: knorviaSavedWorkflowRunStopReasonSchema.optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
    spentTokens: z.number(),
    /** 发起它的会话与 CreateWorkflow 工具调用：有这两个才能从中枢打开实例详情。老行可缺。 */
    parentSessionId: z.string().optional(),
    toolCallId: z.string().optional(),
    args: z.record(z.string(), z.unknown()).optional(),
    // 实际运行的项目目录（`dwf_run.cwd`）。全局档的 `workflows/runs` 跨 cwd 查询，GUI 用它给
    // 每行标项目；项目档变体里它恒等于 workspacePath，GUI 可忽略。老行可缺。
    cwd: z.string().optional(),
    // 这次运行发布的**用户面产物**：中枢的运行历史行在
    // 状态词之后画一串 kind chips，详情页头部的「最近产物」条取最近一次 completed run 的这一份。
    // ⚠ 术语：这里的 artifact 是脚本经 `artifact.*` 发布给用户看的产出，不是脚本的顶层返回值。
    // 只带 chip 画得下的字段（≤ 8 件，取最新版的元数据）；字节与条目经 v4 查询按需读。
    // optional，照上面 `cwd` 的先例：老 CLI 不发，少一个键是退化不是错误。
    artifacts: z
      .array(
        z
          .object({
            id: nonEmptyString,
            kind: z.enum(["file", "markdown", "chart", "table", "metrics", "board"]),
            title: z.string().optional(),
            version: z.number(),
            contentType: z.string().optional(),
          })
          .strict(),
      )
      .max(8)
      .optional(),
  })
  .strict();
export type KnorviaSavedWorkflowRun = z.infer<typeof knorviaSavedWorkflowRunSchema>;
export const knorviaWorkflowsRunsResultSchema = z
  .object({
    runs: z.array(knorviaSavedWorkflowRunSchema),
    /** 为真时才在场：还有更多 run 没进这一页（多取一条判定，不是 length === limit）。 */
    truncated: z.literal(true).optional(),
  })
  .strict();
export type KnorviaWorkflowsRunsResult = z.infer<typeof knorviaWorkflowsRunsResultSchema>;

// workflows/move：把本机全局根的同名文件搬到 `workspace` 项目根。**只此一向**：项目→全局不是搬文件而是模型的概括（「提升为
// 全局」在该项目开新会话、经 SaveWorkflow 另存），所以没有 `to` 参数。同机同用户，rename 优先、EXDEV
// 回落 copy+unlink；逐字节搬，不改内容（frontmatter 不存 scope）；`move` 不覆盖——目标已存在即拒绝
// （覆盖是 SaveWorkflow 经确认窗才有的动作，不变式 7）。`workspace` 既是载体运行时也是目标项目。
export const knorviaWorkflowsMoveParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    name: nonEmptyString,
  })
  .strict();
export type KnorviaWorkflowsMoveParams = z.infer<typeof knorviaWorkflowsMoveParamsSchema>;
export const knorviaWorkflowsMoveResultSchema = z.union([
  z
    .object({
      ok: z.literal(true),
      /** 源落点路径（全局根，搬走前）。 */
      from: nonEmptyString,
      /** 目标落点路径（项目根，搬到处）。 */
      to: nonEmptyString,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      // target_exists：目标档已有同名（move 不覆盖）；not_found：源档没有这个名字；
      // read_error / write_error：搬运时的 I/O 失败；invalid_name：名字先验没过。
      reason: z.enum(["invalid_name", "not_found", "target_exists", "read_error", "write_error"]),
      path: z.string().optional(),
      detail: z.string().optional(),
    })
    .strict(),
]);
export type KnorviaWorkflowsMoveResult = z.infer<typeof knorviaWorkflowsMoveResultSchema>;

// 推荐 Prompt 的可信插件解析：UI 不拆解 stableId，也不从旧目录快照推断可安装性。
export const knorviaPluginSuggestedReferenceStatusSchema = z.enum([
  "ready",
  "disabled",
  "missing",
  "conflict",
  "unavailable",
]);
export type KnorviaPluginSuggestedReferenceStatus = z.infer<
  typeof knorviaPluginSuggestedReferenceStatusSchema
>;
export const knorviaPluginOperationStateSchema = z.enum([
  "checking",
  "refreshing",
  "installing",
  "enabling",
  "cancelling",
  "cancelled",
  "complete",
  "failed",
]);
export type KnorviaPluginOperationState = z.infer<typeof knorviaPluginOperationStateSchema>;
export const knorviaPluginOperationProgressNotificationSchema = z
  .object({
    operationId: nonEmptyString,
    state: z.literal("refreshing"),
  })
  .strict();
export type KnorviaPluginOperationProgressNotification = z.infer<
  typeof knorviaPluginOperationProgressNotificationSchema
>;
export const knorviaPluginsResolveSuggestedReferenceParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    stableId: nonEmptyString,
    operationId: nonEmptyString,
    clientMode: knorviaDeliveryKindSchema,
    deliveryKind: knorviaDeliveryKindSchema,
  })
  .strict();
export type KnorviaPluginsResolveSuggestedReferenceParams = z.infer<
  typeof knorviaPluginsResolveSuggestedReferenceParamsSchema
>;
export const knorviaPluginsSetEnabledParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    pluginId: nonEmptyString,
    enabled: z.boolean(),
    operationId: nonEmptyString.optional(),
    scope: knorviaPluginScopeSchema.optional(),
  })
  .strict();
export const knorviaPluginsSetEnabledResultSchema = z
  .object({
    plugin: knorviaPluginInfoSchema,
    enabled: z.boolean(),
  })
  .strict();
export type KnorviaPluginsSetEnabledResult = z.infer<typeof knorviaPluginsSetEnabledResultSchema>;

// 商店信息（Store Listing）：目录条目携带的展示性元数据（显示名/icon/分类/作者/链接/hero/
// 示例提示词），全部可选，UI 缺失时按降级矩阵处理（字母头像/隐藏区块/省略信息行）。
// i18n 采用 `<字段>I18n` map，locale 解析复用 shared 的 plugin-display-name helper。
export const knorviaPluginStoreListingSchema = z
  .object({
    displayName: z.string().optional(),
    displayNameI18n: z.record(z.string(), z.string()).optional(),
    descriptionI18n: z.record(z.string(), z.string()).optional(),
    icon: z.string().optional(),
    category: z.string().optional(),
    author: z.string().optional(),
    authorUrl: z.string().optional(),
    homepage: z.string().optional(),
    privacyPolicy: z.string().optional(),
    termsOfService: z.string().optional(),
    heroImage: z.string().optional(),
    examplePrompts: z.array(z.string()).optional(),
    examplePromptsI18n: z.record(z.string(), z.array(z.string())).optional(),
    /**
     * 需要付费套餐才好用的插件：市场目录条目声明 `requiresPaidPlan: true`，
     * UI 在标题右侧展示提示图标。描述的是「使用条件」而非「插件是收费商品」——
     * 不参与安装门禁与计费，命名也不绑定具体套餐商品名。
     */
    requiresPaidPlan: z.boolean().optional(),
  })
  .strict();
export type KnorviaPluginStoreListing = z.infer<typeof knorviaPluginStoreListingSchema>;

export const knorviaPluginsResolveSuggestedReferenceResultSchema = z
  .object({
    stableId: nonEmptyString,
    status: knorviaPluginSuggestedReferenceStatusSchema,
    marketplace: nonEmptyString.optional(),
    pluginName: nonEmptyString.optional(),
    sourceTrust: z.literal("official").optional(),
    // 官方 Marketplace listing 的可选展示投影；不参与身份、安装或权限判断。
    icon: z.string().optional(),
    listing: knorviaPluginStoreListingSchema.optional(),
    diagnostics: z.array(knorviaPluginDiagnosticSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status !== "ready" && value.status !== "disabled" && value.status !== "missing") {
      return;
    }
    if (!value.marketplace || !value.pluginName || value.sourceTrust !== "official") {
      context.addIssue({
        code: "custom",
        message: "actionable suggested Plugin results require trusted install identity",
      });
    }
  });
export type KnorviaPluginsResolveSuggestedReferenceResult = z.infer<
  typeof knorviaPluginsResolveSuggestedReferenceResultSchema
>;

export const knorviaPluginMarketplaceSummarySchema = z
  .object({
    id: nonEmptyString,
    name: nonEmptyString,
    source: jsonObjectSchema,
    description: z.string().optional(),
    lastUpdated: z.string().optional(),
    pluginCount: z.number().int().nonnegative(),
    isOfficial: z.boolean().optional(),
    // 目录顶层 featured 策展名单（商店「公开」分段 Featured 区）。
    featured: z.array(z.string()).optional(),
    refreshFailure: z
      .object({
        code: z.string(),
        failedAt: z.string(),
        message: z.string(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type KnorviaPluginMarketplaceSummary = z.infer<typeof knorviaPluginMarketplaceSummarySchema>;

export const knorviaAvailablePluginSummarySchema = z
  .object({
    id: nonEmptyString,
    name: nonEmptyString,
    marketplace: nonEmptyString,
    description: z.string().optional(),
    version: z.string().optional(),
    installed: z.boolean(),
    componentTypes: z.array(z.string()).optional(),
    listing: knorviaPluginStoreListingSchema.optional(),
  })
  .strict();
export type KnorviaAvailablePluginSummary = z.infer<typeof knorviaAvailablePluginSummarySchema>;

export const knorviaInstalledPluginSummarySchema = z
  .object({
    id: nonEmptyString,
    name: nonEmptyString,
    marketplace: nonEmptyString,
    description: z.string().optional(),
    version: z.string().optional(),
    enabled: z.boolean(),
    scope: knorviaPluginScopeSchema,
    installPath: z.string().optional(),
    installedAt: z.string().optional(),
    componentTypes: z.array(z.string()).optional(),
    hookDetails: z.array(knorviaPluginHookDetailSchema).optional(),
    updateStatus: z.enum(["none", "update-available", "version-changed"]).optional(),
    latestVersion: z.string().optional(),
    listing: knorviaPluginStoreListingSchema.optional(),
  })
  .strict();
export type KnorviaInstalledPluginSummary = z.infer<typeof knorviaInstalledPluginSummarySchema>;

export const knorviaPluginsOverviewParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    configScope: knorviaPluginScopeSchema.optional(),
  })
  .strict();
export const knorviaPluginsOverviewResultSchema = z
  .object({
    marketplaces: z.array(knorviaPluginMarketplaceSummarySchema),
    availablePlugins: z.array(knorviaAvailablePluginSummarySchema),
    installedPlugins: z.array(knorviaInstalledPluginSummarySchema),
    restorableBuiltins: z.array(knorviaAvailablePluginSummarySchema),
    diagnostics: z.array(knorviaPluginDiagnosticSchema),
    capability: z
      .object({
        supported: z.boolean(),
        reason: z.string().optional(),
      })
      .strict(),
  })
  .strict();
export type KnorviaPluginsOverviewResult = z.infer<typeof knorviaPluginsOverviewResultSchema>;

export const knorviaPluginsMarketplaceAddParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    source: nonEmptyString,
    dryRun: z.boolean().optional(),
    operationId: nonEmptyString.optional(),
  })
  .strict();
export const knorviaPluginsMarketplaceRemoveParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    marketplace: nonEmptyString,
  })
  .strict();
export const knorviaPluginsMarketplaceUpdateParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    marketplace: nonEmptyString.optional(),
    operationId: nonEmptyString.optional(),
  })
  .strict();
export const knorviaPluginsMarketplaceMutationResultSchema = z
  .object({
    marketplace: knorviaPluginMarketplaceSummarySchema.optional(),
    marketplaces: z.array(knorviaPluginMarketplaceSummarySchema).optional(),
    diagnostics: z.array(knorviaPluginDiagnosticSchema).optional(),
  })
  .strict();
export type KnorviaPluginsMarketplaceMutationResult = z.infer<
  typeof knorviaPluginsMarketplaceMutationResultSchema
>;

export const knorviaPluginsInstallParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    pluginName: nonEmptyString,
    marketplace: nonEmptyString,
    scope: knorviaPluginScopeSchema.optional(),
    dryRun: z.boolean().optional(),
    operationId: nonEmptyString.optional(),
  })
  .strict();
export const knorviaPluginsCancelOperationParamsSchema = z
  .object({
    operationId: nonEmptyString,
  })
  .strict();
export type KnorviaPluginsCancelOperationParams = z.infer<
  typeof knorviaPluginsCancelOperationParamsSchema
>;

export const knorviaPluginsCancelOperationResultSchema = z
  .object({
    operationId: nonEmptyString,
    cancelled: z.boolean(),
  })
  .strict();
export type KnorviaPluginsCancelOperationResult = z.infer<
  typeof knorviaPluginsCancelOperationResultSchema
>;
export const knorviaPluginsUninstallParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    pluginId: nonEmptyString.optional(),
    pluginName: nonEmptyString.optional(),
    marketplace: nonEmptyString.optional(),
    removeCache: z.boolean().optional(),
  })
  .strict();
export const knorviaPluginsInstallResultSchema = z
  .object({
    installedPlugins: z.array(knorviaInstalledPluginSummarySchema),
    dependencyClosure: z.array(z.string()),
    diagnostics: z.array(knorviaPluginDiagnosticSchema),
  })
  .strict();
export type KnorviaPluginsInstallResult = z.infer<typeof knorviaPluginsInstallResultSchema>;

export const knorviaPluginsUninstallResultSchema = z
  .object({
    removedPlugin: knorviaInstalledPluginSummarySchema.optional(),
    diagnostics: z.array(knorviaPluginDiagnosticSchema),
  })
  .strict();
export type KnorviaPluginsUninstallResult = z.infer<typeof knorviaPluginsUninstallResultSchema>;

export const knorviaPluginsUpdateParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    pluginId: nonEmptyString.optional(),
    marketplace: nonEmptyString.optional(),
  })
  .strict();
export const knorviaPluginsRestoreBuiltinParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    pluginId: nonEmptyString,
  })
  .strict();
export const knorviaPluginsRestoreBuiltinResultSchema = z
  .object({
    pluginId: nonEmptyString,
    diagnostics: z.array(knorviaPluginDiagnosticSchema),
  })
  .strict();
export type KnorviaPluginsRestoreBuiltinResult = z.infer<
  typeof knorviaPluginsRestoreBuiltinResultSchema
>;

export const knorviaPluginsConfigureParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    pluginId: nonEmptyString,
    options: jsonObjectSchema,
    clearOptionKeys: z.array(nonEmptyString).optional(),
    scope: knorviaPluginScopeSchema.optional(),
    dryRun: z.boolean().optional(),
  })
  .strict();
export const knorviaPluginsConfigureResultSchema = z
  .object({
    pluginId: nonEmptyString,
    diagnostics: z.array(knorviaPluginDiagnosticSchema),
  })
  .strict();
export type KnorviaPluginsConfigureResult = z.infer<typeof knorviaPluginsConfigureResultSchema>;

export const knorviaPluginsResetConfigParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    pluginId: nonEmptyString,
    scope: knorviaPluginScopeSchema.optional(),
  })
  .strict();
export type KnorviaPluginsResetConfigParams = z.infer<typeof knorviaPluginsResetConfigParamsSchema>;

export const knorviaPluginsValidateParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    pluginName: nonEmptyString.optional(),
    marketplace: nonEmptyString.optional(),
    source: nonEmptyString.optional(),
  })
  .strict();
export const knorviaPluginsValidateResultSchema = z
  .object({
    ok: z.boolean(),
    diagnostics: z.array(knorviaPluginDiagnosticSchema),
    compatibility: z
      .object({
        runnable: z.array(z.string()),
        diagnosticOnly: z.array(z.string()),
        unsupported: z.array(z.string()),
      })
      .strict(),
  })
  .strict();
export type KnorviaPluginsValidateResult = z.infer<typeof knorviaPluginsValidateResultSchema>;

// plugins/describe：按需枚举单个插件的组件「名称 + 描述」。
// 已安装插件读本地缓存目录；未安装候选按需解析/临时 clone 源后枚举再清理。
export const knorviaPluginsDescribeParamsSchema = z
  .object({
    workspace: knorviaWorkspaceRefSchema,
    pluginName: nonEmptyString,
    marketplace: nonEmptyString,
  })
  .strict();
export const knorviaPluginsDescribeResultSchema = z
  .object({
    components: z.array(knorviaPluginComponentGroupSchema),
    diagnostics: z.array(knorviaPluginDiagnosticSchema).optional(),
    // 插件包内 plugin.json 的展示性回退字段；未安装候选详情页信息区在商店 listing 缺失时兜底。
    metadata: z
      .object({
        author: z.string().optional(),
        authorUrl: z.string().optional(),
        homepage: z.string().optional(),
        version: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type KnorviaPluginsDescribeResult = z.infer<typeof knorviaPluginsDescribeResultSchema>;

export const knorviaAutomationScheduleRuleSchema = z
  .object({
    unit: z.enum(["minute", "hourly", "daily", "weekly", "monthly", "yearly"]),
    interval: z.number().int().positive(),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    anchorAt: z.number().int(),
    weekdays: z.array(z.number().int().min(0).max(6)).optional(),
    monthDays: z.array(z.number().int().min(1).max(31)).optional(),
    /** yearly 用：1-12 人类月份。缺省回退 anchorAt 的月份（兼容未写该字段的旧记录）。 */
    months: z.array(z.number().int().min(1).max(12)).optional(),
    monthlyMode: z.enum(["date", "weekday"]).optional(),
  })
  .strict();
export type KnorviaAutomationScheduleRuleProtocol = z.infer<typeof knorviaAutomationScheduleRuleSchema>;

/** 会话侧长间隔周期 carrier 的 unit 枚举（与 scheduleRule.unit 同集）。 */
export const knorviaAutomationIntervalUnitSchema = z.enum([
  "minute",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
]);

export const knorviaAutomationProtocolSchema = z
  .object({
    automationId: nonEmptyString,
    title: z.string(),
    cronExpr: nonEmptyString,
    prompt: nonEmptyString,
    modelSelection: modelSelectionSchema.optional(),
    mode: knorviaTaskModeSchema.optional(),
    targetTaskId: nonEmptyString.optional(),
    enabled: z.boolean(),
    lifecycleStatus: z.enum(["active", "completed", "failed", "paused"]),
    nextRunAt: timestampMsSchema.optional(),
    lastRunAt: timestampMsSchema.optional(),
    runCount: z.number().int().nonnegative(),
    recurring: z.boolean(),
    maxRuns: z.number().int().positive().optional(),
    // 自定义重复规则；缺省时调度回退到解析 cronExpr。会话卡片必须读到本字段才能展示
    // cron 无法表达的真实间隔（如每50小时、每40天，兼容 cronExpr 只是 0 * * * *）。
    scheduleRule: knorviaAutomationScheduleRuleSchema.optional(),
  })
  .strict();
export type KnorviaAutomationProtocol = z.infer<typeof knorviaAutomationProtocolSchema>;

export const knorviaAutomationCreateParamsSchema = z
  .object({
    title: z.string().optional(),
    cronExpr: nonEmptyString,
    relativeDelayMinutes: z.number().int().positive().max(525_600).optional(),
    prompt: nonEmptyString,
    modelSelection: modelSelectionSchema.optional(),
    mode: knorviaTaskModeSchema.optional(),
    targetTaskId: nonEmptyString.optional(),
    recurring: z.boolean().optional(),
    maxRuns: z.number().int().positive().optional(),
    // 会话侧自定义重复 carrier：每 N 分钟/小时/天/周/月/年均通过此字段归一化为权威 scheduleRule，
    // cronExpr 仅作合法兼容展示。
    intervalUnit: knorviaAutomationIntervalUnitSchema.optional(),
    interval: z.number().int().min(1).max(200).optional(),
  })
  .strict()
  // intervalUnit 与 interval 必须配对提交（只传一个无法确定真实间隔）。
  .refine((input) => (input.intervalUnit === undefined) === (input.interval === undefined), {
    message: "intervalUnit and interval must be set together",
    path: ["interval"],
  })
  // 周期 carrier 与一次性相对延迟语义冲突，禁止同传。
  .refine((input) => input.intervalUnit === undefined || input.relativeDelayMinutes === undefined, {
    message: "intervalUnit cannot combine with a relative delayMinutes",
    path: ["intervalUnit"],
  })
  .refine((input) => input.intervalUnit === undefined || input.recurring !== false, {
    message: "intervalUnit is a recurring carrier and cannot combine with recurring=false",
    path: ["recurring"],
  })
  .refine((input) => input.intervalUnit === undefined || input.maxRuns === undefined, {
    message: "intervalUnit is a recurring carrier and cannot combine with maxRuns",
    path: ["maxRuns"],
  });
export type KnorviaAutomationCreateProtocolParams = z.infer<typeof knorviaAutomationCreateParamsSchema>;

export const knorviaAutomationCreateResultSchema = z
  .object({ automation: knorviaAutomationProtocolSchema })
  .strict();
export type KnorviaAutomationCreateProtocolResult = z.infer<typeof knorviaAutomationCreateResultSchema>;

export const knorviaAutomationUpdateParamsSchema = z
  .object({
    automationId: nonEmptyString,
    title: nonEmptyString.optional(),
    cronExpr: nonEmptyString.optional(),
    prompt: nonEmptyString.optional(),
    recurring: z.boolean().optional(),
    maxRuns: z.number().int().positive().nullable().optional(),
    // 会话侧自定义重复 carrier（同 create 侧语义）。
    intervalUnit: knorviaAutomationIntervalUnitSchema.optional(),
    interval: z.number().int().min(1).max(200).optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.title !== undefined ||
      input.cronExpr !== undefined ||
      input.prompt !== undefined ||
      input.recurring !== undefined ||
      input.maxRuns !== undefined ||
      input.intervalUnit !== undefined,
    { message: "automation update requires at least one field" },
  )
  .refine((input) => input.maxRuns !== null || input.recurring === true, {
    message: "clearing maxRuns requires recurring=true",
    path: ["maxRuns"],
  })
  .refine((input) => input.recurring !== true || typeof input.maxRuns !== "number", {
    message: "recurring=true cannot be combined with a numeric maxRuns",
    path: ["maxRuns"],
  })
  // intervalUnit 与 interval 必须配对提交（同 create 侧语义）。
  .refine((input) => (input.intervalUnit === undefined) === (input.interval === undefined), {
    message: "intervalUnit and interval must be set together",
    path: ["interval"],
  })
  .refine((input) => input.intervalUnit === undefined || input.recurring !== false, {
    message: "intervalUnit is a recurring carrier and cannot combine with recurring=false",
    path: ["recurring"],
  })
  .refine(
    (input) =>
      input.intervalUnit === undefined ||
      input.maxRuns === undefined ||
      (input.maxRuns === null && input.recurring === true),
    {
      message:
        "intervalUnit is a recurring carrier and only allows maxRuns=null with recurring=true",
      path: ["maxRuns"],
    },
  );
export type KnorviaAutomationUpdateProtocolParams = z.infer<typeof knorviaAutomationUpdateParamsSchema>;
export const knorviaAutomationUpdateResultSchema = z
  .object({ automation: knorviaAutomationProtocolSchema })
  .strict();
export type KnorviaAutomationUpdateProtocolResult = z.infer<typeof knorviaAutomationUpdateResultSchema>;

export const knorviaAutomationListParamsSchema = z.object({}).strict();
export type KnorviaAutomationListProtocolParams = z.infer<typeof knorviaAutomationListParamsSchema>;
export const knorviaAutomationListResultSchema = z
  .object({ automations: z.array(knorviaAutomationProtocolSchema) })
  .strict();
export type KnorviaAutomationListProtocolResult = z.infer<typeof knorviaAutomationListResultSchema>;

export const knorviaAutomationCheckTaskBindingParamsSchema = z
  .object({ targetTaskId: nonEmptyString })
  .strict();
export type KnorviaAutomationCheckTaskBindingProtocolParams = z.infer<
  typeof knorviaAutomationCheckTaskBindingParamsSchema
>;
export const knorviaAutomationCheckTaskBindingResultSchema = z
  .object({ bound: z.boolean() })
  .strict();
export type KnorviaAutomationCheckTaskBindingProtocolResult = z.infer<
  typeof knorviaAutomationCheckTaskBindingResultSchema
>;

export const knorviaAutomationDeleteParamsSchema = z
  .object({ automationId: nonEmptyString })
  .strict();
export type KnorviaAutomationDeleteProtocolParams = z.infer<typeof knorviaAutomationDeleteParamsSchema>;
export const knorviaAutomationDeleteResultSchema = z.object({ deleted: z.boolean() }).strict();
export type KnorviaAutomationDeleteProtocolResult = z.infer<typeof knorviaAutomationDeleteResultSchema>;

// ---- Off-Peak（闲时任务）会话内创建协议----
// 与 automation 兄弟并列（独立域，禁止互相复用标记/表）。workspace 由 host 端从
// 当前 session 注入，不进协议参数（对称 automation/create）。permissionMode 只开放产品
// 四档词表；缺省解析在 host 端（yolo / allowed_models 末位 / 最高推理档）。
export const knorviaOffPeakPermissionModeSchema = z.enum(["build", "edit", "plan", "yolo"]);
export type KnorviaOffPeakProtocolPermissionMode = z.infer<typeof knorviaOffPeakPermissionModeSchema>;

export const knorviaOffPeakCreateParamsSchema = z
  .object({
    title: nonEmptyString,
    prompt: nonEmptyString,
    permissionMode: knorviaOffPeakPermissionModeSchema.optional(),
    model: nonEmptyString.optional(),
    thoughtLevel: nonEmptyString.optional(),
    // 会话内创建绑定当前会话（对齐 automation/create 的 targetTaskId），由 CLI 端口填入。
    boundSessionId: nonEmptyString.optional(),
  })
  .strict();
export type KnorviaOffPeakCreateProtocolParams = z.infer<typeof knorviaOffPeakCreateParamsSchema>;

// 协议侧任务快照：轮尾卡片与 OffPeakList 的最小字段面。
// 不暴露 serverTicketId（跨边界禁带）。
export const knorviaOffPeakTaskSnapshotSchema = z
  .object({
    offPeakTaskId: nonEmptyString,
    title: z.string(),
    status: z.enum(["queued", "paused", "running", "completed", "failed", "cancelled"]),
    queuePosition: z.number().int().positive().optional(),
    sessionId: nonEmptyString.optional(),
    createdAt: z.number().int().nonnegative(),
  })
  .strict();
export type KnorviaOffPeakTaskProtocolSnapshot = z.infer<typeof knorviaOffPeakTaskSnapshotSchema>;

// 失败分类跨协议保真（镜像 shared OffPeakTaskCreateResult 的判别联合，错误不降级为字符串）。
// model 白名单预校失败复用 client_validation 分类 + errorCode "model_not_allowed"，不扩分类枚举。
export const knorviaOffPeakCreateResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), task: knorviaOffPeakTaskSnapshotSchema }).strict(),
  z
    .object({
      ok: z.literal(false),
      failureStage: z.enum(["client_validation", "ticket_request", "local_persist"]),
      errorCategory: z.enum([
        "client_validation",
        "eligibility_3101",
        "quota_3103",
        "network",
        "invalid_response",
        "local_persist",
        "unknown",
      ]),
      errorCode: z.string(),
    })
    .strict(),
]);
export type KnorviaOffPeakCreateProtocolResult = z.infer<typeof knorviaOffPeakCreateResultSchema>;

export const knorviaOffPeakListParamsSchema = z.object({}).strict();
export type KnorviaOffPeakListProtocolParams = z.infer<typeof knorviaOffPeakListParamsSchema>;
export const knorviaOffPeakListResultSchema = z
  .object({ tasks: z.array(knorviaOffPeakTaskSnapshotSchema) })
  .strict();
export type KnorviaOffPeakListProtocolResult = z.infer<typeof knorviaOffPeakListResultSchema>;

export const knorviaProtocolMethods = {
  runtimeCapabilities: "runtime/capabilities",
  computerUseOperationEvent: "computer-use/operation-event",
  sessionCreate: "session/create",
  sessionResume: "session/resume",
  sessionList: "session/list",
  sessionSubagents: "session/subagents",
  sessionRequestRuntimePreferences: "session/requestRuntimePreferences",
  sessionRead: "session/read",
  sessionMessages: "session/messages",
  sessionEvents: "session/events",
  sessionDebug: "session/debug",
  sessionSubscribe: "session/subscribe",
  // @deprecated（部分）：send 主路径已收敛 v4 sendText；仅剩 adapter 附件
  // 回退分支消费（v4 attachmentRef 上传/寄存命令面未建模），待附件命令面落地后移除。
  sessionSend: "session/send",
  // @deprecated：host 客户端方法已删（stop 已收敛 v4 stop 命令）。
  // wire case 留兼容（transport bypass 名单仍引用），随旧词整体删除时一并移除。
  sessionStop: "session/stop",
  // @deprecated：host 客户端方法已删（已收敛 v4 cancelBackgroundWork 命令）。
  // wire case 留兼容，随旧词整体删除时一并移除。
  sessionCancelBackgroundTask: "session/cancelBackgroundTask",
  // @deprecated：host 客户端方法已删（v4 forkAssistant 原生 handler 经
  // forkSessionAtMessage 钩子直调 server-operations.forkSession op）。wire case 与
  // fork params/result schema 保留＝op 存活面；fork record 归 v4 原生重写。
  sessionFork: "session/fork",
  sessionCompact: "session/compact",
  sessionGoal: "session/goal",
  sessionClose: "session/close",
  // setModel 仍被 sessionService 的 desktop 旧链路消费；replayable
  // switchModelConfig 已直接由目标 Environment Registry 解析 Selection。
  sessionSetModel: "session/setModel",
  // replayable facade 的思考深度/模式已收敛 v4 switchModelConfig/
  // switchCollaborationMode；剩余消费 = sessionService（desktop 旧链路，随
  // 桌面 v4 UI 收口清零）与 setMode 的 auto 值残留（v4 值域刻意排除 auto）。
  sessionSetThoughtLevel: "session/setThoughtLevel",
  sessionSetMode: "session/setMode",
  workspaceReadPresentation: "workspace/readPresentation",
  workspaceHookTrustGrant: "workspace/hooks/trustGrant",
  // 进程级 Account Provider Config 与 workspace 运行目录分离。
  providerUpdateAccountConfig: "provider/updateAccountConfig",
  workspaceUpdateInteractionPreferences: "workspace/updateInteractionPreferences",
  workspaceUpdateModelIoPreferences: "workspace/updateModelIoPreferences",
  // Off-Peak 工具面门禁是 workspace 级事实（灰度 + 本地/远程），由 host 在 agent 就绪时同步；
  // CLI 对 legacy create/resume 与 v4 冷恢复统一读取。旧 CLI method-not-found → host 降级忽略。
  workspaceUpdateOffPeakToolPolicy: "workspace/updateOffPeakToolPolicy",
  // 动态工作流灰度门禁：同 Off-Peak 的同步模式。
  workspaceUpdateDynamicWorkflowPolicy: "workspace/updateDynamicWorkflowPolicy",
  // LLM 执行面在 CLI，直连不可行；消费仅 services 内部
  // （commit message），待 v4 workspace 查询/命令面覆盖后移除。
  workspaceGenerateText: "workspace/generateText",
  workspaceCancelGenerateText: "workspace/cancelGenerateText",
  providerTestModelConnectivity: "provider/testModelConnectivity",
  mcpList: "mcp/list",
  pluginsList: "plugins/list",
  pluginsReferenceCatalog: "plugins/referenceCatalog",
  pluginsReferenceCatalogWithCategory: "plugins/referenceCatalogWithCategory",
  skillsReferenceCatalog: "skills/referenceCatalog",
  // 已保存工作流的 GUI 中枢：workspace 级、无会话。
  workflowsList: "workflows/list",
  workflowsGet: "workflows/get",
  workflowsUpdateMeta: "workflows/updateMeta",
  workflowsDelete: "workflows/delete",
  workflowsRuns: "workflows/runs",
  // 在项目档 / 全局档之间移动同名文件。
  workflowsMove: "workflows/move",
  pluginsResolveSuggestedReference: "plugins/resolveSuggestedReference",
  pluginsSetEnabled: "plugins/setEnabled",
  pluginsOverview: "plugins/overview",
  pluginsMarketplaceAdd: "plugins/marketplace/add",
  pluginsMarketplaceRemove: "plugins/marketplace/remove",
  pluginsMarketplaceUpdate: "plugins/marketplace/update",
  pluginsInstall: "plugins/install",
  pluginsCancelOperation: "plugins/cancelOperation",
  pluginsUninstall: "plugins/uninstall",
  pluginsUpdate: "plugins/update",
  pluginsRestoreBuiltin: "plugins/restoreBuiltin",
  pluginsConfigure: "plugins/configure",
  pluginsResetConfig: "plugins/resetConfig",
  pluginsValidate: "plugins/validate",
  pluginsDescribe: "plugins/describe",
  automationCreate: "automation/create",
  automationUpdate: "automation/update",
  automationCheckTaskBinding: "automation/checkTaskBinding",
  automationList: "automation/list",
  automationDelete: "automation/delete",
  // Off-Peak 会话内创建：与 automation 兄弟并列的独立方法族。
  offPeakCreate: "offPeak/create",
  offPeakList: "offPeak/list",
  // @deprecated：host 消费已清零（agentService 改走 v4/usage/stats）。
  // 仅剩 CLI server 的 wire 兼容 case；随旧词整体删除时一并移除。
  usageStats: "usage/stats",
  // Knorvia Protocol 对 agent 只暴露 session-first 方法；task 是 UI 投影概念，不能泄露进协议方法名。
  // @deprecated：host 已改走 v4/conversation/usage；后续与 usage/stats 一并移除。
  sessionUsage: "session/usage",
  // 资源管理器：CLI 回报其 MCP 子进程 pid 与插件归属（纯内存，无 I/O），采样在 Host 侧完成。
  processChildProcesses: "process/childProcesses",
  interactionRequestPermission: "interaction/requestPermission",
  interactionRequestUserInput: "interaction/requestUserInput",
  interactionRequestProviderRuntimeHeaders: "interaction/requestProviderRuntimeHeaders",
  interactionRequestOfficialMcpAuthHeaders: "interaction/requestOfficialMcpAuthHeaders",
  // browser-use 反向请求由 agent 发起，host 转给 main 中的 CDP executor。
  interactionBrowserList: "interaction/browserList",
  interactionBrowserExecute: "interaction/browserExecute",
} as const;

export type KnorviaProtocolMethod = (typeof knorviaProtocolMethods)[keyof typeof knorviaProtocolMethods];

export const knorviaProtocolEmptyResultSchema = z.object({}).strict();

// 最新 V4 主链已不再依赖旧版全量方法表；这里仅保留仍被兼容测试和 browser broker
// 消费的最小契约集合，避免重新引入已移除的 legacy 方法。
export const knorviaProtocolSessionMethodContracts = {
  [knorviaProtocolMethods.workspaceHookTrustGrant]: {
    params: knorviaWorkspaceHookTrustGrantParamsSchema,
    result: knorviaWorkspaceHookTrustGrantResultSchema,
  },
  [knorviaProtocolMethods.mcpList]: {
    params: knorviaMcpListParamsSchema,
    result: knorviaMcpListResultSchema,
  },
  [knorviaProtocolMethods.interactionBrowserList]: {
    params: knorviaBrowserListParamsSchema,
    result: knorviaBrowserListResultSchema,
  },
  [knorviaProtocolMethods.interactionBrowserExecute]: {
    params: knorviaBrowserExecuteParamsSchema,
    result: knorviaBrowserExecuteResultSchema,
  },
} as const satisfies Partial<
  Record<KnorviaProtocolMethod, { params: z.ZodTypeAny; result: z.ZodTypeAny }>
>;

export type KnorviaProtocolSessionMethodContract =
  (typeof knorviaProtocolSessionMethodContracts)[keyof typeof knorviaProtocolSessionMethodContracts];

/** 仅存储准备子进程的私有控制帧，原始路径不进入业务事件或遥测。 */
export const knorviaStoragePreparationFrameSchema = z.discriminatedUnion("method", [
  z
    .object({
      method: z.literal("startup/storagePath"),
      params: z.object({ path: z.string().min(1).max(32768) }).strict(),
    })
    .strict(),
  z
    .object({ method: z.literal("startup/storagePrepared"), params: z.object({}).strict() })
    .strict(),
  z
    .object({ method: z.literal("startup/storageState"), params: knorviaStorageStartupStateSchema })
    .strict(),
]);
export const knorviaStoragePathReadySchema = z
  .object({ method: z.literal("startup/storagePathReady"), reuse: z.boolean().optional() })
  .strict();
export * from "../localTtft.js";

// 桌面本地 TTFT 的严格事实合同；检查点不能替代实际内容帧。
export { localTtftFactsSchema } from "../localTtft.js";
