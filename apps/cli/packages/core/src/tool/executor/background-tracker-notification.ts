// 终态通知：把一次后台任务的收口装配成「给用户看的一条通知」并交给入队端口。
//
// 兼容面只有 enqueueTerminalNotification 一个导出；它跑一条显式门禁链（ADMISSION_GATES），
// 顺序是合同 B85 的兼容面：入队端口 → superseded 抑制 → 运行时策略 → 正文（空则弃）→
// 认领 → 入队（失败释放认领）→ 确认日志。正文与 manifest 的形状见 B86/B87；
// 本文件只做装配与判定，不持有任何状态——认领位归 registry 条目所有。
import {
  traceContextToLogContext,
  type BackgroundResultOriginMeta,
  type DynamicWorkflowRunError,
  type LogContext,
  type TraceContext,
} from "@knorvia/contracts";
import {
  formatTaskNotification,
  type TaskNotificationInput,
} from "../../runtime-task/notification.js";
import { describeWorkflowScriptPath } from "../handlers/workflow-script-path.js";
import type { ExecutableToolCall } from "../types.js";
import { backgroundTaskOutputMetadata } from "./background-task-output.js";
import {
  claimRuntimeBackgroundTaskNotification,
  isDynamicWorkflowRunDispatchToolName,
  releaseRuntimeBackgroundTaskNotification,
} from "./background-task-registry.js";
import {
  errorMessage,
  field,
  stringField,
  snapshotString,
  workflowSubject,
  type TaskSnapshot,
} from "./background-tracker-projection.js";
import type { BackgroundTaskNotificationCommand, ToolExecutorDeps } from "./types.js";
import { isRecord } from "./utils.js";
import {
  serializeWorkflowArtifact,
  buildWorkflowReportsManifestSection,
  buildWorkflowReportsNotificationSection,
} from "./workflow-artifact.js";
import {
  buildWorkflowArtifactsManifestSection,
  buildWorkflowArtifactsNotificationSection,
  toPublishedArtifactSummaries,
  WORKFLOW_ARTIFACTS_NOTIFICATION_MAX_LINES,
} from "./workflow-published-artifacts.js";

type Deps = ToolExecutorDeps;
type ToolCall = ExecutableToolCall;
type TaskId = string;
type TaskStatus = string;
type Trace = TraceContext;
type LaunchOutput = Record<string, unknown>;
type SnapshotView = TaskSnapshot;
type LooseRecord = Record<string, unknown>;

/** 工作流运行声明的终态名；快照 runStatus 只认这三个值。 */
type RunStatus = "completed" | "errored" | "stopped";
/** 停止来源；五个取值各自决定「被谁停掉」的措辞。 */
type StopCause = "user" | "model" | "provider" | "interrupted" | "superseded";
/** 通知正文里的三值状态。 */
type DeliveryState = "completed" | "killed" | "failed";
/** 日志分级；三条通道都走同一个写入口。 */
type LogLevel = "debug" | "info" | "warn";

/** 终态事实：快照声明优先，缺席时按追踪状态推导（B86）。 */
interface TerminalOutcome {
  runStatus: RunStatus;
  stopCause?: StopCause;
  failure?: DynamicWorkflowRunError;
}

/** 一次通知装配的全部输入；单对象入参，避免长签名被格式化器折出同形行。 */
interface NotificationRequest {
  readonly deps: Deps;
  readonly call: ToolCall;
  readonly taskId: TaskId;
  readonly status: TaskStatus;
  readonly traceContext: Trace;
  readonly snapshot?: SnapshotView;
  readonly launch?: LaunchOutput;
}

/** 门禁链上的一步：halt 表示整条链到此为止。 */
type GateVerdict = "proceed" | "halt";
type AdmissionGate = (context: DeliveryContext) => GateVerdict;

/** 门禁链的可变上下文：正文在第 4 步落位，交付步直接取用。 */
interface DeliveryContext extends NotificationRequest {
  message?: string;
}

