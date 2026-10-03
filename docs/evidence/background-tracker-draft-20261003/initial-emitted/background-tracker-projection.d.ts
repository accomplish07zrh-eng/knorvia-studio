import { SessionEventType, type BackgroundExecutionSnapshot, type DynamicWorkflowRunSnapshot, type SubagentTaskSnapshot, type TraceContext, type TurnId, type WorkflowTaskSnapshot } from "@knorvia/contracts";
import type { ExecutableToolCall } from "../types.js";
import type { ToolExecutorDeps } from "./types.js";
export type TaskSnapshot = BackgroundExecutionSnapshot | SubagentTaskSnapshot | WorkflowTaskSnapshot | DynamicWorkflowRunSnapshot;
export declare function hasSnapshotProvider(deps: ToolExecutorDeps, name: string): boolean;
export declare function hasDirectWaiter(deps: ToolExecutorDeps, name: string): boolean;
export declare function readTaskSnapshot(deps: ToolExecutorDeps, name: string, taskId: string): Promise<TaskSnapshot | undefined>;
export declare function waitForTaskSnapshot(deps: ToolExecutorDeps, name: string, taskId: string): Promise<TaskSnapshot | undefined>;
export declare function field(snapshot: object | undefined, key: string): unknown;
export declare function stringField(value: object | undefined, key: string): string | undefined;
export declare function workflowSubject(call: ExecutableToolCall, taskId: string, snapshot?: TaskSnapshot, launch?: Record<string, unknown>): string;
export declare function taskLogFacts(traceContext: TraceContext, taskId: string, toolName?: string): Record<string, unknown>;
export declare function errorMessage(error: unknown): string;
export declare function runningSignature(snapshot: TaskSnapshot): string;
export declare function emitBackgroundTaskEvent(deps: ToolExecutorDeps, call: ExecutableToolCall, taskId: string, type: typeof SessionEventType.BackgroundTaskStarted | typeof SessionEventType.BackgroundTaskUpdated | typeof SessionEventType.BackgroundTaskCompleted, status: string, traceContext: TraceContext, turnId: TurnId | undefined, launch: Record<string, unknown>, snapshot?: TaskSnapshot): Promise<void>;
//# sourceMappingURL=background-tracker-projection.d.ts.map