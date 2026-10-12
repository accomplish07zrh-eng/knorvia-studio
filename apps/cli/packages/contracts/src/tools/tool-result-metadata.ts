import { z } from "zod";
import { OFFICIAL_MCP_TOOL_ERROR_CODES } from "@knorvia/shared";

import {
  CREATE_WORKFLOW_DISPLAY_MAX_DIAGNOSTICS,
  CreateWorkflowCausalityGraphSchema,
  createWorkflowToolResultDisplayDiagnosticSchema,
} from "./create-workflow.js";
import {
  evalWorkflowSnippetToolResultDisplayPayloadSchema,
  getWorkflowRunToolResultDisplayPayloadSchema,
  listModelsToolResultDisplayPayloadSchema,
  listWorkflowRunsToolResultDisplayPayloadSchema,
  resumeWorkflowRunToolResultDisplayPayloadSchema,
  savedWorkflowListToolResultDisplayPayloadSchema,
} from "./workflow-observation-display.js";

export const COMPLETED_TOOL_PART_METADATA_SCHEMA_VERSION = 1;
export const TASK_OUTPUT_DISPLAY_MAX_STATUS_CHARS = 64;
export const TASK_OUTPUT_DISPLAY_MAX_OUTPUT_CHARS = 2_000;
export const MCP_TOOL_DISPLAY_MAX_NAME_CHARS = 256;
export const MCP_TOOL_DISPLAY_MAX_DESCRIPTION_CHARS = 4 * 1024;
export const CUA_TARGET_APP_DISPLAY_META_KEY = "knorvia.cua/target-app-display-v1" as const;

export const applicationIconLocatorSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("darwin-bundle-id"), value: z.string().trim().min(1).max(512) })
    .strict(),
  z
    .object({
      kind: z.literal("windows-executable-path"),
      value: z.string().trim().min(1).max(32_768),
    })
    .strict(),
  z.object({ kind: z.literal("windows-aumid"), value: z.string().trim().min(1).max(512) }).strict(),
]);

export const cuaTargetAppDisplaySchema = z
  .object({
    schemaVersion: z.literal(1),
    displayName: z.string().trim().min(1).max(512).optional(),
    iconLocators: z.array(applicationIconLocatorSchema).max(3),
  })
  .strict();

export const cuaRequestAccessStatusDisplaySchema = z
  .object({
    schemaVersion: z.literal(1),
    platform: z.literal("darwin"),
    grantOwner: z.string().trim().min(1).max(512),
    accessibility: z.enum(["granted", "stale", "denied"]),
    screenRecording: z.enum(["granted", "denied", "unknown"]),
  })
  .strict();

// CreateWorkflow display 诊断的限长常量与条目 schema 已移至 create-workflow.ts
// （被 create_workflow 与 eval_workflow_snippet 两个 display payload 复用，放这里会成环）。

export const toolResultDisplayDiffHunkSchema = z
  .object({
    oldStart: z.number().int(),
    oldLines: z.number().int(),
    newStart: z.number().int(),
    newLines: z.number().int(),
    lines: z.array(z.string()),
  })
  .strict();

export const fileDiffToolResultDisplayPayloadSchema = z
  .object({
    kind: z.literal("file_diff"),
    filePath: z.string().min(1),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
    structuredPatch: z.array(toolResultDisplayDiffHunkSchema),
    truncated: z.boolean().optional(),
  })
  .strict();

export const localAgentMessageToolResultDisplayPayloadSchema = z
  .object({
    kind: z.literal("local_agent_message"),
    status: z.enum(["success", "failed"]),
    error: z.string().optional(),
    message: z.string().optional(),
  })
  .strict();

export const taskStopToolResultDisplayPayloadSchema = z
  .object({
    kind: z.literal("task_stop"),
    taskId: z.string().min(1),
    taskType: z.string().min(1),
    command: z.string().min(1).optional(),
    message: z.string().min(1),
    truncated: z.boolean().optional(),
  })
  .strict();

export const taskOutputToolResultDisplayPayloadSchema = z
  .object({
    kind: z.literal("task_output"),
    retrievalStatus: z.enum(["success", "not_ready", "timeout"]),
    taskStatus: z.string().min(1).max(TASK_OUTPUT_DISPLAY_MAX_STATUS_CHARS).optional(),
    output: z.string().min(1).max(TASK_OUTPUT_DISPLAY_MAX_OUTPUT_CHARS).optional(),
    truncated: z.literal(true).optional(),
  })
  .strict();