// 下面这些标识与文案是排障约定（module / event / reason）与用户可见句式（B86），
// 属兼容面：重构只许改组织方式，不许改字面。
const LOG_MODULE = "core.tool.executor";
const EVENT_QUEUE_UNAVAILABLE = "background_task.notification.queue_unavailable";
const EVENT_SUPPRESSED = "background_task.notification.suppressed";
const EVENT_SKIPPED = "background_task.notification.skipped";
const EVENT_ALREADY_HANDLED = "background_task.tracking.notification_already_handled";
const EVENT_ENQUEUED = "background_task.notification.enqueued";
const REASON_SUPERSEDED = "workflow_run_superseded";
const REASON_EMPTY_MESSAGE = "empty_message";

const LOG_QUEUE_UNAVAILABLE = "Background task notification queue unavailable";
const LOG_SUPPRESSED_SUPERSEDED = "Background task notification suppressed: run superseded";
const LOG_SUPPRESSED_BY_POLICY = "Background task notification suppressed by runtime policy";
const LOG_MESSAGE_EMPTY = "Background task notification skipped without formatted message";
const LOG_ALREADY_CLAIMED = "Background task notification already claimed";
const LOG_ENQUEUE_FAILED = "Background task notification enqueue failed";
const LOG_ENQUEUED = "Background task notification enqueued";

const BASH_TOOL = "Bash";
const LEGACY_WORKFLOW_TOOL = "Workflow";
const BASH_FALLBACK_SUBJECT = "Bash background command";

// manifest 的字符预算（B87 的固定界）。
const MANIFEST_SUMMARY_LIMIT = 500;
const MANIFEST_RESULT_LIMIT = 4000;
const MANIFEST_ERROR_LIMIT = 2000;

// runStatus 的合法取值：快照写了别的值一律按「没写」处理。
const DECLARED_RUN_STATUSES = new Set<string>(["completed", "errored", "stopped"]);
// 追踪状态 → runStatus 的推导表；不在表里就没有终态事实。
const INFERRED_RUN_STATUS: Readonly<Record<string, RunStatus | undefined>> = {
  completed: "completed",
  failed: "errored",
  cancelled: "stopped",
};
const STOP_CAUSES = new Set<string>(["user", "model", "provider", "interrupted", "superseded"]);
// 这些追踪状态在通知里统一归一为「已停」。
const HALTED_TRACKING_STATES = new Set<string>(["cancelled", "timed_out", "killed", "stopped"]);

// 工作流摘要句尾（B86 逐字保留）。
const WORKFLOW_TAIL_LOST = " failed because its in-process state was lost.";
const WORKFLOW_TAIL_ERRORED = " errored: the script failed.";
const WORKFLOW_TAIL_STOPPED = " was stopped.";
const WORKFLOW_TAIL_COMPLETED = " completed.";
const WORKFLOW_TAIL_FAILED = " failed.";
// 停止来源 → 句尾。
const STOP_CAUSE_TAILS: Readonly<Record<StopCause, string>> = {
  user: " was stopped by the user.",
  model: " was stopped by you (TaskStop).",
  provider: " was stopped on a provider error.",
  interrupted: " was stopped: the process that owned it exited.",
  superseded: " was stopped and superseded by an amended run.",
};

// bash 摘要句尾（B86 逐字保留）。
const BASH_TAIL_LOST = " failed because its in-process state was lost";
const BASH_TAIL_STOPPED = " was stopped";

/** 追踪状态归一为三值（B86）。 */
function deliveryState(status: TaskStatus): DeliveryState {
  if (status === "completed") return "completed";
  return HALTED_TRACKING_STATES.has(status) ? "killed" : "failed";
}

/** 终态事实：先认快照声明，再按追踪状态推导；两者都没有就返回 undefined。 */
function terminalOutcomeOf(
  snapshot: SnapshotView | undefined,
  status: TaskStatus,
): TerminalOutcome | undefined {
  const record = snapshot as unknown as LooseRecord | undefined;
  const declared: unknown = record?.runStatus;
  const runStatus =
    typeof declared === "string" && DECLARED_RUN_STATUSES.has(declared)
      ? (declared as RunStatus)
      : INFERRED_RUN_STATUS[status];
  if (runStatus === undefined) return undefined;
  const declaredCause: unknown = record?.stopReason;
  const stopCause =
    runStatus === "stopped" && typeof declaredCause === "string" && STOP_CAUSES.has(declaredCause)
      ? (declaredCause as StopCause)
      : undefined;
  const failure = isRecord(record?.failure)
    ? (record?.failure as unknown as DynamicWorkflowRunError)
    : undefined;
  const outcome = {} as TerminalOutcome;
  outcome.runStatus = runStatus;
  if (stopCause !== undefined) outcome.stopCause = stopCause;
  if (failure !== undefined) outcome.failure = failure;
  return outcome;
}

