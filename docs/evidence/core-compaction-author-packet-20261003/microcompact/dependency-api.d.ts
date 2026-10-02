// Existing ./manual.js surface, no estimator implementation.
import type { CompactModelMessage } from "./manual.js";
import type { ModelMessageContent } from "@knorvia/contracts";
export declare function estimateMessageTokens(messages: readonly CompactModelMessage[]): number;
// Existing @knorvia/contracts public exports:
export declare function modelMessageContentToText(content: ModelMessageContent): string;
export declare const MicrocompactTrigger: { readonly TimeBased: "time_based"; readonly TokenPressure: "token_pressure" };
export type MicrocompactTrigger = (typeof MicrocompactTrigger)[keyof typeof MicrocompactTrigger];
export declare const MicrocompactStrategy: { readonly LocalToolResultClear: "local_tool_result_clear" };
export type MicrocompactStrategy = (typeof MicrocompactStrategy)[keyof typeof MicrocompactStrategy];
// Real content/payload/branded ToolCallId types are imported from @knorvia/contracts.