export const respondToCoordinatorToolResultDisplayPayloadSchema = z
  .object({
    kind: z.literal("respond_to_coordinator"),
    status: z.enum(["success", "failed"]),
  })
  .strict();

export const cuaToolResultDisplayPayloadSchema = z
  .object({
    kind: z.literal("cua"),
    schemaVersion: z.literal(1),
    toolName: z.string().min(1),
    status: z.enum(["success", "failed"]),
    // 旧 v1 历史记录曾重复携带 ToolCallRow.input；只为回放兼容继续接受，新 producer 不再写入。
    input: z.string().optional(),
    structuredContent: z.string().optional(),
    text: z.string().optional(),
    errorCode: z.string().optional(),
    suggestedAction: z.string().optional(),
    targetApp: cuaTargetAppDisplaySchema.optional(),
    permissionStatus: cuaRequestAccessStatusDisplaySchema.optional(),
    media: z
      .array(
        z
          .object({
            mimeType: z.string().min(1),
            // 256 KiB 原始图片编码后的最大 base64 长度；总预算由投影器执行。
            data: z.string().min(1).max(349_528).optional(),
            artifactUri: z.string().min(1).optional(),
          })
          .strict(),
      )
      .max(4)
      .optional(),
    truncated: z.boolean().optional(),
  })
  .strict();

// node_repl cell 要投影的「应用身份」。appKey 用 producer 的形态：macOS 是 darwin:<bundleId>，
// Windows 是 windows-aumid:<aumid> 或 windows-exe:<path>，Linux 是 linux-exe:<path>。
// 图标字节不进协议：UI 按前缀自行推导 ApplicationIconLocator，再交给平台服务解析。
export const nodeReplCuaAppDisplaySchema = z
  .object({
    appKey: z.string().trim().min(1).max(2_048),
    displayName: z.string().trim().min(1).max(512).optional(),
  })
  .strict();

export const nodeReplImageToolResultDisplayPayloadSchema = z
  .object({
    kind: z.literal("node_repl_images"),
    // images 可选而不是 min(1)：CUA 的纯动作 cell（点击、输入）没有截图，但仍要投影 app 身份。
    // kind 名保留为 node_repl_images —— 改名会让已持久化的 row 在 strict union 里整段被剥掉。
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
      .max(2)
      .optional(),
    app: nodeReplCuaAppDisplaySchema.optional(),
    truncated: z.boolean().optional(),
    source: z.literal("browser_turn_end").optional(),
  })
  .strict();

export const mcpToolResultDisplayPayloadSchema = z
  .object({
    kind: z.literal("mcp_tool"),
    serverName: z.string().min(1).max(MCP_TOOL_DISPLAY_MAX_NAME_CHARS),
    toolName: z.string().min(1).max(MCP_TOOL_DISPLAY_MAX_NAME_CHARS),
    description: z.string().min(1).max(MCP_TOOL_DISPLAY_MAX_DESCRIPTION_CHARS).optional(),
    // 官方 Server 判定本次调用不可用时带下来的结构化标识（额度耗尽 / 无 Coding Plan）。
    // 只在 tool result 是 isError 且 MCP 来自官方时出现，UI 据此在输入框上方提示；
    // code 取值与 @knorvia/shared 的 OFFICIAL_MCP_TOOL_ERROR_CODES 同源。
    unavailable: z
      .object({ code: z.enum(OFFICIAL_MCP_TOOL_ERROR_CODES) })
      .strict()
      .optional(),
  })
  .strict();

// 注意：这里的字段集合是冻结的。既有 kind 上多出一个键，不是「旧客户端忽略它」那么轻——
// 两个真实的 strict 解析点（packages/ui 的 create-workflow renderer safeParse，以及 legacy v3
// 的按 kind 查表）会把**整条**工具结果丢掉。gate 专属的事实一律走工具入参通道
// （那一侧对所有版本都没有 schema），可复用工作流的 saved 来源就是这么做的。
export const createWorkflowToolResultDisplayPayloadSchema = z
  .object({
    kind: z.literal("create_workflow"),
    ok: z.boolean(),
    errorCount: z.number().int().nonnegative(),
    diagnostics: z
      .array(createWorkflowToolResultDisplayDiagnosticSchema)
      .max(CREATE_WORKFLOW_DISPLAY_MAX_DIAGNOSTICS),
    // 工具输出边界已限长（见 create-workflow.ts 的图 schema），display 直接复用同一契约。
    causalityGraph: CreateWorkflowCausalityGraphSchema.optional(),
    truncated: z.boolean().optional(),
  })
  .strict();