/** 快照没给停止来源时，取消态回落到运行时任务登记的发起方（B86）。 */
function stoppedByCaller(deps: Deps, taskId: TaskId, status: TaskStatus): StopCause | undefined {
  if (status !== "cancelled") return undefined;
  return deps.runtimeTaskRegistry?.get(taskId)?.stopInitiator;
}

// 快照里的 reports / artifacts / scriptPath 都是「在场才认」的可选字段。
function workflowReportsOf(snapshot: SnapshotView | undefined): readonly unknown[] | undefined {
  if (snapshot === undefined || !("reports" in snapshot)) return undefined;
  const rows: unknown = snapshot.reports;
  return Array.isArray(rows) ? rows : undefined;
}

function workflowArtifactsOf(snapshot: SnapshotView | undefined) {
  if (snapshot === undefined || !("artifacts" in snapshot)) return undefined;
  const packed: unknown = (snapshot as unknown as LooseRecord).artifacts;
  return toPublishedArtifactSummaries(packed);
}

function workflowScriptPathOf(
  snapshot: SnapshotView | undefined,
  dynamicRun: boolean,
): string | undefined {
  if (!dynamicRun || snapshot === undefined || !("scriptPath" in snapshot)) return undefined;
  const candidate: unknown = snapshot.scriptPath;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

/** 工作流摘要句尾：lost → errored → 停止族 → completed/failed（B86 的判定顺序）。 */
function workflowSummaryTail(status: TaskStatus, outcome: TerminalOutcome | undefined): string {
  if (status === "lost") return WORKFLOW_TAIL_LOST;
  if (outcome?.runStatus === "errored") return WORKFLOW_TAIL_ERRORED;
  const stoppedLike = outcome?.runStatus === "stopped" || deliveryState(status) === "killed";
  if (stoppedLike) {
    const cause = outcome?.stopCause;
    return cause === undefined ? WORKFLOW_TAIL_STOPPED : STOP_CAUSE_TAILS[cause];
  }
  return deliveryState(status) === "completed" ? WORKFLOW_TAIL_COMPLETED : WORKFLOW_TAIL_FAILED;
}

/** bash 摘要句尾：lost → completed/failed（带退出码）→ was stopped（B86）。 */
function bashSummaryTail(
  status: TaskStatus,
  state: DeliveryState,
  exitCode: number | undefined,
): string {
  if (status === "lost") return BASH_TAIL_LOST;
  if (state === "completed") {
    return exitCode === undefined ? " completed" : ` completed (exit code ${exitCode})`;
  }
  if (state === "failed") {
    return exitCode === undefined ? " failed" : ` failed with exit code ${exitCode}`;
  }
  return BASH_TAIL_STOPPED;
}

/** 工作流族正文：动态运行多带投递指引、脚本路径、报表与产物（B86）。 */
function workflowMessage(
  request: NotificationRequest,
  outcome: TerminalOutcome | undefined,
): string {
  const { deps, call, taskId, status, snapshot, launch } = request;
  const dynamicRun = isDynamicWorkflowRunDispatchToolName(call.name);
  const packedOutput = field(snapshot, "output");
  const output = isRecord(packedOutput) ? packedOutput : launch;
  const title = workflowSubject(call, taskId, snapshot, output);
  const body = {} as TaskNotificationInput;
  body.description = title;
  body.error = snapshotString(snapshot, "error");
  body.result = dynamicRun
    ? serializeWorkflowArtifact(packedOutput)
    : stringField(output, "response");
  body.status = deliveryState(status);
  body.summary = `Workflow "${title}"` + workflowSummaryTail(status, outcome);
  body.taskId = taskId;
  body.taskType = "local_workflow";
  body.toolUseId = call.id;
  if (dynamicRun) body.deliveryGuidance = true;
  const script = workflowScriptPathOf(snapshot, dynamicRun);
  if (script !== undefined) {
    body.scriptPath = describeWorkflowScriptPath(script, deps.getWorkingDirectory());
  }
  const reportsSection = dynamicRun
    ? buildWorkflowReportsNotificationSection(workflowReportsOf(snapshot))
    : undefined;
  if (reportsSection !== undefined) body.reports = reportsSection;
  const artifactsSection = dynamicRun
    ? buildWorkflowArtifactsNotificationSection(
        workflowArtifactsOf(snapshot),
        WORKFLOW_ARTIFACTS_NOTIFICATION_MAX_LINES,
      )
    : undefined;
  if (artifactsSection !== undefined) body.artifacts = artifactsSection;
  if (outcome?.runStatus !== undefined) body.runStatus = outcome.runStatus;
  const cause = outcome?.stopCause ?? stoppedByCaller(deps, taskId, status);
  if (cause !== undefined) body.stopReason = cause;
  if (outcome?.failure !== undefined) body.failure = outcome.failure;
  return formatTaskNotification(body);
}

/** bash 正文：标题取 description → command → 固定兜底，退出码只在结果子对象里（B86）。 */
function bashMessage(request: NotificationRequest): string {
  const { call, taskId, status, snapshot, launch } = request;
  const input = isRecord(call.input) ? call.input : ({} as LooseRecord);
  const command = typeof input.command === "string" ? input.command : undefined;
  const description = typeof input.description === "string" ? input.description : undefined;
  const finished = field(snapshot, "result") as { exitCode?: number } | undefined;
  const code = finished?.exitCode;
  const subject = description ?? command ?? BASH_FALLBACK_SUBJECT;
  const state = deliveryState(status);
  const outputFiles = backgroundTaskOutputMetadata(snapshot, launch);
  const body = {} as TaskNotificationInput;
  body.description = description;
  body.outputFile = outputFiles.outputFile;
  body.status = state;
  body.summary = `Background command "${subject}"` + bashSummaryTail(status, state, code);
  body.taskId = taskId;
  body.taskType = "local_bash";
  body.toolUseId = call.id;
  return formatTaskNotification(body);
}

/** 按工具名挑正文装配器：bash / 工作流族有名份，其余工具名没有正文（B86）。 */
function notificationMessage(
  request: NotificationRequest,
  outcome: TerminalOutcome | undefined,
): string | undefined {
  const name = request.call.name;
  if (name === BASH_TOOL) return bashMessage(request);
  if (name === LEGACY_WORKFLOW_TOOL || isDynamicWorkflowRunDispatchToolName(name)) {
    return workflowMessage(request, outcome);
  }
  return undefined;
}

function dateValue(snapshot: SnapshotView, key: string): number | undefined {
  if (!(key in snapshot)) return undefined;
  const value: unknown = (snapshot as unknown as LooseRecord)[key];
  return value instanceof Date ? value.getTime() : undefined;
}

/** 起止时间都在场且差值有限非负时才写 durationMs（B87）。 */
function manifestDuration(snapshot: SnapshotView): number | undefined {
  const started = dateValue(snapshot, "startedAt");
  const completed = dateValue(snapshot, "completedAt");
  if (started === undefined || completed === undefined) return undefined;
  const elapsed = completed - started;
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : undefined;
}

/** 工作流 manifest（B87 的界）：只在三种终态状态上生成，字段按在场性追加。 */
function workflowManifest(
  subject: string,
  status: TaskStatus,
  snapshot: SnapshotView | undefined,
  outcome: TerminalOutcome | undefined,
): LooseRecord | undefined {
  if (snapshot === undefined) return undefined;
  if (status !== "completed" && status !== "failed" && status !== "cancelled") return undefined;
  const manifest = {} as LooseRecord;
  manifest.kind = "terminal";
  manifest.status = outcome?.runStatus;
  if (outcome?.stopCause !== undefined) manifest.stopReason = outcome.stopCause;
  manifest.summary = subject.slice(0, MANIFEST_SUMMARY_LIMIT);
  const packedOutput = field(snapshot, "output");
  const result = serializeWorkflowArtifact(packedOutput);
  if (result !== undefined) {
    manifest.result = result.slice(0, MANIFEST_RESULT_LIMIT);
    if (result.length > MANIFEST_RESULT_LIMIT) manifest.resultTruncated = true;
    manifest.resultForm = typeof packedOutput === "string" ? "prose" : "json";
  }
  const problem = snapshotString(snapshot, "error");
  if (problem !== undefined) manifest.error = problem.slice(0, MANIFEST_ERROR_LIMIT);
  const reportsSection = buildWorkflowReportsManifestSection(workflowReportsOf(snapshot));
  if (reportsSection !== undefined) manifest.reports = reportsSection;
  const artifactsSection = buildWorkflowArtifactsManifestSection(workflowArtifactsOf(snapshot));
  if (artifactsSection !== undefined) {
    manifest.artifacts = artifactsSection.artifacts;
    if (artifactsSection.artifactsTruncated) manifest.artifactsTruncated = true;
  }
  const elapsed = manifestDuration(snapshot);
  if (elapsed !== undefined) manifest.durationMs = elapsed;
  return manifest;
}

/** 标题候选链：自上而下取第一个非空串（B86 的标题回落）。 */
function firstFilled(candidates: readonly (string | undefined)[]): string {
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate.length > 0) return candidate;
  }
  return "";
}

