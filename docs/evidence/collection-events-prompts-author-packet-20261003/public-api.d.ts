// ./collection-events.js
import type { WorkflowRunSnapshot } from "@knorvia/contracts";
import type { WorkflowCollectionPlannerRuntime } from "./collection-runtime.js";
import type { AppliedPlannerExpansion, SchedulerCollection, WorkflowGraphSchedulerRunOptions } from "./types.js";
export declare function emitExpansionEvents(snapshot: WorkflowRunSnapshot, expansion: AppliedPlannerExpansion, collectionId: string, options: WorkflowGraphSchedulerRunOptions, runtime: WorkflowCollectionPlannerRuntime): Promise<void>;
export declare function exhaustCollection(snapshot: WorkflowRunSnapshot, collection: SchedulerCollection, options: WorkflowGraphSchedulerRunOptions, runtime: WorkflowCollectionPlannerRuntime, payload: Record<string, unknown>): Promise<WorkflowRunSnapshot>;

// ./prompts.js
import type { WorkflowGraphCollection, WorkflowGraphNode, WorkflowRunSnapshot } from "@knorvia/contracts";
export declare function buildDefaultNodePrompt(snapshot: WorkflowRunSnapshot, node: WorkflowGraphNode, phase: string): string;
export declare function buildDefaultPlannerPrompt(snapshot: WorkflowRunSnapshot, collection: WorkflowGraphCollection, phase: string): string;
export declare function safeArtifactName(value: string): string;

