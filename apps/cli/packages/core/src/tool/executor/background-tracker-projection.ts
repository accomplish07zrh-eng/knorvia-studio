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
type TaskReader = (taskId: TaskId) => Promise<TaskSnapshot | undefined>;
/** 工具名（用来挑快照来源）。 */
type TaskName = string;
/** 后台任务 id（也是终端 id）。 */
type TaskId = string;
/** 会话事件的初始序号。 */
const INITIAL_SEQUENCE_NUMBER = 0;
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

export function hasSnapshotProvider(deps: Deps, name: TaskName): boolean {
  const provider = resolveProvider(deps, name);
  return provider.snapshot !== undefined;
}

export function hasDirectWaiter(deps: Deps, name: TaskName): boolean {
  const provider = resolveProvider(deps, name);
  return provider.wait !== undefined;
}

export async function readTaskSnapshot(
  deps: Deps,
  name: TaskName,
  taskId: TaskId,
): Promise<TaskSnapshot | undefined> {
  const reader = resolveProvider(deps, name).snapshot;
  return reader === undefined ? undefined : reader(taskId);
}

export async function waitForTaskSnapshot(
  deps: Deps,
  name: TaskName,
  taskId: TaskId,
): Promise<TaskSnapshot | undefined> {
  const reader = resolveProvider(deps, name).wait;
  return reader === undefined ? undefined : reader(taskId);
}

type UnknownSnapshot = object | undefined;

// 取值只有三种语义，各自一个实现：原样取、按属性取、取文本。
// 公开的三个读取器都只是「查表 + 一次转换」，不再各自重复类型判断。
function asText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function rawField(source: UnknownSnapshot, key: string): unknown {
  return (source as Record<string, unknown> | undefined)?.[key];
}

export function field(snapshot: UnknownSnapshot, key: string): unknown {
  if (snapshot === undefined || snapshot === null) return undefined;
  if (!(key in snapshot)) return undefined;
  return rawField(snapshot, key);
}

export function stringField(value: UnknownSnapshot, key: string): string | undefined {
  return asText(rawField(value, key));
}

export function snapshotString(snapshot: UnknownSnapshot, key: string): string | undefined {
  return asText(field(snapshot, key));
}

// 依次尝试各候选来源，返回第一个真正给出的文本；用于「按优先级回退」的取值链。
function firstText(...candidates: (string | undefined)[]): string | undefined {
  for (const candidate of candidates) {
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

export function workflowSubject(
  call: ExecutableToolCall,
  taskId: string,
  snapshot?: TaskSnapshot,
  launch?: Record<string, unknown>,
): string {
  const input = isRecord(call.input) ? call.input : undefined;
  // 优先级：调用入参描述 → 快照描述 → 快照名 → 启动输出名 → 入参名 → 脚本路径 → 任务 id。
  const subject = firstText(
    stringField(input, "description"),
    snapshotString(snapshot, "description"),
    snapshotString(snapshot, "name"),
    stringField(launch, "name"),
    stringField(input, "name"),
    stringField(input, "scriptPath"),
  );
  return subject ?? taskId;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// 运行签名只看这几个量：它们变化就说明任务还在推进（pid 或任一输出量变了）。
const RUNNING_SIGNATURE_FIELDS = [
  "pid",
  "stderrBytes",
  "stderrTail",
  "stdoutBytes",
  "stdoutTail",
] as const;

export function runningSignature(snapshot: TaskSnapshot): string {
  const facts: Record<string, unknown> = {};
  for (const key of RUNNING_SIGNATURE_FIELDS) facts[key] = field(snapshot, key);
  return JSON.stringify(facts);
}

const SUBAGENT_TASK_KIND = "subagent";
const WORKFLOW_TASK_KIND = "workflow";
const BASH_TASK_KIND = "bash";
const RUNNING_STATUS = "running";

// 任务种类由工具名决定：子代理派发 → subagent，动态工作流 → workflow，其余按 bash 记。
function taskKindOf(name: string): string {
  if (isSubagentDispatchToolName(name)) return SUBAGENT_TASK_KIND;
  if (isDynamicWorkflowRunDispatchToolName(name)) return WORKFLOW_TASK_KIND;
  return BASH_TASK_KIND;
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
  const pid = field(snapshot, "pid");
  const cancellable =
    status === RUNNING_STATUS ? resolveProvider(deps, call.name).cancellable : false;
  const command = typeof input.command === "string" ? input.command : undefined;
  return {
    taskId,
    toolCallId: call.id,
    toolName: call.name,
    taskKind: taskKindOf(call.name),
    childSessionId: metadata.childSessionId,
    cancellable,
    command,
    description: isDynamicWorkflowRunDispatchToolName(call.name)
      ? workflowSubject(call, taskId, snapshot, launch)
      : typeof input.description === "string"
        ? input.description
        : field(snapshot, "description"),
    status,
    pid,
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

// 会话事件信封：所有会话事件共用的字段，payload 由调用方补。
function sessionEventEnvelope(
  deps: Deps,
  type: SessionEvent["type"],
  traceContext: TraceContext,
  turnId: TurnId | undefined,
): SessionEvent {
  const envelope = {} as SessionEvent;
  envelope.id = crypto.randomUUID() as SessionEvent["id"];
  envelope.sessionId = deps.sessionId;
  envelope.turnId = turnId;
  envelope.type = type;
  envelope.timestamp = new Date();
  envelope.traceId = traceContext.traceId;
  envelope.sequenceNumber = INITIAL_SEQUENCE_NUMBER;
  return envelope;
}

export async function emitBackgroundTaskEvent(
  deps: Deps,
  type: SessionEvent["type"],
  payload: Record<string, unknown>,
  traceContext: TraceContext,
  turnId: TurnId | undefined,
): Promise<void> {
  const event = sessionEventEnvelope(deps, type, traceContext, turnId);
  event.payload = payload;
  await deps.emitEvent(event);
}
