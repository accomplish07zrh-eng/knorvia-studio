import type { RunModelTextRequestOptions, RuntimeModelTextResult } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
export declare function runModelTextRequest(this: AgentRuntimeInternal, options: RunModelTextRequestOptions): Promise<RuntimeModelTextResult>;
