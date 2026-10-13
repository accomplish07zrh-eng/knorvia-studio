import {
  type JsonSchema,
  type McpPort,
  type McpToolDescriptor,
  type ModelToolSideEffectScope,
  type PermissionCapabilityGroup,
  type RiskLevel,
} from "@knorvia/contracts";
import { KNORVIA_CUA_OFFICIAL_MCP_NAMESPACE_NAME as KNORVIA_CUA_OFFICIAL_MCP_SERVER_NAME } from "@knorvia/shared";
import { OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION } from "@knorvia/cua/frame-contract";
import type { ToolRegistry } from "../tool/registry.js";
import type { ToolEntry } from "../tool/types.js";
import { createToolRuleNameSet } from "../tool/tool-visibility.js";
import { normalizeMcpToolResultForModel } from "./image-normalization.js";
import { toMcpToolName, toModelVisibleMcpNamePart } from "./name.js";
import {
  isTrustedWindowsComputerUseTool,
  preserveWindowsComputerUseFrames,
} from "./windows-computer-use.js";
import { formatMcpToolResult } from "./result-format.js";

export { toMcpToolName } from "./name.js";
export {
  HOST_NODE_REPL_IMAGE_MAX_DIMENSION,
  MCP_IMAGE_INLINE_BASE64_BYTES,
  MCP_IMAGE_INLINE_RAW_BYTES,
} from "./image-normalization.js";

export interface RegisterMcpToolsOptions {
  allowedTools?: readonly string[];
  disallowedTools?: readonly string[];
  officialCuaServerNames?: ReadonlySet<string>;
  trustedWindowsComputerUseServerNames?: ReadonlySet<string>;
}

// 观察标题的模型提示词：逐字保留（含不用 CUA、MCP、get_app_state 等实现术语的要求）。
const OBSERVATION_TITLE_DESCRIPTION =
  "Required short user-facing title in the user's language that describes why the app interface is being read without implementation terms such as CUA, MCP, or get_app_state";

const observationTitlePolicy: JsonSchema = {
  type: "string",
  minLength: 1,
  maxLength: 120,
  description: OBSERVATION_TITLE_DESCRIPTION,
};

// 单个描述符的命名与授权信息：官方 CUA 命名空间用规范化前缀拼接，其余沿用 toMcpToolName。
const mcpDescriptorNames = (
  descriptor: McpToolDescriptor,
  options: RegisterMcpToolsOptions,
  canonicalPrefix: string,
): { authority: boolean; descriptorName: string; modelName: string } => {
  const authority = options.officialCuaServerNames?.has(descriptor.serverName) === true;
  const descriptorName = toMcpToolName(descriptor);
  const modelName =
    authority && descriptor.serverName === KNORVIA_CUA_OFFICIAL_MCP_SERVER_NAME
      ? `${canonicalPrefix}${toModelVisibleMcpNamePart(descriptor.toolName)}`
      : toMcpToolName(descriptor);
  return { authority, descriptorName, modelName };
};

// 名单过滤：不在允许名单（若给定）或命中拒绝名单的描述符直接跳过。
type McpNameSet = { has(value: string): boolean } | undefined;

const isMcpDescriptorExcluded = (
  names: { descriptorName: string; modelName: string },
  allowed: McpNameSet,
  denied: McpNameSet,
): boolean => {
  const blockedByAllowList =
    allowed !== undefined && !allowed.has(names.modelName) && !allowed.has(names.descriptorName);
  const blockedByDenyList =
    denied?.has(names.modelName) === true || denied?.has(names.descriptorName) === true;
  return blockedByAllowList || blockedByDenyList;
};

// 单个描述符的执行策略：受信 Windows CUA 走窄工具策略，其余按注解与主机上下文判定。
const mcpDescriptorPolicy = (
  descriptor: McpToolDescriptor,
  options: RegisterMcpToolsOptions,
): {
  destructive: boolean;
  hostExecution: boolean;
  readOnly: boolean;
  trustedWindows: boolean;
  windowsAccessRequest: boolean;
} => {
  const trustedWindows = isTrustedWindowsComputerUseTool(
    descriptor,
    options.trustedWindowsComputerUseServerNames,
  );
  const windowsAccessRequest = trustedWindows && descriptor.toolName === "computer_request_access";
  const readOnly = trustedWindows
    ? descriptor.toolName === "computer_list_windows" || descriptor.toolName === "computer_observe"
    : descriptor.annotations?.readOnlyHint === true;
  const destructive = trustedWindows
    ? descriptor.toolName === "computer_action"
    : descriptor.annotations?.destructiveHint === true;
  const hostExecution = descriptor.serverName === "node_repl" && descriptor.toolName === "js";
  return { destructive, hostExecution, readOnly, trustedWindows, windowsAccessRequest };
};

