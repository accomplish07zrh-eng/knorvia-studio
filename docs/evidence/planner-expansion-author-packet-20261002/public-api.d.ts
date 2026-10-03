import { type WorkflowRunSnapshot } from "@knorvia/contracts";
import type { AppliedPlannerExpansion, SchedulerCollection, WorkflowGraphSchedulerPlannerRunResult } from "./types.js";
export declare function applyPlannerExpansion(snapshot: WorkflowRunSnapshot, collection: SchedulerCollection, rawResult: WorkflowGraphSchedulerPlannerRunResult, unseenCompletions: readonly string[], timestamp: string): AppliedPlannerExpansion;
//# sourceMappingURL=planner-expansion.d.ts.map