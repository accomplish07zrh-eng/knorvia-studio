import { serializeWorkflowArtifact, } from "@knorvia/contracts";
import { formatTaskNotification } from "../../runtime-task/notification.js";
import { describeWorkflowScriptPath } from "../handlers/workflow-script-path.js";
import { backgroundTaskOutputMetadata } from "./background-task-output.js";
import { claimRuntimeBackgroundTaskNotification, isDynamicWorkflowRunDispatchToolName, releaseRuntimeBackgroundTaskNotification, } from "./background-task-registry.js";
import { errorMessage, field, stringField, taskLogFacts, workflowSubject, } from "./background-tracker-projection.js";
import { isRecord } from "./utils.js";
import { buildWorkflowReportsManifestSection, buildWorkflowReportsNotificationSection, } from "./workflow-artifact.js";
import { buildWorkflowArtifactsManifestSection, buildWorkflowArtifactsNotificationSection, toPublishedArtifactSummaries, WORKFLOW_ARTIFACTS_NOTIFICATION_MAX_LINES, } from "./workflow-published-artifacts.js";
function terminalFacts(snapshot, status) {
    const declared = field(snapshot, "runStatus");
    const runStatus = declared === "completed" || declared === "errored" || declared === "stopped"
        ? declared
        : status === "completed" ? "completed"
            : status === "failed" ? "errored"
                : status === "cancelled" ? "stopped"
                    : undefined;
    const rawReason = field(snapshot, "stopReason");
    const stopReason = runStatus === "stopped"
        && (rawReason === "user" || rawReason === "model" || rawReason === "provider"
            || rawReason === "interrupted" || rawReason === "superseded")
        ? rawReason : undefined;
    const rawFailure = field(snapshot, "failure");
    return {
        runStatus,
        stopReason,
        failure: isRecord(rawFailure) ? rawFailure : undefined,
    };
}
function normalizedStatus(status) {
    if (status === "completed")
        return "completed";
    return status === "cancelled" || status === "timed_out" || status === "killed" || status === "stopped"
        ? "killed" : "failed";
}
function workflowSummary(subject, status, runStatus, stopReason) {
    const prefix = `Workflow "${subject}"`;
    if (status === "lost")
        return prefix + " failed because its in-process state was lost.";
    if (runStatus === "errored")
        return prefix + " errored: the script failed.";
    if (runStatus === "stopped" || normalizedStatus(status) === "killed") {
        const suffix = stopReason === "user" ? " was stopped by the user."
            : stopReason === "model" ? " was stopped by you (TaskStop)."
                : stopReason === "provider" ? " was stopped on a provider error."
                    : stopReason === "interrupted" ? " was stopped: the process that owned it exited."
                        : stopReason === "superseded" ? " was stopped and superseded by an amended run."
                            : " was stopped.";
        return prefix + suffix;
    }
    return prefix + (normalizedStatus(status) === "completed" ? " completed." : " failed.");
}
function workflowArtifacts(snapshot) {
    return snapshot && "artifacts" in snapshot
        ? toPublishedArtifactSummaries(field(snapshot, "artifacts")) : undefined;
}
function workflowReports(snapshot) {
    const reports = field(snapshot, "reports");
    return Array.isArray(reports) ? reports : undefined;
}
function workflowResult(snapshot) {
    return snapshot && "output" in snapshot
        ? serializeWorkflowArtifact(field(snapshot, "output")) : undefined;
}
function workflowManifest(subject, status, snapshot) {
    if (!snapshot || (status !== "completed" && status !== "failed" && status !== "cancelled")) {
        return undefined;
    }
    const facts = terminalFacts(snapshot, status);
    const manifest = {
        kind: "terminal",
        status: facts.runStatus,
        ...(facts.stopReason !== undefined ? { stopReason: facts.stopReason } : {}),
        summary: subject.slice(0, 500),
    };
    const result = workflowResult(snapshot);
    if (result !== undefined) {
        manifest.result = result.slice(0, 4000);
        if (result.length > 4000)
            manifest.resultTruncated = true;
        manifest.resultForm = typeof field(snapshot, "output") === "string" ? "prose" : "json";
    }
    const error = stringField(snapshot, "error");
    if (error !== undefined)
        manifest.error = error.slice(0, 2000);
    const reports = buildWorkflowReportsManifestSection(workflowReports(snapshot));
    if (reports !== undefined)
        manifest.reports = reports;
    const artifacts = buildWorkflowArtifactsManifestSection(workflowArtifacts(snapshot));
    if (artifacts !== undefined) {
        manifest.artifacts = artifacts.artifacts;
        if (artifacts.artifactsTruncated)
            manifest.artifactsTruncated = true;
    }
    if (snapshot.startedAt instanceof Date && snapshot.completedAt instanceof Date) {
        const duration = snapshot.completedAt.getTime() - snapshot.startedAt.getTime();
        if (Number.isFinite(duration) && duration >= 0)
            manifest.durationMs = duration;
    }
    return manifest;
}
function workflowText(deps, call, taskId, status, snapshot, launch) {
    const dynamic = isDynamicWorkflowRunDispatchToolName(call.name);
    const subject = workflowSubject(call, taskId, snapshot, launch);
    const rawOutput = field(snapshot, "output");
    const output = isRecord(rawOutput) ? rawOutput : launch;
    const facts = terminalFacts(snapshot, status);
    const stopReason = facts.stopReason
        ?? (status === "cancelled" ? deps.runtimeTaskRegistry?.get(taskId)?.stopInitiator : undefined);
    const result = dynamic ? workflowResult(snapshot) : stringField(output, "response");
    const reports = dynamic
        ? buildWorkflowReportsNotificationSection(workflowReports(snapshot)) : undefined;
    const artifacts = dynamic
        ? buildWorkflowArtifactsNotificationSection(workflowArtifacts(snapshot), WORKFLOW_ARTIFACTS_NOTIFICATION_MAX_LINES) : undefined;
    const rawScriptPath = dynamic ? stringField(snapshot, "scriptPath") : undefined;
    const scriptPath = rawScriptPath
        ? describeWorkflowScriptPath(rawScriptPath, deps.getWorkingDirectory()) : undefined;
    return formatTaskNotification({
        description: subject,
        ...(dynamic ? { deliveryGuidance: true } : {}),
        ...(scriptPath !== undefined ? { scriptPath } : {}),
        error: stringField(snapshot, "error"),
        ...(reports !== undefined ? { reports } : {}),
        ...(artifacts !== undefined ? { artifacts } : {}),
        result,
        status: normalizedStatus(status),
        ...(facts.runStatus !== undefined ? { runStatus: facts.runStatus } : {}),
        ...(stopReason !== undefined ? { stopReason: stopReason } : {}),
        ...(facts.failure !== undefined ? { failure: facts.failure } : {}),
        summary: workflowSummary(subject, status, facts.runStatus, stopReason),
        taskId,
        taskType: "local_workflow",
        toolUseId: call.id,
    });
}
function bashText(call, taskId, status, snapshot, launch) {
    const input = isRecord(call.input) ? call.input : undefined;
    const subject = stringField(input, "description")
        ?? stringField(input, "command") ?? "Bash background command";
    const normalized = normalizedStatus(status);
    const result = field(snapshot, "result");
    const exitCode = field(isRecord(result) ? result : undefined, "exitCode");
    const suffix = status === "lost" ? " failed because its in-process state was lost"
        : normalized === "completed" ? " completed" + (exitCode !== undefined ? ` (exit code ${exitCode})` : "")
            : normalized === "failed" ? " failed" + (exitCode !== undefined ? ` with exit code ${exitCode}` : "")
                : " was stopped";
    const metadata = backgroundTaskOutputMetadata(snapshot, launch);
    return formatTaskNotification({
        description: stringField(input, "description"),
        outputFile: metadata.outputFile,
        status: normalized,
        summary: `Background command "${subject}"` + suffix,
        taskId,
        taskType: "local_bash",
        toolUseId: call.id,
    });
}
function notificationOrigin(call, taskId, status, snapshot, launch) {
    if (call.name === "Bash") {
        const input = isRecord(call.input) ? call.input : undefined;
        const title = stringField(input, "description")?.trim()
            || stringField(input, "command")?.trim() || call.name || taskId;
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
        };
    }
    return undefined;
}
export function enqueueTerminalNotification(deps, call, taskId, status, traceContext, snapshot, launch) {
    if (!deps.enqueueBackgroundTaskNotification) {
        deps.logger?.debug("Background task notification queue unavailable", {
            ...taskLogFacts(traceContext, taskId, call.name),
            event: "background_task.notification.queue_unavailable", taskStatus: status,
        });
        return;
    }
    const workflow = call.name === "Workflow" || isDynamicWorkflowRunDispatchToolName(call.name);
    if (workflow && terminalFacts(snapshot, status).stopReason === "superseded") {
        claimRuntimeBackgroundTaskNotification(deps, call, taskId);
        deps.logger?.info("Background task notification suppressed: run superseded", {
            ...taskLogFacts(traceContext, taskId, call.name),
            event: "background_task.notification.suppressed", reason: "workflow_run_superseded", taskStatus: status,
        });
        return;
    }
    if (deps.shouldEnqueueBackgroundTaskNotification?.({
        runtimeScope: deps.runtimeScope, status, taskId, toolName: call.name, traceContext,
    }) === false) {
        deps.logger?.info("Background task notification suppressed by runtime policy", {
            ...taskLogFacts(traceContext, taskId, call.name),
            event: "background_task.notification.suppressed", taskStatus: status,
        });
        return;
    }
    const text = workflow ? workflowText(deps, call, taskId, status, snapshot, launch)
        : call.name === "Bash" ? bashText(call, taskId, status, snapshot, launch) : undefined;
    if (!text) {
        deps.logger?.debug("Background task notification skipped without formatted message", {
            ...taskLogFacts(traceContext, taskId, call.name),
            event: "background_task.notification.skipped", reason: "empty_message", taskStatus: status,
        });
        return;
    }
    if (!claimRuntimeBackgroundTaskNotification(deps, call, taskId)) {
        deps.logger?.debug("Background task notification already claimed", {
            ...taskLogFacts(traceContext, taskId, call.name),
            event: "background_task.tracking.notification_already_handled", taskStatus: status,
        });
        return;
    }
    try {
        const originMeta = notificationOrigin(call, taskId, status, snapshot, launch);
        deps.enqueueBackgroundTaskNotification({
            ...(originMeta !== undefined ? { originMeta } : {}), taskId, text, toolName: call.name, traceContext,
        });
    }
    catch (error) {
        releaseRuntimeBackgroundTaskNotification(deps, call, taskId);
        deps.logger?.warn("Background task notification enqueue failed", {
            ...taskLogFacts(traceContext, taskId), errorMessage: errorMessage(error),
        });
        return;
    }
    deps.logger?.info("Background task notification enqueued", {
        ...taskLogFacts(traceContext, taskId, call.name),
        event: "background_task.notification.enqueued", taskStatus: status,
    });
}
