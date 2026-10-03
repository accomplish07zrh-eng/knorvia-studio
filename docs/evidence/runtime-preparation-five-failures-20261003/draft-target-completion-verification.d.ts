import type { GoalCompletionVerificationOutput, SessionGoal, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
export interface TargetCompletionVerificationResult {
    target: SessionGoal;
    verification: GoalCompletionVerificationOutput;
}
export declare function verifyActiveTargetCompletionForContinuation(this: AgentRuntimeInternal, input: {
    abortSignal?: AbortSignal;
    target: SessionGoal;
    traceContext: TraceContext;
}): Promise<TargetCompletionVerificationResult | null>;
//# sourceMappingURL=target-completion-verification.d.ts.map