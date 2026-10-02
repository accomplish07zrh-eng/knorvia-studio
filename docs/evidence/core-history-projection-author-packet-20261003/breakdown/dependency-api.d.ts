export type ContextUsageTokenMethod = "estimated" | "provider_count" | "proportional_estimate";
export type ContextUsageConfidence = "high" | "medium" | "low";
export interface ContextUsageMetric {
    chars: number;
    confidence: ContextUsageConfidence;
    tokenMethod: ContextUsageTokenMethod;
    tokenizer: string;
    tokens: number;
}
export interface ContextUsageCategory extends ContextUsageMetric {
    name: string;
    percentTokens: number;
    source: "system_prompt" | "meta_user_context" | "skills" | "tool_prompt" | "system_tool_schemas" | "mcp_tool_schemas" | "messages";
}
export interface ContextUsageToolDetail extends ContextUsageMetric {
    name: string;
    readOnly?: boolean;
    serverName?: string;
    sideEffectScope?: string;
    source: "system_tool" | "mcp_tool";
}
export interface ContextUsageSkillDetail extends ContextUsageMetric {
    name: string;
    path: string;
    scope: string;
    source: string;
}
export interface ContextUsageMessageRoleBreakdown extends ContextUsageMetric {
    count: number;
    role: string;
}
