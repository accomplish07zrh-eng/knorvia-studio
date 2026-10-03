import {
  traceContextToLogContext,
  type BackgroundResultOriginMeta,
  type DynamicWorkflowRunError,
  type TraceContext,
} from "@knorvia/contracts";
import { formatTaskNotification } from "../../runtime-task/notification.js";
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
import type { ToolExecutorDeps } from "./types.js";
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

type TerminalStatus = "completed" | "errored" | "stopped";
type StopReason = "user" | "model" | "provider" | "interrupted" | "superseded";
function terminalFacts(
  snapshot: TaskSnapshot | undefined,
  status: string,
):
  | {
      runStatus: TerminalStatus;
      stopReason?: StopReason;
      failure?: DynamicWorkflowRunError;
    }
  | undefined {
  const record = snapshot as unknown as Record<string, unknown> | undefined;
  const declared = record?.runStatus;
  const runStatus =
    declared === "completed" || declared === "errored" || declared === "stopped"
      ? declared
      : status === "completed"
        ? "completed"
        : status === "failed"
          ? "errored"
          : status === "cancelled"
            ? "stopped"
            : undefined;
  if (runStatus === undefined) return undefined;
  const rawReason = record?.stopReason;
  const stopReason =
    runStatus === "stopped" &&
    (rawReason === "user" ||
      rawReason === "model" ||
      rawReason === "provider" ||
      rawReason === "interrupted" ||
      rawReason === "superseded")
      ? rawReason
      : undefined;
  const failure = isRecord(record?.failure)
    ? (record?.failure as unknown as DynamicWorkflowRunError)
    : undefined;
  return {
    runStatus,
    ...(stopReason === undefined ? {} : { stopReason }),
    ...(failure === undefined ? {} : { failure }),
  };
}

function normalizedStatus(status: string): "completed" | "killed" | "failed" {
  if (status === "completed") return "completed";
  return status === "cancelled" ||
    status === "timed_out" ||
    status === "killed" ||
    status === "stopped"
    ? "killed"
    : "failed";
}
function workflowSummary(
  subject: string,
  status: string,
  runStatus: TerminalStatus | undefined,
  stopReason: string | undefined,
): string {
  const prefix = `Workflow "${subject}"`;
  if (status === "lost") return prefix + " failed because its in-process state was lost.";
  if (runStatus === "errored") return prefix + " errored: the script failed.";
  if (runStatus === "stopped" || normalizedStatus(status) === "killed") {
    const suffix =
      stopReason === "user"
        ? " was stopped by the user."
        : stopReason === "model"
          ? " was stopped by you (TaskStop)."
          : stopReason === "provider"
            ? " was stopped on a provider error."
            : stopReason === "interrupted"
              ? " was stopped: the process that owned it exited."
              : stopReason === "superseded"
                ? " was stopped and superseded by an amended run."
                : " was stopped.";
    return prefix + suffix;
  }
  return prefix + (normalizedStatus(status) === "completed" ? " completed." : " failed.");
}
function workflowArtifacts(snapshot: TaskSnapshot | undefined) {
  return snapshot && "artifacts" in snapshot
    ? toPublishedArtifactSummaries((snapshot as unknown as Record<string, unknown>).artifacts)
    : undefined;
}
function workflowReports(snapshot: TaskSnapshot | undefined): readonly unknown[] | undefined {
  if (snapshot === undefined || !("reports" in snapshot)) return undefined;
  return Array.isArray(snapshot.reports) ? snapshot.reports : undefined;
}
function workflowResult(snapshot: TaskSnapshot | undefined): string | undefined {
  return serializeWorkflowArtifact(field(snapshot, "output"));
}

