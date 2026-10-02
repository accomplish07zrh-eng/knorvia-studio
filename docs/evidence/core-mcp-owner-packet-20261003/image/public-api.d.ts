import { type McpToolCallResult, type McpToolDescriptor } from "@knorvia/contracts";
import type { ToolExecutionContext } from "../tool/types.js";
export declare const MCP_IMAGE_INLINE_BASE64_BYTES: number;
export declare const MCP_IMAGE_INLINE_RAW_BYTES: number;
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
