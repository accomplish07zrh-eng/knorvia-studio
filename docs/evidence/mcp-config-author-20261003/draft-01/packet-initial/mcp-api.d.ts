import type { McpConnectionSnapshot, McpServerConfig, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";

export declare function computeOfficialCuaServerNames(servers: Record<string, McpServerConfig>, trustedServerNames: ReadonlySet<string>): Set<string>;
export declare function startMcpStartup(this: AgentRuntimeInternal, traceContext: TraceContext): Promise<McpConnectionSnapshot> | undefined;
export declare function initializeMcp(this: AgentRuntimeInternal, traceContext: TraceContext): Promise<void>;
