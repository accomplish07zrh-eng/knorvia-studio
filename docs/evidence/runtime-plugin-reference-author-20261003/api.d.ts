import type { TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
export declare function injectPluginReferenceReminderFromTurn(this: AgentRuntimeInternal, userInput: string, traceContext: TraceContext, toolDisallowlist?: readonly string[]): Promise<void>;