// 「拒绝未知键」在本文件多处出现，规则只在这里写一次。
const strictRecord = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

// contracts 用 zod v3、App 用 v4，两份实例不能拼；形状与 shared/bash-output-display.ts 同一严格契约。
const bashOutputDisplaySchema = strictRecord({
  kind: z.literal("bash_output"),
  output: z.string().max(150_000),
  truncated: z.boolean(),
  outputPath: z.string().min(1).max(32_768).optional(),
});

export const toolResultDisplayPayloadSchema = z.discriminatedUnion("kind", [
  bashOutputDisplaySchema,
  fileDiffToolResultDisplayPayloadSchema,
  localAgentMessageToolResultDisplayPayloadSchema,
  taskStopToolResultDisplayPayloadSchema,
  taskOutputToolResultDisplayPayloadSchema,
  respondToCoordinatorToolResultDisplayPayloadSchema,
  cuaToolResultDisplayPayloadSchema,
  nodeReplImageToolResultDisplayPayloadSchema,
  mcpToolResultDisplayPayloadSchema,
  createWorkflowToolResultDisplayPayloadSchema,
  getWorkflowRunToolResultDisplayPayloadSchema,
  listWorkflowRunsToolResultDisplayPayloadSchema,
  evalWorkflowSnippetToolResultDisplayPayloadSchema,
  savedWorkflowListToolResultDisplayPayloadSchema,
  listModelsToolResultDisplayPayloadSchema,
  resumeWorkflowRunToolResultDisplayPayloadSchema,
]);

export type FileDiffToolResultDisplayPayload = z.infer<
  typeof fileDiffToolResultDisplayPayloadSchema
>;
export type LocalAgentMessageToolResultDisplayPayload = z.infer<
  typeof localAgentMessageToolResultDisplayPayloadSchema
>;
export type TaskStopToolResultDisplayPayload = z.infer<
  typeof taskStopToolResultDisplayPayloadSchema
>;
export type TaskOutputToolResultDisplayPayload = z.infer<
  typeof taskOutputToolResultDisplayPayloadSchema
>;
export type RespondToCoordinatorToolResultDisplayPayload = z.infer<
  typeof respondToCoordinatorToolResultDisplayPayloadSchema
>;
export type CuaToolResultDisplayPayload = z.infer<typeof cuaToolResultDisplayPayloadSchema>;
export type ApplicationIconLocator = z.infer<typeof applicationIconLocatorSchema>;
export type CuaTargetAppDisplay = z.infer<typeof cuaTargetAppDisplaySchema>;
export type CuaRequestAccessStatusDisplay = z.infer<typeof cuaRequestAccessStatusDisplaySchema>;
export type NodeReplImageToolResultDisplayPayload = z.infer<
  typeof nodeReplImageToolResultDisplayPayloadSchema
>;
export type McpToolResultDisplayPayload = z.infer<typeof mcpToolResultDisplayPayloadSchema>;
export type CreateWorkflowToolResultDisplayPayload = z.infer<
  typeof createWorkflowToolResultDisplayPayloadSchema
>;
export type NodeReplCuaAppDisplay = z.infer<typeof nodeReplCuaAppDisplaySchema>;

export type ToolResultDisplayPayload = z.infer<typeof toolResultDisplayPayloadSchema>;

export const toolResultSerializationMetadataSchema = z
  .object({
    truncated: z.boolean(),
    originalBytes: z.number().int().nonnegative(),
    returnedBytes: z.number().int().nonnegative(),
    budgetStrategy: z.enum(["inline", "truncate", "artifact"]),
    artifactPath: z.string().min(1).optional(),
  })
  .strict();

export type ToolResultSerializationMetadata = z.infer<typeof toolResultSerializationMetadataSchema>;

