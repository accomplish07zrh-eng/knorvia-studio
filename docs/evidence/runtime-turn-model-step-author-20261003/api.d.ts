import type { ModelToolContract } from "../deps.js";
import { type RuntimeMessageEntry } from "../../agent/message-history.js";
import type { DrainedPendingInputDiagnostics, RunModelTextRequestOptions } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";
type ModelStepResult = "continue" | "output_continuation" | "break";
export declare function runModelBackedTurnStep(this: AgentRuntimeInternal, state: RegularTurnLoopState, options: {
    drainedSteerForNextRequest?: DrainedPendingInputDiagnostics;
    latestRealUserMessageIndex?: number;
    messages: RunModelTextRequestOptions["messages"];
    sourceEntries: readonly (RuntimeMessageEntry | undefined)[];
    recordedMessages: RunModelTextRequestOptions["messages"];
    requestEntries: readonly RuntimeMessageEntry[];
    tools: ModelToolContract[];
}): Promise<ModelStepResult>;
export {};