/** 来源元数据（B86）：bash 一条、动态工作流一条（带 manifest），其余工具名不带。 */
function notificationOrigin(
  request: NotificationRequest,
  outcome: TerminalOutcome | undefined,
): BackgroundResultOriginMeta | undefined {
  const { call, taskId, status, snapshot, launch } = request;
  if (call.name === BASH_TOOL) {
    const input = isRecord(call.input) ? (call.input as LooseRecord) : undefined;
    const title = firstFilled([
      stringField(input, "description")?.trim(),
      stringField(input, "command")?.trim(),
      call.name,
      taskId,
    ]);
    const meta = {} as BackgroundResultOriginMeta;
    meta.backgroundSource = "bash";
    meta.title = title;
    meta.workId = taskId;
    return meta;
  }
  if (!isDynamicWorkflowRunDispatchToolName(call.name)) return undefined;
  const subject = workflowSubject(call, taskId, snapshot, launch);
  const manifest = workflowManifest(subject, status, snapshot, outcome);
  const meta = {} as LooseRecord;
  meta.backgroundSource = "workflow";
  meta.title = subject;
  meta.workId = taskId;
  if (manifest !== undefined) meta.workflowNotification = manifest;
  return meta as unknown as BackgroundResultOriginMeta;
}

function taskLogFields(context: NotificationRequest): LooseRecord {
  return { taskId: context.taskId, taskStatus: context.status, toolName: context.call.name };
}

