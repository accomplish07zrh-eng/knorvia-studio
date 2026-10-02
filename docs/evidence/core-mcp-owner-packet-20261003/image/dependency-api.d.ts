// Original public port/type owner: packages/cua/frame-contract.d.ts
export const OFFICIAL_CUA_FRAME_INTEGRITY_META_KEY: string;
export declare function isOfficialCuaImageRefText(text: string): boolean;
export declare function preserveOfficialCuaFrameResult<T extends {
    content?: unknown;
    isError?: boolean;
}>(result: T, options?: unknown): Promise<T>;

// Original public port/type owner: apps/cli/packages/contracts/src/interfaces/mcp.port.ts
import type { JsonSchema } from "../model/index.js";
import type { TraceContext } from "../tracing/tracer.js";
import type { McpServerFailureKind, OfficialMcpAuthPortFailureReason } from "@knorvia/shared";
export declare const KNORVIA_MCP_BROWSER_SCREENSHOT_CONTENT_INDICES_META_KEY = "knorvia/browserScreenshotContentIndices";
