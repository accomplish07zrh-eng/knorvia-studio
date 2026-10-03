import { type McpPort, type McpToolDescriptor } from "@knorvia/contracts";
import type { ToolRegistry } from "../tool/registry.js";
export { toMcpToolName } from "./name.js";
export { HOST_NODE_REPL_IMAGE_MAX_DIMENSION, MCP_IMAGE_INLINE_BASE64_BYTES, MCP_IMAGE_INLINE_RAW_BYTES, } from "./image-normalization.js";
export interface RegisterMcpToolsOptions {
    allowedTools?: readonly string[];
    disallowedTools?: readonly string[];
    officialCuaServerNames?: ReadonlySet<string>;
    trustedWindowsComputerUseServerNames?: ReadonlySet<string>;
}
export declare function registerMcpTools(registry: ToolRegistry, mcpPort: McpPort, descriptors: readonly McpToolDescriptor[], options?: RegisterMcpToolsOptions): string[];
export declare const McpToolOutputJsonSchema: JsonSchema;
