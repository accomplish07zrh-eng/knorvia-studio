import {
  type BackgroundExecutionSnapshot,
  type DynamicWorkflowRunSnapshot,
  type SubagentTaskSnapshot,
  type SessionEvent,
  type TraceContext,
  type TurnId,
  type WorkflowTaskSnapshot,
} from "@knorvia/contracts";
import { isSubagentDispatchToolName } from "../compat.js";
import type { ExecutableToolCall } from "../types.js";
import { backgroundTaskOutputMetadata } from "./background-task-output.js";
import { isDynamicWorkflowRunDispatchToolName } from "./background-task-registry.js";
import type { ToolExecutorDeps } from "./types.js";
import { isRecord } from "./utils.js";

export type TaskSnapshot =
  | BackgroundExecutionSnapshot
  | SubagentTaskSnapshot
  | WorkflowTaskSnapshot
  | DynamicWorkflowRunSnapshot;
type ReadTask = (taskId: string) => Promise<TaskSnapshot | undefined>;
type WaitCandidate = { waitForBackgroundTask?: ReadTask };
type DynamicCandidate = {
  getTask: ReadTask;
  waitForTask?: ReadTask;
  cancel?: unknown;
};

function resolveProvider(
  deps: ToolExecutorDeps,
  name: string,
): {
  snapshot?: ReadTask;
  wait?: ReadTask;
  cancellable: boolean;
} {
  if (isSubagentDispatchToolName(name)) {
    const method = deps.subagentPort?.getTask;
    return {
      snapshot: method ? (id) => method.call(deps.subagentPort, id) : undefined,
      cancellable: Boolean(deps.subagentPort?.stopTask),
    };
  }
  if (isDynamicWorkflowRunDispatchToolName(name)) {
    const port = deps.dynamicWorkflowRunPort as unknown as DynamicCandidate | undefined;
    return {
      snapshot: port !== undefined ? (id) => port.getTask(id) : undefined,
      wait:
        port !== undefined && typeof port.waitForTask === "function"
          ? (id) => port.waitForTask!(id)
          : undefined,
      cancellable: port !== undefined && typeof port.cancel === "function",
    };
  }
  if (name === "Workflow") {
    const method = deps.workflowPort?.getTask;
    const candidate = deps.workflowPort;
    return {
      snapshot: method ? (id) => method.call(deps.workflowPort, id) : undefined,
      wait:
        candidate && typeof candidate.waitForTask === "function"
          ? (id) => candidate.waitForTask!(id)
          : undefined,
      cancellable: false,
    };
  }
  const candidate =
    name === "Bash" ? (deps.executionPort as unknown as WaitCandidate | undefined) : undefined;
  const wait =
    typeof candidate?.waitForBackgroundTask === "function"
      ? (id: string) => candidate.waitForBackgroundTask!(id)
      : undefined;
  const method = deps.executionPort?.getBackgroundTask;
  return {
    snapshot: method ? (id) => method.call(deps.executionPort, id) : undefined,
    wait,
    cancellable: Boolean(deps.executionPort?.cancelBackgroundTask),
  };
}

export function hasSnapshotProvider(deps: ToolExecutorDeps, name: string): boolean {
  return Boolean(resolveProvider(deps, name).snapshot);
}
export function hasDirectWaiter(deps: ToolExecutorDeps, name: string): boolean {
  return Boolean(resolveProvider(deps, name).wait);
}
export async function readTaskSnapshot(
  deps: ToolExecutorDeps,
  name: string,
  taskId: string,
): Promise<TaskSnapshot | undefined> {
  return resolveProvider(deps, name).snapshot?.(taskId);
}
export async function waitForTaskSnapshot(
  deps: ToolExecutorDeps,
  name: string,
  taskId: string,
): Promise<TaskSnapshot | undefined> {
  return resolveProvider(deps, name).wait?.(taskId);
}

export function field(snapshot: object | undefined, key: string): unknown {
  return snapshot && key in snapshot ? (snapshot as Record<string, unknown>)[key] : undefined;
}
export function stringField(value: object | undefined, key: string): string | undefined {
  const result = (value as Record<string, unknown> | undefined)?.[key];
  return typeof result === "string" ? result : undefined;
}
export function snapshotString(snapshot: object | undefined, key: string): string | undefined {
  const value = field(snapshot, key);
  return typeof value === "string" ? value : undefined;
}

export function workflowSubject(
  call: ExecutableToolCall,
  taskId: string,
  snapshot?: TaskSnapshot,
  launch?: Record<string, unknown>,
): string {
  const input = isRecord(call.input) ? call.input : undefined;
  return (
    stringField(input, "description") ??
    snapshotString(snapshot, "description") ??
    snapshotString(snapshot, "name") ??
    stringField(launch, "name") ??
    stringField(input, "name") ??
    stringField(input, "scriptPath") ??
    taskId
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function runningSignature(snapshot: TaskSnapshot): string {
  return JSON.stringify({
    pid: field(snapshot, "pid"),
    stderrBytes: field(snapshot, "stderrBytes"),
    stderrTail: field(snapshot, "stderrTail"),
    stdoutBytes: field(snapshot, "stdoutBytes"),
    stdoutTail: field(snapshot, "stdoutTail"),
  });
}

export function taskPayload(
  deps: ToolExecutorDeps,
  call: ExecutableToolCall,
  taskId: string,
  status: string,
  launch: Record<string, unknown>,
  snapshot?: TaskSnapshot,
) {
  const input = isRecord(call.input) ? call.input : {};
  const metadata = backgroundTaskOutputMetadata(snapshot, launch);
  return {
    taskId,
    toolCallId: call.id,
    toolName: call.name,
    taskKind: isSubagentDispatchToolName(call.name)
      ? "subagent"
      : isDynamicWorkflowRunDispatchToolName(call.name)
        ? "workflow"
        : "bash",
    childSessionId: metadata.childSessionId,
    cancellable: status === "running" ? resolveProvider(deps, call.name).cancellable : false,
    command: typeof input.command === "string" ? input.command : undefined,
    description: isDynamicWorkflowRunDispatchToolName(call.name)
      ? workflowSubject(call, taskId, snapshot, launch)
      : typeof input.description === "string"
        ? input.description
        : field(snapshot, "description"),
    status,
    pid: field(snapshot, "pid"),
    startedAt: snapshot?.startedAt,
    completedAt: snapshot?.completedAt,
    outputPath: metadata.outputFile,
    stderrPersistedOutputPath: metadata.stderrFile,
    stdoutPersistedOutputPath: metadata.stdoutFile,
    outputBytes: metadata.outputBytes,
    outputTruncated: metadata.outputTruncated,
    outputTail: metadata.outputTail,
    stderrBytes: metadata.stderrBytes,
    stderrTail: metadata.stderrTail,
    stdoutBytes: metadata.stdoutBytes,
    stdoutTail: metadata.stdoutTail,
    terminalId: taskId,
  };
}

export async function emitBackgroundTaskEvent(
  deps: ToolExecutorDeps,
  type: SessionEvent["type"],
  payload: Record<string, unknown>,
  traceContext: TraceContext,
  turnId: TurnId | undefined,
): Promise<void> {
  await deps.emitEvent({
    id: crypto.randomUUID() as SessionEvent["id"],
    sessionId: deps.sessionId,
    turnId,
    type,
    timestamp: new Date(),
    traceId: traceContext.traceId,
    sequenceNumber: 0,
    payload,
  });
}
