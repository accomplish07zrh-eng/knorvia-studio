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

/** 读一次任务快照；拿不到时返回 undefined。 */
type TaskReader = (taskId: string) => Promise<TaskSnapshot | undefined>;
/** 带等待入口的执行端口（只有 Bash 走这条）。 */
type WaitCapablePort = { readonly waitForBackgroundTask?: TaskReader };
/** 动态工作流运行端口。 */
type DynamicRunPort = {
  readonly getTask: TaskReader;
  readonly waitForTask?: TaskReader;
  readonly cancel?: unknown;
};
/** 某个工具名的快照来源。 */
interface TaskProvider {
  readonly snapshot?: TaskReader;
  readonly wait?: TaskReader;
  readonly cancellable: boolean;
}

type Deps = ToolExecutorDeps;

const WORKFLOW_TOOL_NAME = "Workflow";
const BASH_TOOL_NAME = "Bash";

function makeProvider(
  snapshot: TaskReader | undefined,
  wait: TaskReader | undefined,
  cancellable: boolean,
): TaskProvider {
  const provider = {} as { snapshot?: TaskReader; wait?: TaskReader; cancellable: boolean };
  provider.snapshot = snapshot;
  provider.wait = wait;
  provider.cancellable = cancellable;
  return provider;
}

// 把「对象 + 方法」绑成独立读取器，调用点不必再关心 this。
function readerOf(owner: unknown, method: TaskReader | undefined): TaskReader | undefined {
  if (method === undefined) return undefined;
  return (taskId: string) => method.call(owner, taskId);
}

function resolveSubagentProvider(deps: Deps): TaskProvider {
  const port = deps.subagentPort;
  return makeProvider(readerOf(port, port?.getTask), undefined, Boolean(port?.stopTask));
}

function resolveDynamicWorkflowProvider(deps: Deps): TaskProvider {
  const port = deps.dynamicWorkflowRunPort as unknown as DynamicRunPort | undefined;
  return makeProvider(
    port === undefined ? undefined : (taskId: string) => port.getTask(taskId),
    port !== undefined && typeof port.waitForTask === "function"
      ? (taskId: string) => port.waitForTask!(taskId)
      : undefined,
    port !== undefined && typeof port.cancel === "function",
  );
}

function resolveWorkflowProvider(deps: Deps): TaskProvider {
  const port = deps.workflowPort;
  return makeProvider(
    readerOf(port, port?.getTask),
    port !== undefined && typeof port.waitForTask === "function"
      ? (taskId: string) => port.waitForTask!(taskId)
      : undefined,
    false,
  );
}

// 执行端口是所有未命中专门分支的工具名的兜底来源；只有 Bash 额外带等待入口。
function resolveExecutionPortProvider(deps: Deps): TaskProvider {
  const port = deps.executionPort;
  return makeProvider(
    readerOf(port, port?.getBackgroundTask),
    undefined,
    Boolean(port?.cancelBackgroundTask),
  );
}

function resolveBashProvider(deps: Deps): TaskProvider {
  const port = deps.executionPort as unknown as WaitCapablePort | undefined;
  const wait =
    typeof port?.waitForBackgroundTask === "function"
      ? (taskId: string) => port.waitForBackgroundTask!(taskId)
      : undefined;
  const fallback = resolveExecutionPortProvider(deps);
  return makeProvider(fallback.snapshot, wait, fallback.cancellable);
}

// 候选表：自上而下取第一个匹配的解析器；最后一条是兜底。
const PROVIDER_RESOLVERS: readonly {
  readonly matches: (name: string) => boolean;
  readonly resolve: (deps: Deps) => TaskProvider;
}[] = [
  { matches: isSubagentDispatchToolName, resolve: resolveSubagentProvider },
  { matches: isDynamicWorkflowRunDispatchToolName, resolve: resolveDynamicWorkflowProvider },
  { matches: (name) => name === WORKFLOW_TOOL_NAME, resolve: resolveWorkflowProvider },
  { matches: (name) => name === BASH_TOOL_NAME, resolve: resolveBashProvider },
  { matches: () => true, resolve: resolveExecutionPortProvider },
];

function resolveProvider(deps: Deps, name: string): TaskProvider {
  const entry = PROVIDER_RESOLVERS.find((candidate) => candidate.matches(name));
  return entry === undefined ? makeProvider(undefined, undefined, false) : entry.resolve(deps);
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