export function registerMcpTools(
  registry: ToolRegistry,
  mcpPort: McpPort,
  descriptors: readonly McpToolDescriptor[],
  options: RegisterMcpToolsOptions = {},
): string[] {
  const allowed = options.allowedTools ? new Set(options.allowedTools) : undefined;
  const denied = createToolRuleNameSet(options.disallowedTools);
  const registered: string[] = [];
  const canonicalPrefix = "mcp__computer-use__";

  for (const descriptor of descriptors) {
    const { authority, descriptorName, modelName } = mcpDescriptorNames(
      descriptor,
      options,
      canonicalPrefix,
    );
    if (isMcpDescriptorExcluded({ descriptorName, modelName }, allowed, denied)) continue;

    const { destructive, hostExecution, readOnly, trustedWindows, windowsAccessRequest } =
      mcpDescriptorPolicy(descriptor, options);
    const sideEffectScope: ModelToolSideEffectScope =
      hostExecution || trustedWindows ? "system" : "network";
    const riskLevel: RiskLevel =
      hostExecution || windowsAccessRequest || destructive ? "high" : readOnly ? "low" : "medium";
    const needsApproval = !trustedWindows || windowsAccessRequest;
    const timeoutMs = descriptor.timeoutMs ?? 30000;
    const observation = needsObservationTitle(descriptor);
    const aliasSuffix =
      authority &&
      descriptor.serverName === KNORVIA_CUA_OFFICIAL_MCP_SERVER_NAME &&
      modelName.startsWith(canonicalPrefix)
        ? modelName.slice(canonicalPrefix.length)
        : "";
    const resultBudget: ToolEntry["resultBudget"] =
      authority || trustedWindows
        ? {
            maxInlineBytes: 256 * 1024,
            maxModelBytes: 256 * 1024,
            strategy: "truncate",
            preview: { direction: "head" },
          }
        : hostExecution
          ? {
              maxInlineBytes: 1000000,
              maxModelBytes: 64 * 1024,
              strategy: "artifact",
              preview: { direction: "tail", maxBytes: 64 * 1024 },
              artifact: { enabled: true, retention: "session" },
            }
          : {
              maxInlineBytes: 100000,
              maxModelBytes: 50000,
              strategy: "truncate",
              preview: { direction: "head" },
            };

    const entry: ToolEntry = {
      ...(windowsAccessRequest ? { approvalAuthority: "user" as const } : {}),
      aliases: aliasSuffix ? [`mcp__computer_use__${aliasSuffix}`] : undefined,
      capability: `MCP tool exposed by ${descriptor.serverName}: ${descriptor.toolName}`,
      ...(authority
        ? {
            permissionCapabilityGroup: "official_cua" as PermissionCapabilityGroup,
            modelContentProtection: OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION,
          }
        : {}),
      inputSchema: bridgeInputSchema(descriptor.inputSchema, observation),
      outputSchema: McpToolOutputJsonSchema,
      metadata: {
        concurrentSafe: trustedWindows
          ? descriptor.toolName === "computer_stop" ||
            descriptor.toolName === "computer_list_windows"
          : readOnly || descriptor.annotations?.idempotentHint === true,
        destructive,
        description: descriptor.description,
        name: modelName,
        mcpPresentation: {
          serverName: descriptor.serverName,
          toolName: descriptor.toolName,
          ...(descriptor.description ? { description: descriptor.description } : {}),
          ...(descriptor.official ? { official: true } : {}),
        },
        needsApproval,
        readOnly,
        riskLevel,
        sideEffectScope,
        timeoutMs,
      },
      permission: {
        permission: "mcp",
        reason: `MCP tool ${descriptor.serverName}/${descriptor.toolName} executes through an external server`,
        riskLevel,
        sideEffectScope,
        needsApproval,
        patternSources: ["toolName", "input", "network"],
        denyPriority: "beforeAsk",
        ...(trustedWindows ? { alwaysAsk: true, askOptions: { allowAlways: false } } : {}),
      },
      ...(trustedWindows && !windowsAccessRequest
        ? {
            prepareApproval: () => ({ gate: "proceed" as const }),
          }
        : {}),
      resultBudget,
      timeout: { defaultMs: timeoutMs, allowCallOverride: false },
      cancellation: {
        supported: true,
        cleanup: "bestEffort",
        userVisibleMessage: `MCP tool ${modelName} was cancelled`,
      },
      trace: {
        required: true,
        propagateToAdapters: true,
        recordInput: "summary",
        recordOutput: "summary",
      },
      handler: async (input, context) => {
        const record =
          input && typeof input === "object" && !Array.isArray(input)
            ? (input as Record<string, unknown>)
            : {};
        let argumentsRecord = record;
        if (observation && "title" in record) {
          argumentsRecord = { ...record };
          delete argumentsRecord.title;
        }
        const result = await mcpPort.callTool(
          {
            serverName: descriptor.serverName,
            toolName: descriptor.toolName,
            arguments: argumentsRecord,
            trace: {
              traceId: context.traceId,
              spanId: context.spanId,
              parentSpanId: context.parentSpanId,
              sessionId: context.sessionId,
              turnId: context.turnId,
            },
            runtimeScope: context.runtimeScope ?? "main",
            workspacePath: context.workingDirectory,
            ...(context.remoteSessionId ? { remoteSessionId: context.remoteSessionId } : {}),
            ...(context.workspaceIdentity?.trim()
              ? {
                  workspaceIdentity: context.workspaceIdentity.trim(),
                  workspaceKey: context.workspaceIdentity.trim(),
                }
              : { workspaceKey: context.workingDirectory }),
            ...(context.turnId ? { turnId: context.turnId } : {}),
            clientMode: context.clientMode ?? "desktop-continuous",
            deliveryKind: context.deliveryKind ?? "desktop-continuous",
          },
          { signal: context.abortSignal, timeoutMs },
        );
        if (trustedWindows) return preserveWindowsComputerUseFrames(result);
        return normalizeMcpToolResultForModel({
          compressOversizedImages: hostExecution,
          context,
          descriptor,
          preserveOfficialCuaFrames: authority,
          result,
          toolName: modelName,
        });
      },
      formatModelContent: (output) => formatMcpToolResult(output, trustedWindows),
    };
    registry.register(entry);
    registered.push(modelName);
  }
  return registered;
}