export const completedToolPartMetadataSchema = z
  .object({
    schemaVersion: z.literal(COMPLETED_TOOL_PART_METADATA_SCHEMA_VERSION),
    display: toolResultDisplayPayloadSchema.optional(),
    serialization: toolResultSerializationMetadataSchema.optional(),
  })
  .passthrough();

export type CompletedToolPartMetadata = z.infer<typeof completedToolPartMetadataSchema>;

export function parseCompletedToolPartMetadata(
  input: unknown,
): CompletedToolPartMetadata | undefined {
  const withScrubbedDisplay =
    isRecord(input) && "display" in input
      ? { ...input, display: scrubStoredDisplay(input.display) }
      : input;
  const parsed = completedToolPartMetadataSchema.safeParse(withScrubbedDisplay);
  return parsed.success ? parsed.data : undefined;
}

export function parseToolResultDisplayPayload(
  input: unknown,
): ToolResultDisplayPayload | undefined {
  const parsed = toolResultDisplayPayloadSchema.safeParse(scrubStoredDisplay(input));
  return parsed.success ? parsed.data : undefined;
}

// 解析前的统一清洗。display 是**落库**的：它写进 tool part 的 metadata.display，此后每次读取
// 都要重新过一遍严格解析，而渲染端对每一帧也有一份镜像 schema。所以剥离只能发生在 CLI 侧、
// 解析之前——上面两个入口就是唯一的卡点，v4 冷启动水合与 session-transcript 回放都经过它。
// 每个 stripper 只认自己那一个 kind，只改在场的键，别的 kind 原样进入解析。
function scrubStoredDisplay(display: unknown): unknown {
  return dropProviderStopFromWorkflowError(dropWithdrawnRefinedNames(display));
}

// 剥掉持久化 get_workflow_run 卡上的 providerStop。早期构造侧曾把只属于模型通道的
// providerStop 一并写进 display，而渲染端的镜像 schema 只认 {code, message}，那些帧一律被拒。
// 构造侧已改，可历史 part 每次冷启动都会被重读，只能在读取侧剥。只认 kind 为
// get_workflow_run、error 是普通对象且 providerStop 在场的载荷；不带该键与缺席的 error
// 原样返回，不凭空添一个 undefined。
function dropProviderStopFromWorkflowError(display: unknown): unknown {
  if (!isRecord(display) || display.kind !== "get_workflow_run") return display;
  const error = display.error;
  if (!isRecord(error) || !("providerStop" in error)) return display;
  return { ...display, error: dropKey(error, "providerStop") };
}

// 已撤回的模型精炼字段。旧 create_workflow display 里车道与阶段可能带 refinedName、
// step 可能带 refinedLabel；这三个键已从 schema 删除，而两个入口都是 strict 解析：
// 不先剥掉，旧会话的整块 display（连同图）会在这里被拒，而不只是丢一个名字。
// 只认 create_workflow 且带 causalityGraph 的载荷，只改在场的键。
const WITHDRAWN_REFINED_FIELDS = [
  ["lanes", "refinedName"],
  ["steps", "refinedLabel"],
  ["phases", "refinedName"],
] as const satisfies readonly (readonly [string, string])[];

function dropWithdrawnRefinedNames(display: unknown): unknown {
  if (!isRecord(display) || display.kind !== "create_workflow") return display;
  const graph = display.causalityGraph;
  if (!isRecord(graph)) return display;
  const cleaned: Record<string, unknown> = { ...graph };
  for (const [listKey, field] of WITHDRAWN_REFINED_FIELDS) {
    if (listKey in graph) cleaned[listKey] = dropKeyFromItems(graph[listKey], field);
  }
  return { ...display, causalityGraph: cleaned };
}

// 数组里每一项各去掉一个键：不是数组就原样返回；元素不是普通对象或本来没有该键也原样保留。
function dropKeyFromItems(items: unknown, key: string): unknown {
  if (!Array.isArray(items)) return items;
  return items.map((item) => dropKey(item, key));
}

// 去掉一个键的副本；该键不在场时返回原对象。
function dropKey(item: unknown, key: string): unknown {
  if (!isRecord(item) || !(key in item)) return item;
  const copy = { ...item };
  delete copy[key];
  return copy;
}

// 普通对象判定：数组与 null 都不算。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
