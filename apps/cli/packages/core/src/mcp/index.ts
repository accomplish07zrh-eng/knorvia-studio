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

const observationTitlePolicy: JsonSchema = {
  type: "string",
  minLength: 1,
  maxLength: 120,
  description:
    "Required short user-facing title in the user's language that describes why the app interface is being read without implementation terms such as CUA, MCP, or get_app_state",
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
    const authority = options.officialCuaServerNames?.has(descriptor.serverName) === true;
    const descriptorName = toMcpToolName(descriptor);
    const modelName =
      authority && descriptor.serverName === KNORVIA_CUA_OFFICIAL_MCP_SERVER_NAME
        ? `${canonicalPrefix}${toModelVisibleMcpNamePart(descriptor.toolName)}`
        : toMcpToolName(descriptor);
    if (allowed && !allowed.has(modelName) && !allowed.has(descriptorName)) continue;
    if (denied?.has(modelName) || denied?.has(descriptorName)) continue;

    const trustedWindows = isTrustedWindowsComputerUseTool(
      descriptor,
      options.trustedWindowsComputerUseServerNames,
    );
    const windowsAccessRequest =
      trustedWindows && descriptor.toolName === "computer_request_access";
    const readOnly = trustedWindows
      ? descriptor.toolName === "computer_list_windows" ||
        descriptor.toolName === "computer_observe"
      : descriptor.annotations?.readOnlyHint === true;
    const destructive = trustedWindows
      ? descriptor.toolName === "computer_action"
      : descriptor.annotations?.destructiveHint === true;
    const hostExecution = descriptor.serverName === "node_repl" && descriptor.toolName === "js";
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

export const McpToolOutputJsonSchema: JsonSchema = {
  type: "object",
  required: ["content"],
  properties: {
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
  },
  additionalProperties: false,
} satisfies JsonSchema;

function bridgeInputSchema(schema: JsonSchema, observation: boolean): JsonSchema {
  let normalized: JsonSchema;
  if (!schema || typeof schema !== "object") {
    normalized = { type: "object", properties: {}, additionalProperties: true };
  } else {
    const properties = schema.properties;
    normalized = {
      ...schema,
      type: "object",
      properties:
        properties && typeof properties === "object" && !Array.isArray(properties)
          ? properties
          : {},
    };
  }
  if (!observation) return normalized;
  const required = Array.isArray(normalized.required)
    ? normalized.required.filter((value): value is string => typeof value === "string")
    : [];
  return {
    ...normalized,
    properties: {
      ...(normalized.properties as Record<string, unknown>),
      title: observationTitlePolicy,
    },
    required: [...new Set([...required, "title"])],
  };
}

function needsObservationTitle(descriptor: McpToolDescriptor): boolean {
  if (descriptor.toolName.trim().toLowerCase().replace(/-/g, "_") !== "get_app_state") return false;
  if (descriptor.serverName === KNORVIA_CUA_OFFICIAL_MCP_SERVER_NAME) return true;
  const server = descriptor.serverName.trim().toLowerCase().replace(/_/g, "-");
  return (
    server === "knorvia-cua" ||
    server === "zcode-cua" ||
    server === "computer-use" ||
    ((server.includes("knorvia-cua") || server.includes("zcode-cua")) &&
      server.includes("computer-use"))
  );
}
