import { type Model, type ModelSelection, type TraceContext, type TurnInputIntentMetadata } from "@knorvia/contracts";
import type { AgentRuntimeInternal } from "../internal.js";
export declare function createTurnModel(runtime: AgentRuntimeInternal, options?: {
    selection?: ModelSelection;
    requestDependencies?: import("@knorvia/contracts").ModelRequestDependencies;
}): Model;
export declare function applySubmissionExecutionState(runtime: AgentRuntimeInternal, intent: TurnInputIntentMetadata | undefined, traceContext: TraceContext, modelExecution?: import("../types.js").ModelExecutionContext, preparedModel?: Model): Promise<Model | undefined>;
export declare function sameModelSelection(left: ModelSelection | undefined, right: ModelSelection): boolean;
export declare function persistRuntimeModelSelection(runtime: AgentRuntimeInternal, selection: ModelSelection): Promise<void>;