// MCP 工具输出的协议片段：必填字段与属性表各自具名，字段名与嵌套结构逐字保留。
const MCP_TOOL_OUTPUT_REQUIRED = ["content"] as const;

const MCP_TOOL_OUTPUT_PROPERTIES = {
  content: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: true,
    },
  },
  structuredContent: {},
  isError: {
    type: "boolean",
  },
  _meta: {
    type: "object",
    additionalProperties: true,
  },
};

export const McpToolOutputJsonSchema: JsonSchema = {
  type: "object",
  required: [...MCP_TOOL_OUTPUT_REQUIRED],
  properties: MCP_TOOL_OUTPUT_PROPERTIES,
  additionalProperties: false,
} satisfies JsonSchema;

// 归一化：非对象入参回落到空对象 schema；对象入参补 type 并保证 properties 是对象。
function normalizeInputSchema(schema: JsonSchema): JsonSchema {
  if (!schema || typeof schema !== "object") {
    return { type: "object", properties: {}, additionalProperties: true };
  }
  const properties = schema.properties;
  const safeProperties =
    properties && typeof properties === "object" && !Array.isArray(properties) ? properties : {};
  return { ...schema, type: "object", properties: safeProperties };
}

// required 里只保留字符串项：非数组或非字符串项一律丢弃。
function stringRequiredFields(schema: JsonSchema): string[] {
  if (!Array.isArray(schema.required)) return [];
  return schema.required.filter((value): value is string => typeof value === "string");
}

// 观察模式：在属性表上追加 title 策略，并把 title 并入必填项（去重）。
function withObservationTitle(schema: JsonSchema, required: string[]): JsonSchema {
  return {
    ...schema,
    properties: {
      ...(schema.properties as Record<string, unknown>),
      title: observationTitlePolicy,
    },
    required: [...new Set([...required, "title"])],
  };
}

function bridgeInputSchema(schema: JsonSchema, observation: boolean): JsonSchema {
  const normalized = normalizeInputSchema(schema);
  if (!observation) return normalized;
  return withObservationTitle(normalized, stringRequiredFields(normalized));
}

// 工具名比对形式：去首尾空白、小写，并把连字符折成下划线。
const normalizeToolNameForComparison = (name: string): string =>
  name.trim().toLowerCase().replace(/-/g, "_");

// 服务名比对形式：去首尾空白、小写，并把下划线折成连字符。
const normalizeServerNameForComparison = (name: string): string =>
  name.trim().toLowerCase().replace(/_/g, "-");

function needsObservationTitle(descriptor: McpToolDescriptor): boolean {
  if (normalizeToolNameForComparison(descriptor.toolName) !== "get_app_state") return false;
  if (descriptor.serverName === KNORVIA_CUA_OFFICIAL_MCP_SERVER_NAME) return true;
  const server = normalizeServerNameForComparison(descriptor.serverName);
  return (
    server === "knorvia-cua" ||
    server === "zcode-cua" ||
    server === "computer-use" ||
    ((server.includes("knorvia-cua") || server.includes("zcode-cua")) &&
      server.includes("computer-use"))
  );
}