/** 唯一的日志出口：统一补 module 与 trace 字段，端口自身抛错照常向上传播。 */
function writeLog(
  context: NotificationRequest,
  level: LogLevel,
  prose: string,
  extra: LooseRecord,
): void {
  const logger = context.deps.logger;
  if (!logger) return;
  const payload: LogContext = {
    ...traceContextToLogContext(context.traceContext),
    module: LOG_MODULE,
    ...extra,
  };
  logger[level]?.(prose, payload);
}

// 门禁 1：没有入队端口就只留一条 debug，认领位一个都不动（B85.1）。
function gateQueuePortReady(context: DeliveryContext): GateVerdict {
  if (context.deps.enqueueBackgroundTaskNotification) return "proceed";
  writeLog(context, "debug", LOG_QUEUE_UNAVAILABLE, {
    event: EVENT_QUEUE_UNAVAILABLE,
    ...taskLogFields(context),
  });
  return "halt";
}

// 门禁 2：superseded 的 run 先占住认领位再静默，避免同一 run 还能再通知（B85.2）。
function gateNotSuperseded(context: DeliveryContext): GateVerdict {
  const outcome = terminalOutcomeOf(context.snapshot, context.status);
  if (outcome?.stopCause !== "superseded") return "proceed";
  claimRuntimeBackgroundTaskNotification(context.deps, context.call, context.taskId);
  writeLog(context, "info", LOG_SUPPRESSED_SUPERSEDED, {
    event: EVENT_SUPPRESSED,
    reason: REASON_SUPERSEDED,
    ...taskLogFields(context),
  });
  return "halt";
}

