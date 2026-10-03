// Public surfaces only; actual installed import paths, no dependency bodies.
import type { CompactModelMessage } from "./manual.js";
export declare function estimateMessageTokens(messages: readonly CompactModelMessage[]): number;
export declare function hasEnoughMessagesToCompact(messages: readonly CompactModelMessage[]): boolean;
// @knorvia/shared public export, imported under any local alias:
export declare const DEFAULT_KNORVIA_MODEL_CONTEXT_BUDGET_STRATEGY: "preflight-v1";
// ./microcompact.js public type is LocalMicrocompactPolicyConfig, described in data-shapes.
