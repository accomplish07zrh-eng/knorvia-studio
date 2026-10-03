import { type WorkflowGraphNode } from "@knorvia/contracts";
import { WorkflowSchedulerEventLog } from "./events.js";
import type { WorkflowGraphSchedulerDeps, WorkflowGraphSchedulerRunOptions, WorkflowGraphSchedulerSnapshotAccess, WorkflowSchedulerNodePromise } from "./types.js";
export interface WorkflowNodeRunnerRuntime {
    createActivityId: () => string;
    eventLog: WorkflowSchedulerEventLog;
    runner: WorkflowGraphSchedulerDeps["runner"];
    writeArtifact: WorkflowGraphSchedulerDeps["writeArtifact"];
    writeSnapshot: WorkflowGraphSchedulerDeps["writeSnapshot"];
}
export declare function runWorkflowNode(snapshotAccess: WorkflowGraphSchedulerSnapshotAccess, node: WorkflowGraphNode, options: WorkflowGraphSchedulerRunOptions, maxAttempts: number, runtime: WorkflowNodeRunnerRuntime): WorkflowSchedulerNodePromise;