function workflowManifest(subject: string, status: string, snapshot?: TaskSnapshot) {
  if (!snapshot || (status !== "completed" && status !== "failed" && status !== "cancelled")) {
    return undefined;
  }
  const facts = terminalFacts(snapshot, status);
  const manifest: Record<string, unknown> = {
    kind: "terminal",
    status: facts?.runStatus,
    ...(facts?.stopReason !== undefined ? { stopReason: facts?.stopReason } : {}),
    summary: subject.slice(0, 500),
  };
  const rawOutput = field(snapshot, "output");
  const result = serializeWorkflowArtifact(rawOutput);
  if (result !== undefined) {
    manifest.result = result.slice(0, 4000);
    if (result.length > 4000) manifest.resultTruncated = true;
    manifest.resultForm = typeof rawOutput === "string" ? "prose" : "json";
  }
  const error = snapshotString(snapshot, "error");
  if (error !== undefined) manifest.error = error.slice(0, 2000);
  const reports = buildWorkflowReportsManifestSection(workflowReports(snapshot));
  if (reports !== undefined) manifest.reports = reports;
  const artifacts = buildWorkflowArtifactsManifestSection(workflowArtifacts(snapshot));
  if (artifacts !== undefined) {
    manifest.artifacts = artifacts.artifacts;
    if (artifacts.artifactsTruncated) manifest.artifactsTruncated = true;
  }
  const started =
    "startedAt" in snapshot && snapshot.startedAt instanceof Date
      ? snapshot.startedAt.getTime()
      : undefined;
  const completed =
    "completedAt" in snapshot && snapshot.completedAt instanceof Date
      ? snapshot.completedAt.getTime()
      : undefined;
  if (started !== undefined && completed !== undefined) {
    const duration = completed - started;
    if (Number.isFinite(duration) && duration >= 0) manifest.durationMs = duration;
  }
  return manifest;
}
function workflowText(
  deps: ToolExecutorDeps,
  call: ExecutableToolCall,
  taskId: string,
  status: string,
  snapshot?: TaskSnapshot,
  launch?: Record<string, unknown>,
): string {
  const rawOutput = field(snapshot, "output");
  const output = isRecord(rawOutput) ? rawOutput : launch;
  const subject = workflowSubject(call, taskId, snapshot, output);
  const normalized = normalizedStatus(status);
  const facts = terminalFacts(snapshot, status);
  const stopReason =
    facts?.stopReason ??
    (status === "cancelled" ? deps.runtimeTaskRegistry?.get(taskId)?.stopInitiator : undefined);
  const summary = workflowSummary(subject, status, facts?.runStatus, stopReason);
  const result = isDynamicWorkflowRunDispatchToolName(call.name)
    ? workflowResult(snapshot)
    : stringField(output, "response");
  const dynamic = isDynamicWorkflowRunDispatchToolName(call.name);
  const reports = dynamic
    ? buildWorkflowReportsNotificationSection(workflowReports(snapshot))
    : undefined;
  const artifacts = dynamic
    ? buildWorkflowArtifactsNotificationSection(
        workflowArtifacts(snapshot),
        WORKFLOW_ARTIFACTS_NOTIFICATION_MAX_LINES,
      )
    : undefined;
  const scriptValue =
    dynamic &&
    snapshot !== undefined &&
    "scriptPath" in snapshot &&
    typeof snapshot.scriptPath === "string" &&
    snapshot.scriptPath.length > 0
      ? snapshot.scriptPath
      : undefined;
  return formatTaskNotification({
    description: subject,
    ...(dynamic ? { deliveryGuidance: true } : {}),
    ...(scriptValue === undefined
      ? {}
      : {
          scriptPath: describeWorkflowScriptPath(scriptValue, deps.getWorkingDirectory()),
        }),
    error: snapshotString(snapshot, "error"),
    ...(reports !== undefined ? { reports } : {}),
    ...(artifacts !== undefined ? { artifacts } : {}),
    result,
    status: normalized,
    ...(facts?.runStatus !== undefined ? { runStatus: facts?.runStatus } : {}),
    ...(stopReason !== undefined ? { stopReason: stopReason as StopReason } : {}),
    ...(facts?.failure !== undefined ? { failure: facts?.failure } : {}),
    summary,
    taskId,
    taskType: "local_workflow",
    toolUseId: call.id,
  });
}
function bashText(
  call: ExecutableToolCall,
  taskId: string,
  status: string,
  snapshot?: TaskSnapshot,
  launch?: Record<string, unknown>,
): string {
  const input = isRecord(call.input) ? call.input : {};
  const command = typeof input.command === "string" ? input.command : undefined;
  const description = typeof input.description === "string" ? input.description : undefined;
  const result = field(snapshot, "result") as { exitCode?: number } | undefined;
  const metadata = backgroundTaskOutputMetadata(snapshot, launch);
  const normalized = normalizedStatus(status);
  const exitCode = result?.exitCode;
  const subject = description ?? command ?? "Bash background command";
  const suffix =
    status === "lost"
      ? " failed because its in-process state was lost"
      : normalized === "completed"
        ? " completed" + (exitCode !== undefined ? ` (exit code ${exitCode})` : "")
        : normalized === "failed"
          ? " failed" + (exitCode !== undefined ? ` with exit code ${exitCode}` : "")
          : " was stopped";
  return formatTaskNotification({
    description,
    outputFile: metadata.outputFile,
    status: normalized,
    summary: `Background command "${subject}"` + suffix,
    taskId,
    taskType: "local_bash",
    toolUseId: call.id,
  });
}
function notificationOrigin(
  call: ExecutableToolCall,
  taskId: string,
  status: string,
  snapshot?: TaskSnapshot,
  launch?: Record<string, unknown>,
): BackgroundResultOriginMeta | undefined {
  if (call.name === "Bash") {
    const input = isRecord(call.input) ? call.input : undefined;
    const description = stringField(input, "description")?.trim();
    const command = stringField(input, "command")?.trim();
    const title = description || command || call.name || taskId;
    return { backgroundSource: "bash", title, workId: taskId };
  }
  if (isDynamicWorkflowRunDispatchToolName(call.name)) {
    const subject = workflowSubject(call, taskId, snapshot, launch);
    const workflowNotification = workflowManifest(subject, status, snapshot);
    return {
      backgroundSource: "workflow",
      title: subject,
      workId: taskId,
      ...(workflowNotification !== undefined ? { workflowNotification } : {}),
    } as BackgroundResultOriginMeta;
  }
  return undefined;
}

