import type { BrowserWindow, UtilityProcess } from "electron";
import { HostMessageTypes, HostResponseTypes, hostResponseMessageSchema } from "@knorvia/shared";
import type { spawnHostProcess } from "../desktopHostProcess.js";
import type { bindDatabaseStartupRelay } from "../databaseStartupRelay.js";
import type { createHostLogRelay } from "../hostLogRelay.js";
import { ingestToolExecResource } from "../desktopResourceTelemetry.js";
import { ingestMcpResourceSamples } from "../processResourceMcpTelemetrySource.js";
import { ingestHostNetworkObservations } from "../desktopNetworkTelemetry.js";
import { ingestCliResourceSample } from "../processResourceCliSource.js";
import { ingestHostSelfResourceSample } from "../processResourceSelfHeapSource.js";
import { resolveHostResourceUsageResult } from "../resourceManagerHostSampling.js";
import { registerHostAgentProcess, unregisterHostAgentProcess } from "../resourceManagerWindow.js";
import { createFeedbackLogArchiveFromExportLogs } from "../exportLogs.js";
type Dependencies = Parameters<typeof spawnHostProcess>[3];
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
export function dispatchHostMessage(
  win: BrowserWindow,
  child: UtilityProcess,
  label: string,
  dependencies: Dependencies,
  database: ReturnType<typeof bindDatabaseStartupRelay>,
  logs: ReturnType<typeof createHostLogRelay>,
  message: unknown,
): void {
  const result = hostResponseMessageSchema.safeParse(message);
  if (!result.success) return;
  if (result.data.type === HostResponseTypes.DatabaseStartupState) {
    database.receive(result.data.state);
    return;
  }
  if (result.data.type === HostResponseTypes.Log) {
    logs.onStructuredLog(result.data);
    return;
  }
  if (result.data.type === HostResponseTypes.NetworkTelemetryBatch) {
    ingestHostNetworkObservations(result.data.observations);
    return;
  }
  if (result.data.type === HostResponseTypes.AgentResourceSample) {
    ingestCliResourceSample(
      result.data.sample,
      result.data.runtimeSurface,
      result.data.environmentKey,
    );
    return;
  }
  if (result.data.type === HostResponseTypes.HostResourceSample) {
    ingestHostSelfResourceSample(result.data.sample);
    return;
  }
  if (result.data.type === HostResponseTypes.ResourceUsageSnapshotResult) {
    resolveHostResourceUsageResult(label, result.data);
    return;
  }
  if (result.data.type === HostResponseTypes.ToolExecResource) {
    ingestToolExecResource(result.data.sample, result.data.runtimeSurface);
    return;
  }
  if (result.data.type === HostResponseTypes.McpResourceSamples) {
    ingestMcpResourceSamples(
      result.data.samples,
      result.data.runtimeSurface,
      result.data.environmentKey,
    );
    return;
  }
  if (result.data.type === HostResponseTypes.McpTelemetry) {
    dependencies.onMcpTelemetry?.(result.data);
    return;
  }
  if (result.data.type === HostResponseTypes.SessionCreateTelemetry) {
    dependencies.onSessionCreateTelemetry?.(result.data);
    return;
  }
  if (result.data.type === HostResponseTypes.LocalMediaPreviewPathAuthorizeRequest) {
    const request = result.data;
    const authorize = dependencies.authorizeLocalMediaPreviewPath;
    if (!authorize) {
      child.postMessage({
        type: HostMessageTypes.LocalMediaPreviewPathAuthorizeResult,
        requestId: request.requestId,
        ok: false,
        error: "Local media preview path authorization is unavailable.",
      });
      return;
    }
    void authorize(request.path)
      .then((path) => {
        child.postMessage({
          type: HostMessageTypes.LocalMediaPreviewPathAuthorizeResult,
          requestId: request.requestId,
          ok: true,
          path,
        });
      })
      .catch((error) => {
        child.postMessage({
          type: HostMessageTypes.LocalMediaPreviewPathAuthorizeResult,
          requestId: request.requestId,
          ok: false,
          error: messageOf(error),
        });
      });
    return;
  }
  if (result.data.type === HostResponseTypes.CuaOperationState) {
    dependencies.onCuaOperationStateChanged?.(child, result.data);
    return;
  }
  if (result.data.type === HostResponseTypes.FeedbackLogArchiveRequest) {
    const request = result.data;
    void createFeedbackLogArchiveFromExportLogs(request.sourceDir)
      .then((archive) => {
        child.postMessage({
          type: HostMessageTypes.FeedbackLogArchiveResult,
          requestId: request.requestId,
          ok: true,
          path: archive.path,
          size: archive.size,
        });
      })
      .catch((error) => {
        child.postMessage({
          type: HostMessageTypes.FeedbackLogArchiveResult,
          requestId: request.requestId,
          ok: false,
          error: messageOf(error),
        });
      });
    return;
  }
  if (result.data.type === HostResponseTypes.BrowserExecuteRequest) {
    const requestId = result.data.requestId;
    const execute = dependencies.handleBrowserExecuteRequest;
    const pending = execute
      ? execute({
          win,
          requestId,
          browserId: result.data.browserId,
          browserGeneration: result.data.browserGeneration,
          sessionId: result.data.sessionId,
          turnId: result.data.turnId,
          workspaceKey: result.data.workspaceKey,
          workspacePath: result.data.workspacePath,
          workspaceIdentity: result.data.workspaceIdentity,
          remoteSessionId: result.data.remoteSessionId,
          clientMode: result.data.clientMode,
          sessionContext: result.data.sessionContext,
          command: result.data.command,
        }).catch((error: unknown) => ({
          ok: false,
          error: { code: "execution_error", message: messageOf(error) },
          elapsedMs: 0,
        }))
      : Promise.resolve({
          ok: false,
          error: { code: "backend_unavailable", message: "browser executor not ready" },
          elapsedMs: 0,
        });
    void pending.then((commandResult) => {
      child.postMessage({
        type: HostMessageTypes.BrowserExecuteResult,
        requestId,
        result: commandResult,
      });
    });
    return;
  }
  if (result.data.type === HostResponseTypes.AgentProcessSpawned) {
    registerHostAgentProcess(label, {
      pid: result.data.pid,
      provider: result.data.provider,
      workspacePath: result.data.workspacePath,
      command: result.data.command,
      args: result.data.args,
      startedAt: result.data.startedAt,
    });
    dependencies.onAgentProcessSpawned?.(result.data);
    return;
  }
  if (result.data.type === HostResponseTypes.AgentProcessReady) {
    dependencies.onAgentProcessReady?.(result.data);
    return;
  }
  if (result.data.type === HostResponseTypes.AgentProcessExited) {
    unregisterHostAgentProcess(label, result.data.pid);
    dependencies.onAgentProcessExited?.(result.data);
    return;
  }
  if (result.data.type === HostResponseTypes.AgentProcessError) {
    dependencies.onAgentProcessError?.(result.data);
    return;
  }
  if (result.data.type === HostResponseTypes.AgentProcessException) {
    dependencies.onAgentProcessException?.(result.data);
    return;
  }
  if (result.data.type === HostResponseTypes.CronRunResult) {
    dependencies.onCronRunResult?.({
      runId: result.data.runId,
      ok: result.data.ok,
      taskId: result.data.taskId,
      sessionId: result.data.sessionId,
      error: result.data.error,
      failureKind: result.data.failureKind,
    });
    return;
  }
  if (result.data.type === HostResponseTypes.OffPeakRunResult) {
    dependencies.onOffPeakRunResult?.({
      offPeakTaskId: result.data.offPeakTaskId,
      ok: result.data.ok,
      conversationId: result.data.conversationId,
      sessionId: result.data.sessionId,
      error: result.data.error,
      failureKind: result.data.failureKind,
    });
    return;
  }
  if (result.data.type === HostResponseTypes.CronSchedulerWakeRequest) {
    dependencies.onCronSchedulerWakeRequested?.(result.data.automationId);
    return;
  }
  if (result.data.type === HostResponseTypes.OffPeakSchedulerWakeRequest) {
    dependencies.onOffPeakSchedulerWakeRequested?.(result.data.offPeakTaskId);
    return;
  }
  if (result.data.type === HostResponseTypes.AgentRunningTaskCountChanged) {
    if (result.data.runningTaskCount > 0)
      dependencies.hostRunningTaskCountMap.set(child, result.data.runningTaskCount);
    else dependencies.hostRunningTaskCountMap.delete(child);
    dependencies.logger.info(
      `[app-quit] host running agent sessions updated (${label}) count=${result.data.runningTaskCount}`,
    );
    return;
  }
  if (result.data.type === HostResponseTypes.WorkspaceRunningTaskCountChanged)
    dependencies.onWorkspaceRunningTaskCountChanged?.(child, {
      workspacePath: result.data.workspacePath,
      workspaceIdentity: result.data.workspaceIdentity,
      runningTaskCount: result.data.runningTaskCount,
    });
}
