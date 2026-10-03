import type { ModelAnomalyGuardConfig, ModelToolCall, ToolCallId } from "../deps.js";
interface RepeatedToolCallWarningState {
    anomalyWarningsInjected: number;
    repeatedToolCallSignature?: string;
    repeatedToolCallStreakCount: number;
}
interface RepeatedToolCallWarningObservation {
    observedCount: number;
    threshold: number;
    toolCallId: ToolCallId;
    toolName: string;
    warningInjected: boolean;
}
interface ToolCallBudgetWarningObservation {
    observedCount: number;
    threshold: number;
    warningInjected: boolean;
}
export declare function detectRepeatedToolCallWarnings(toolCalls: readonly ModelToolCall[], state: RepeatedToolCallWarningState, config: Partial<ModelAnomalyGuardConfig> | undefined): RepeatedToolCallWarningObservation[];
export declare function detectToolCallBudgetWarning(currentToolCallCount: number, newToolCallCount: number, state: RepeatedToolCallWarningState, config: Partial<ModelAnomalyGuardConfig> | undefined): ToolCallBudgetWarningObservation | undefined;
export declare function buildRepeatedToolCallReminderBody(toolName: string, observedCount: number): string;
export declare function buildToolCallBudgetReminderBody(observedCount: number): string;
export {};
