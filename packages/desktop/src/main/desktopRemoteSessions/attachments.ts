import { randomUUID } from "node:crypto";
import { MessageChannelMain, type BrowserWindow } from "electron";
import { HostMessageTypes, InternalChannels } from "@knorvia/shared";
import type { GetWindowHost, ManagerContext, RemoteAttachmentRoute } from "./types.js";
import { asError, closePort, detach } from "./common.js";
export function createAttachmentOwner(context: ManagerContext, getHost: GetWindowHost) {
  const { options, state } = context;
  function createChannel() {
    return options.createMessageChannel?.() ?? new MessageChannelMain();
  }
  async function attachRendererPort(
    win: BrowserWindow,
    route: RemoteAttachmentRoute,
    reason: string,
  ): Promise<void> {
    if (win.isDestroyed() || win.webContents.isDestroyed())
      throw new Error("窗口已关闭，无法 attachment 远程 workspace");
    const child = getHost(win);
    const descriptor = route.descriptor;
    if (!descriptor.workspacePath || !descriptor.workspaceIdentity)
      throw new Error(
        `远程 descriptor 缺少 workspace scope，sessionId=${descriptor.remoteSessionId}`,
      );
    const { port1, port2 } = createChannel();
    const attachmentId = randomUUID();
    const previousAttachmentId = route.rendererAttachmentId;
    const superseded = route.pendingRendererAttachment;
    if (superseded) {
      clearTimeout(superseded.timeout);
      route.pendingRendererAttachment = undefined;
      detach(context, child, superseded.attachmentId, "superseded");
      superseded.reject(
        new Error(`renderer attachment 已被后续换代替代，sessionId=${descriptor.remoteSessionId}`),
      );
    }
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const pending = route.pendingRendererAttachment;
        if (!pending || pending.attachmentId !== attachmentId) return;
        route.pendingRendererAttachment = undefined;
        detach(context, child, attachmentId, "ready-timeout");
        const error = new Error(
          `renderer attachment ready 超时，sessionId=${descriptor.remoteSessionId}`,
        );
        options.logger.warn("[window-host-remote] renderer attachment ready timeout", {
          sessionId: descriptor.remoteSessionId,
          attachmentId,
          reason,
        });
        reject(error);
      }, options.rendererAttachmentReadyTimeoutMs ?? 15000);
      timeout.unref?.();
      route.pendingRendererAttachment = {
        attachmentId,
        previousAttachmentId,
        reason,
        timeout,
        resolve,
        reject,
      };
      try {
        child.postMessage(
          {
            type: HostMessageTypes.AttachServicePort,
            requestId: randomUUID(),
            attachmentId,
            clientMode: "desktop-continuous",
            scope: {
              kind: "remote",
              remoteSessionId: descriptor.remoteSessionId,
              workspacePath: descriptor.workspacePath,
              workspaceIdentity: descriptor.workspaceIdentity,
            },
          },
          [port2],
        );
        win.webContents.postMessage(
          InternalChannels.ScopedServicePort,
          { attachmentId, sessionId: descriptor.remoteSessionId, target: descriptor.target },
          [port1],
        );
      } catch (error) {
        clearTimeout(timeout);
        route.pendingRendererAttachment = undefined;
        detach(context, child, attachmentId, "delivery-failed");
        closePort(port1);
        closePort(port2);
        reject(asError(error));
      }
    });
  }
  function confirmRendererAttachmentReady(
    webContentsId: number,
    payload: { sessionId: string; attachmentId: string },
  ): void {
    const route = state.routes.get(payload.sessionId);
    const pending = route?.pendingRendererAttachment;
    if (
      !route ||
      route.webContentsId !== webContentsId ||
      !pending ||
      pending.attachmentId !== payload.attachmentId
    ) {
      options.logger.warn("[window-host-remote] ignore stale renderer attachment ready", {
        webContentsId,
        sessionId: payload.sessionId,
        attachmentId: payload.attachmentId,
      });
      return;
    }
    clearTimeout(pending.timeout);
    route.pendingRendererAttachment = undefined;
    const child = options.windowHostProcessMap.get(route.webContentsId);
    if (!child || child.pid == null) {
      pending.reject(new Error(`窗口 Local Host 已退出，sessionId=${payload.sessionId}`));
      return;
    }
    route.rendererAttachmentId = pending.attachmentId;
    if (pending.previousAttachmentId)
      detach(context, child, pending.previousAttachmentId, "candidate-promoted");
    options.logger.info(
      `[window-host-remote] renderer attachment ready, sessionId=${payload.sessionId}, reason=${pending.reason}`,
    );
    if (!route.connectFinalized) {
      route.connectFinalized = true;
      if (route.remoteUsageTelemetryEligible) {
        try {
          options.reportRemoteConnectionStateChanged?.({
            rendererId: route.webContentsId,
            remoteKind: route.descriptor.target.kind,
            transition: "connected",
          });
        } catch (error) {
          options.logger.warn("[remote-usage-arms] connected reporter failed", { error });
        }
      }
    }
    pending.resolve();
  }
  function detachRouteAttachments(
    route: RemoteAttachmentRoute,
    reason: string,
    error: Error,
  ): void {
    const child = options.windowHostProcessMap.get(route.webContentsId);
    const pending = route.pendingRendererAttachment;
    if (pending) {
      clearTimeout(pending.timeout);
      route.pendingRendererAttachment = undefined;
      if (child) detach(context, child, pending.attachmentId, reason);
      pending.reject(error);
    }
    if (route.rendererAttachmentId) {
      if (child) detach(context, child, route.rendererAttachmentId, reason);
      route.rendererAttachmentId = undefined;
    }
  }
  return {
    createChannel,
    attachRendererPort,
    confirmRendererAttachmentReady,
    detachRouteAttachments,
  };
}
export type AttachmentOwner = ReturnType<typeof createAttachmentOwner>;
