export interface ModelAnomalyGuardConfig {
    toolCallWarningThreshold?: number;
    repeatedToolCallWarningThreshold: number;
    maxBudgetWarningsPerTurn: number;
}
export interface ModelToolCall {
    id: string;
    name: string;
    input: unknown;
    providerExecuted?: boolean;
}
export type ToolCallId = string & {
    readonly __brand: "ToolCallId";
};
