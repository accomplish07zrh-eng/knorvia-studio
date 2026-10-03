// Original public port/type owner: apps/cli/packages/core/src/tool/registry.ts
import type { ModelToolContract } from "@knorvia/contracts";
import type { ToolEntry, ToolMetadata } from "./types.js";
export interface ToolRegistry {
    register(entry: ToolEntry, options?: ToolRegistryRegisterOptions): void;
    unregister(name: string): void;
    get(name: string): ToolEntry | undefined;
    has(name: string): boolean;
    list(): string[];
    getMetadata(name: string): ToolMetadata | undefined;
    toContracts(): ModelToolContract[];
}
export interface ToolRegistryRegisterOptions {
    silentDuplicateWarning?: boolean;
}

// Original public port/type owner: apps/cli/packages/core/src/tool/tool-visibility.ts
export declare function createToolRuleNameSet(rules: readonly string[] | undefined): ReadonlySet<string> | undefined;

// Original public port/type owner: apps/cli/packages/core/src/mcp/name.ts
import type { McpToolDescriptor } from "@knorvia/contracts";
export declare function toMcpToolName(descriptor: Pick<McpToolDescriptor, "name" | "serverName" | "toolName">): string;
export declare function toModelVisibleMcpNamePart(name: string): string;

// Original public port/type owner: apps/cli/packages/core/src/mcp/windows-computer-use.ts
import type { McpConnectionSnapshot, McpPort, McpToolCallResult, McpToolDescriptor } from "@knorvia/contracts";
export declare function isTrustedWindowsComputerUseTool(descriptor: Pick<McpToolDescriptor, "serverName" | "toolName">, trustedServerNames?: ReadonlySet<string>): boolean;
export declare function preserveWindowsComputerUseFrames(result: McpToolCallResult): McpToolCallResult;

// Original public port/type owner: apps/cli/packages/core/src/mcp/result-format.ts
import { type ModelMessageContent } from "@knorvia/contracts";
export declare function formatMcpToolResult(output: unknown, preserveWindowsFrame?: boolean): ModelMessageContent;

// Original public port/type owner: packages/cua/frame-contract.d.ts
export const OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION: string;

// Original public port/type owner: packages/shared/src/mcp.ts
import type { SettingsDirectoryLocation } from "./settings-source.js";
import type { McpServerFailureKind } from "./protocol/index.js";
export declare const KNORVIA_CUA_OFFICIAL_MCP_NAMESPACE_NAME = "plugin:computer-use:computer-use";

import { type McpToolCallResult, type McpToolDescriptor } from "@knorvia/contracts";
import type { ToolExecutionContext } from "../tool/types.js";
export declare const MCP_IMAGE_INLINE_BASE64_BYTES: number;
export declare const MCP_IMAGE_INLINE_RAW_BYTES: any;
export declare const HOST_NODE_REPL_IMAGE_MAX_DIMENSION = 2048;
export declare function normalizeMcpToolResultForModel(input: {
    compressOversizedImages: boolean;
    context: ToolExecutionContext;
    descriptor: McpToolDescriptor;
    preserveOfficialCuaFrames?: boolean;
    result: McpToolCallResult;
    toolName: string;
}): Promise<McpToolCallResult>;
export declare function hasOfficialCuaFrameAuthority(result: unknown): result is McpToolCallResult;
export declare function asDataUrl(data: string, mimeType: string): string;
export declare function base64PayloadFromMcpImageData(data: string): string;
