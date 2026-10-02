import { randomUUID } from "node:crypto";
import { BrowserWindow } from "electron";
import { HostMessageTypes } from "@knorvia/shared";
import type { GetWindowHost, ManagerContext, ManagerResult } from "./types.js";
import type { AttachmentOwner } from "./attachments.js";
import { emitLog, requestKey } from "./common.js";
export function createConnectionOwner(
  context: ManagerContext,
  getHost: GetWindowHost,
  attachments: AttachmentOwner,
) {
  const { options, state } = context;
  const createRemoteWorkspaceSession: ManagerResult["createRemoteWorkspaceSession"] = async (
    win,
    target,
    requestId,
    workspace,
    lifecycle,
  ) => {
    if (state.appShutdownStarted) throw new Error("应用正在退出，无法创建远程工作区连接");
    const child = getHost(win);
    const resolvedTarget =
      target.kind === "wsl" && options.resolveWslTarget
        ? await options.resolveWslTarget(target)
        : target;
    if (state.appShutdownStarted) throw new Error("应用正在退出，无法创建远程工作区连接");
    if (win.isDestroyed() || win.webContents.isDestroyed())
      throw new Error("窗口已关闭，无法创建远程工作区连接");
    const resolvedRequestId = requestId ?? randomUUID();
    const key = requestKey(win.webContents.id, resolvedRequestId);
    if (state.pending.has(key))
      throw new Error(`远程连接 requestId 重复，requestId=${resolvedRequestId}`);
    emitLog(win, {
      requestId: resolvedRequestId,
      level: "info",
      message: `正在通过窗口 Host 连接 ${resolvedTarget.kind} workspace`,
    });
    return new Promise<string>((resolve, reject) => {
      state.pending.set(key, {
        requestId: resolvedRequestId,
        webContentsId: win.webContents.id,
        win,
        remoteUsageTelemetryEligible: lifecycle?.remoteUsageTelemetryEligible ?? false,
        resolve,
        reject,
      });
      child.postMessage({
        type: HostMessageTypes.ConnectRemoteWorkspace,
        requestId: resolvedRequestId,
        target: resolvedTarget,
        remoteAssets: options.resolveRemoteAssetDirs(),
        ...(workspace?.workspacePath ? { workspacePath: workspace.workspacePath } : {}),
        ...(workspace?.workspaceIdentity ? { workspaceIdentity: workspace.workspaceIdentity } : {}),
      });
    });
  };
  const attachRemoteWorkspaceSessionHost: ManagerResult["attachRemoteWorkspaceSessionHost"] = (
    params,
  ) => {
    const route = state.routes.get(params.remoteSessionId);
    if (!route)
      throw Object.assign(
        new Error(`未找到远程 workspace session，sessionId=${params.remoteSessionId}`),
        { code: "REMOTE_SESSION_MISSING" },
      );
    if (route.attachmentState !== "attachable")
      throw Object.assign(new Error("远程 workspace source 当前离线"), {
        code: "REMOTE_SESSION_OFFLINE",
      });
    const win = BrowserWindow.fromId(params.windowId);
    if (!win || win.webContents.id !== route.webContentsId)
      throw Object.assign(new Error("远程 workspace session 不属于当前窗口"), {
        code: "REMOTE_SESSION_WINDOW_MISMATCH",
      });
    const descriptor = route.descriptor;
    if (
      descriptor.workspacePath !== params.workspacePath ||
      descriptor.workspaceIdentity !== params.workspaceIdentity ||
      params.workspaceKey !== params.workspaceIdentity
    )
      throw Object.assign(new Error("远程 workspaceKey 与 logical session 不匹配。"), {
        code: "REMOTE_WORKSPACE_IDENTITY_MISMATCH",
      });
    const process = getHost(win);
    const { port1, port2 } = attachments.createChannel();
    process.postMessage(
      {
        type: HostMessageTypes.AttachServicePort,
        requestId: randomUUID(),
        attachmentId: randomUUID(),
        clientMode: params.clientMode,
        scope: {
          kind: "remote",
          remoteSessionId: params.remoteSessionId,
          workspacePath: params.workspacePath,
          workspaceIdentity: params.workspaceIdentity,
        },
      },
      [port2],
    );
    return { process, port: port1, remoteKind: descriptor.target.kind };
  };
  return { createRemoteWorkspaceSession, attachRemoteWorkspaceSessionHost };
}