// 门禁 3：运行时策略只有返回严格 false 才抑制（B85.3）。
function gateRuntimePolicyAllows(context: DeliveryContext): GateVerdict {
  const decide = context.deps.shouldEnqueueBackgroundTaskNotification;
  if (!decide) return "proceed";
  const allowed = decide({
    runtimeScope: context.deps.runtimeScope,
    status: context.status,
    taskId: context.taskId,
    toolName: context.call.name,
    traceContext: context.traceContext,
  });
  if (allowed !== false) return "proceed";
  writeLog(context, "info", LOG_SUPPRESSED_BY_POLICY, {
    event: EVENT_SUPPRESSED,
    ...taskLogFields(context),
  });
  return "halt";
}

// 门禁 4：装配正文；空正文（含没有正文的工具名）直接弃（B85.4）。
function gateMessageReady(context: DeliveryContext): GateVerdict {
  const message = notificationMessage(context, terminalOutcomeOf(context.snapshot, context.status));
  if (message === undefined || message.length === 0) {
    writeLog(context, "debug", LOG_MESSAGE_EMPTY, {
      event: EVENT_SKIPPED,
      reason: REASON_EMPTY_MESSAGE,
      ...taskLogFields(context),
    });
    return "halt";
  }
  context.message = message;
  return "proceed";
}

// 门禁 5：同一 taskId 只认领一次，认领失败说明别处已经处理（B85.5）。
function gateNotificationUnclaimed(context: DeliveryContext): GateVerdict {
  if (claimRuntimeBackgroundTaskNotification(context.deps, context.call, context.taskId)) {
    return "proceed";
  }
  writeLog(context, "debug", LOG_ALREADY_CLAIMED, {
    event: EVENT_ALREADY_HANDLED,
    ...taskLogFields(context),
  });
  return "halt";
}

const ADMISSION_GATES: readonly AdmissionGate[] = [
  gateQueuePortReady,
  gateNotSuperseded,
  gateRuntimePolicyAllows,
  gateMessageReady,
  gateNotificationUnclaimed,
];

// 交付：先认领后入队；入队（含来源元数据装配）抛错就回滚认领并 warn，不重抛（B85.6）。
function deliverNotification(context: DeliveryContext): void {
  try {
    const origin = notificationOrigin(context, terminalOutcomeOf(context.snapshot, context.status));
    const command = {} as BackgroundTaskNotificationCommand;
    command.taskId = context.taskId;
    command.text = context.message!;
    command.toolName = context.call.name;
    command.traceContext = context.traceContext;
    if (origin !== undefined) command.originMeta = origin;
    context.deps.enqueueBackgroundTaskNotification!(command);
  } catch (error) {
    releaseRuntimeBackgroundTaskNotification(context.deps, context.call, context.taskId);
    writeLog(context, "warn", LOG_ENQUEUE_FAILED, {
      errorMessage: errorMessage(error),
      taskId: context.taskId,
    });
    return;
  }
  writeLog(context, "info", LOG_ENQUEUED, {
    event: EVENT_ENQUEUED,
    ...taskLogFields(context),
  });
}

export function enqueueTerminalNotification(
  deps: Deps,
  call: ToolCall,
  taskId: TaskId,
  status: TaskStatus,
  traceContext: Trace,
  snapshot?: SnapshotView,
  launch?: LaunchOutput,
): void {
  const context: DeliveryContext = {
    deps,
    call,
    taskId,
    status,
    traceContext,
    snapshot,
    launch,
  };
  for (const gate of ADMISSION_GATES) {
    if (gate(context) !== "proceed") return;
  }
  deliverNotification(context);
}