export function enqueueTerminalNotification(
  deps: ToolExecutorDeps,
  call: ExecutableToolCall,
  taskId: string,
  status: string,
  traceContext: TraceContext,
  snapshot?: TaskSnapshot,
  launch?: Record<string, unknown>,
): void {
  if (!deps.enqueueBackgroundTaskNotification) {
    deps.logger?.debug?.("Background task notification queue unavailable", {
      ...traceContextToLogContext(traceContext),
      event: "background_task.notification.queue_unavailable",
      module: "core.tool.executor",
      taskId: taskId,
      taskStatus: status,
      toolName: call.name,
    });
    return;
  }
  if (terminalFacts(snapshot, status)?.stopReason === "superseded") {
    claimRuntimeBackgroundTaskNotification(deps, call, taskId);
    deps.logger?.info?.("Background task notification suppressed: run superseded", {
      ...traceContextToLogContext(traceContext),
      event: "background_task.notification.suppressed",
      module: "core.tool.executor",
      reason: "workflow_run_superseded",
      taskId: taskId,
      taskStatus: status,
      toolName: call.name,
    });
    return;
  }
  if (
    deps.shouldEnqueueBackgroundTaskNotification?.({
      runtimeScope: deps.runtimeScope,
      status,
      taskId,
      toolName: call.name,
      traceContext,
    }) === false
  ) {
    deps.logger?.info?.("Background task notification suppressed by runtime policy", {
      ...traceContextToLogContext(traceContext),
      event: "background_task.notification.suppressed",
      module: "core.tool.executor",
      taskId: taskId,
      taskStatus: status,
      toolName: call.name,
    });
    return;
  }
  const workflow = call.name === "Workflow" || isDynamicWorkflowRunDispatchToolName(call.name);
  const text = workflow
    ? workflowText(deps, call, taskId, status, snapshot, launch)
    : call.name === "Bash"
      ? bashText(call, taskId, status, snapshot, launch)
      : undefined;
  if (!text) {
    deps.logger?.debug?.("Background task notification skipped without formatted message", {
      ...traceContextToLogContext(traceContext),
      event: "background_task.notification.skipped",
      module: "core.tool.executor",
      reason: "empty_message",
      taskId: taskId,
      taskStatus: status,
      toolName: call.name,
    });
    return;
  }
  if (!claimRuntimeBackgroundTaskNotification(deps, call, taskId)) {
    deps.logger?.debug?.("Background task notification already claimed", {
      ...traceContextToLogContext(traceContext),
      event: "background_task.tracking.notification_already_handled",
      module: "core.tool.executor",
      taskId: taskId,
      taskStatus: status,
      toolName: call.name,
    });
    return;
  }
  try {
    const originMeta = notificationOrigin(call, taskId, status, snapshot, launch);
    deps.enqueueBackgroundTaskNotification!({
      ...(originMeta !== undefined ? { originMeta } : {}),
      taskId,
      text,
      toolName: call.name,
      traceContext,
    });
  } catch (error) {
    releaseRuntimeBackgroundTaskNotification(deps, call, taskId);
    deps.logger?.warn("Background task notification enqueue failed", {
      ...traceContextToLogContext(traceContext),
      errorMessage: errorMessage(error),
      module: "core.tool.executor",
      taskId: taskId,
    });
    return;
  }
  deps.logger?.info?.("Background task notification enqueued", {
    ...traceContextToLogContext(traceContext),
    event: "background_task.notification.enqueued",
    module: "core.tool.executor",
    taskId: taskId,
    taskStatus: status,
    toolName: call.name,
  });
}
