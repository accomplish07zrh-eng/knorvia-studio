import { randomUUID } from "node:crypto";
import { BrowserWindow } from "electron";
import { buildRemoteWorkspaceIdentity, HostMessageTypes } from "@knorvia/shared";
import type { ManagerContext, ManagerResult } from "./types.js";
import type { AttachmentOwner } from "./attachments.js";
import type { HostLifecycleOwner } from "./lifecycle.js";
import { detach, targetKey } from "./common.js";
export function createSessionControls(
  context: ManagerContext,
  attachments: AttachmentOwner,
  lifecycle: HostLifecycleOwner,
) {
  const { options, state } = context;
  const bindRemoteWorkspaceSessionContext: ManagerResult["bindRemoteWorkspaceSessionContext"] =
    async (sessionId, workspace, expectedWebContentsId) => {
      const route = state.routes.get(sessionId);
      if (!route) {
        if (expectedWebContentsId != null)
          throw new Error(`未找到远程 workspace session，sessionId=${sessionId}`);
        return;
      }
      if (expectedWebContentsId != null && route.webContentsId !== expectedWebContentsId)
        throw new Error(`远程 workspace session 不属于当前窗口，sessionId=${sessionId}`);
      const workspaceIdentity =
        workspace.workspaceIdentity?.trim() ||
        buildRemoteWorkspaceIdentity(workspace.workspacePath, route.descriptor.target);
      const child = options.windowHostProcessMap.get(route.webContentsId);
      const win = BrowserWindow.getAllWindows().find(
        (candidate) => candidate.webContents.id === route.webContentsId,
      );
      if (!child || !win)
        throw new Error(`未找到远程 workspace 所属窗口 Host，sessionId=${sessionId}`);
      child.postMessage({
        type: HostMessageTypes.BindRemoteWorkspaceContext,
        requestId: randomUUID(),
        remoteSessionId: sessionId,
        workspacePath: workspace.workspacePath,
        workspaceIdentity,
      });
      route.descriptor = {
        ...route.descriptor,
        workspacePath: workspace.workspacePath,
        workspaceIdentity,
        generation: route.descriptor.generation + 1,
      };
      await attachments.attachRendererPort(win, route, "workspace-context-bound");
    };
  const reattachRemoteWorkspaceSessionsForWindow: ManagerResult["reattachRemoteWorkspaceSessionsForWindow"] =
    (win, reason) => {
      for (const route of state.routes.values()) {
        if (route.webContentsId === win.webContents.id && route.attachmentState === "attachable") {
          void attachments
            .attachRendererPort(win, route, reason)
            .catch((error) =>
              options.logger.warn("[window-host-remote] renderer reattach failed", {
                sessionId: route.descriptor.remoteSessionId,
                reason,
                error,
              }),
            );
        }
      }
    };
  const getRemoteConnectionStats: ManagerResult["getRemoteConnectionStats"] = () => {
    const active = Array.from(state.routes.values()).filter(
      (route) =>
        route.remoteUsageTelemetryEligible &&
        route.attachmentState === "attachable" &&
        route.connectFinalized,
    );
    return {
      activeSessionCount: active.length,
      activeTargetCount: new Set(active.map((route) => targetKey(route.descriptor.target))).size,
    };
  };
  const disposeRemoteWorkspaceSession: ManagerResult["disposeRemoteWorkspaceSession"] = (
    sessionId,
    _reason,
  ) => {
    const route = state.routes.get(sessionId);
    if (!route) return;
    lifecycle.retireActiveRoute(route, "disposed", () => {
      state.routes.delete(sessionId);
    });
    const child = options.windowHostProcessMap.get(route.webContentsId);
    const pending = route.pendingRendererAttachment;
    if (pending) {
      clearTimeout(pending.timeout);
      route.pendingRendererAttachment = undefined;
      if (child) detach(context, child, pending.attachmentId, "session-disposed");
      pending.reject(new Error(`远程 workspace session 已释放，sessionId=${sessionId}`));
    }
    if (!child) return;
    if (route.rendererAttachmentId)
      child.postMessage({
        type: HostMessageTypes.DetachServicePort,
        attachmentId: route.rendererAttachmentId,
      });
    child.postMessage({
      type: HostMessageTypes.DisposeRemoteWorkspaceSession,
      requestId: randomUUID(),
      remoteSessionId: sessionId,
    });
  };
  const disposeRemoteWorkspaceSessionsForWindow: ManagerResult["disposeRemoteWorkspaceSessionsForWindow"] =
    (webContentsId) => {
      for (const [sessionId, route] of Array.from(state.routes)) {
        if (route.webContentsId !== webContentsId) continue;
        lifecycle.retireActiveRoute(route, "window-closed", () => {
          state.routes.delete(sessionId);
        });
        if (route.pendingRendererAttachment) {
          clearTimeout(route.pendingRendererAttachment.timeout);
          route.pendingRendererAttachment.reject(new Error("窗口已关闭，attachment 已取消"));
        }
      }
      for (const [key, pending] of Array.from(state.pending)) {
        if (pending.webContentsId === webContentsId) {
          state.pending.delete(key);
          pending.reject(new Error("窗口已关闭，远程连接已取消"));
        }
      }
    };
  const cancelPendingRemoteWorkspaceSessionsForWindow: ManagerResult["cancelPendingRemoteWorkspaceSessionsForWindow"] =
    (webContentsId, _reason, requestId) => {
      const child = options.windowHostProcessMap.get(webContentsId);
      if (!child) return;
      for (const pending of state.pending.values())
        if (
          pending.webContentsId === webContentsId &&
          (!requestId || pending.requestId === requestId)
        )
          child.postMessage({
            type: HostMessageTypes.CancelRemoteWorkspaceConnect,
            requestId: pending.requestId,
          });
    };
  const disposeAllAndWaitForAppShutdown: ManagerResult["disposeAllAndWaitForAppShutdown"] = async (
    _reason,
  ) => {
    state.appShutdownStarted = true;
    const error = new Error("应用正在退出，远程连接已取消");
    for (const pending of state.pending.values()) pending.reject(error);
    state.pending.clear();
    for (const [sessionId, route] of Array.from(state.routes)) {
      lifecycle.retireActiveRoute(route, "app-shutdown", () => {
        state.routes.delete(sessionId);
      });
      if (route.pendingRendererAttachment) {
        clearTimeout(route.pendingRendererAttachment.timeout);
        route.pendingRendererAttachment.reject(error);
      }
    }
    state.routes.clear();
  };
  return {
    bindRemoteWorkspaceSessionContext,
    reattachRemoteWorkspaceSessionsForWindow,
    getRemoteConnectionStats,
    disposeRemoteWorkspaceSession,
    disposeRemoteWorkspaceSessionsForWindow,
    cancelPendingRemoteWorkspaceSessionsForWindow,
    disposeAllAndWaitForAppShutdown,
  };
}
