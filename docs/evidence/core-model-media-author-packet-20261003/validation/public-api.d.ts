import type { Logger, Model, ModelToolCall, ToolCall, TraceContext } from "../deps.js";
interface ModelToolCallValidationContext {
    logger?: Logger;
    model: Pick<Model, "providerId" | "modelId">;
    source: string;
    traceContext: TraceContext;
}
export declare function normalizeModelToolCallsForRuntime(toolCalls: readonly ModelToolCall[] | undefined, context: ModelToolCallValidationContext): ModelToolCall[] | undefined;
export declare function requireRuntimeToolCallName(toolCall: Pick<ModelToolCall | ToolCall, "id" | "name">, context: ModelToolCallValidationContext): string;
export {};
