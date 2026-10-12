// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

export type TaskSnapshot =
  | BackgroundExecutionSnapshot
  | SubagentTaskSnapshot
  | WorkflowTaskSnapshot
  | DynamicWorkflowRunSnapshot;

export function hasSnapshotProvider(deps: ToolExecutorDeps, name: string): boolean {
  throw new Error("not implemented: core-tool-01");
}

export function hasDirectWaiter(deps: ToolExecutorDeps, name: string): boolean {
  throw new Error("not implemented: core-tool-01");
}

export function readTaskSnapshot(
  deps: ToolExecutorDeps,
  name: string,
  taskId: string,
): Promise<TaskSnapshot | undefined> {
  throw new Error("not implemented: core-tool-01");
}

export function waitForTaskSnapshot(
  deps: ToolExecutorDeps,
  name: string,
  taskId: string,
): Promise<TaskSnapshot | undefined> {
  throw new Error("not implemented: core-tool-01");
}

export function field(snapshot: object | undefined, key: string): unknown {
  throw new Error("not implemented: core-tool-01");
}

export function stringField(value: object | undefined, key: string): string | undefined {
  throw new Error("not implemented: core-tool-01");
}

export function snapshotString(snapshot: object | undefined, key: string): string | undefined {
  throw new Error("not implemented: core-tool-01");
}

export function workflowSubject(
  call: ExecutableToolCall,
  taskId: string,
  snapshot?: TaskSnapshot,
  launch?: Record<string, unknown>,
): string {
  throw new Error("not implemented: core-tool-01");
}

export function errorMessage(error: unknown): string {
  throw new Error("not implemented: core-tool-01");
}

export function runningSignature(snapshot: TaskSnapshot): string {
  throw new Error("not implemented: core-tool-01");
}

export function taskPayload(
  deps: ToolExecutorDeps,
  call: ExecutableToolCall,
  taskId: string,
  status: string,
  launch: Record<string, unknown>,
  snapshot?: TaskSnapshot,
) {
  throw new Error("not implemented: core-tool-01");
}

export function emitBackgroundTaskEvent(
  deps: ToolExecutorDeps,
  type: SessionEvent["type"],
  payload: Record<string, unknown>,
  traceContext: TraceContext,
  turnId: TurnId | undefined,
): Promise<void> {
  throw new Error("not implemented: core-tool-01");
}
