import {
  BROWSER_SCREENSHOT_SURFACE_PREPARE_TIMEOUT_MS,
  type BrowserViewportSize,
  type BrowserViewScreenshotSurfacePreparePayload,
  type BrowserViewScreenshotSurfaceReadyPayload,
  type BrowserViewScreenshotSurfaceReleasePayload,
} from "@knorvia/shared";
import {
  releaseBrowserScreenshotResourceOnce,
  sameBrowserScreenshotViewport,
  toBrowserScreenshotSurfacePreparePayload,
  toBrowserScreenshotSurfaceReleasePayload,
  type BrowserScreenshotActivityLease,
  type BrowserScreenshotPendingRequest,
  type BrowserScreenshotPreparationGroup,
  type BrowserScreenshotSurfacePrepareInput,
  type BrowserScreenshotSurfaceCoordinator,
  type BrowserScreenshotSurfaceLease,
} from "./browserScreenshotSurfaceContracts.js";

export type {
  BrowserScreenshotSurfaceCoordinator,
  BrowserScreenshotSurfaceLease,
} from "./browserScreenshotSurfaceContracts.js";

type CoordinatorOptions = {
  timeoutMs?: number;
  activityTimeoutMs?: number;
  acquireActivity?: (
    windowId: number,
    payload: BrowserViewScreenshotSurfacePreparePayload,
  ) => BrowserScreenshotActivityLease | undefined;
  sendPrepare: (
    windowId: number,
    payload: BrowserViewScreenshotSurfacePreparePayload,
  ) => boolean;
  sendRelease: (
    windowId: number,
    payload: BrowserViewScreenshotSurfaceReleasePayload,
  ) => void;
  log?: (message: string) => void;
  warn?: (message: string) => void;
};

export class DesktopBrowserScreenshotSurfaceCoordinator
  implements BrowserScreenshotSurfaceCoordinator
{
  private readonly timeoutMs: number;
  private readonly activityTimeoutMs: number;
  private readonly groupsByGuest = new Map<string, BrowserScreenshotPreparationGroup>();
  private readonly groupsByReadyRequestId = new Map<string, BrowserScreenshotPreparationGroup>();
  private readonly queuedGroups: BrowserScreenshotPreparationGroup[] = [];
  private activeGroup?: BrowserScreenshotPreparationGroup;
  private schedulingSuspended = false;
  private disposed = false;

  constructor(private readonly options: CoordinatorOptions) {
    this.timeoutMs = options.timeoutMs ?? BROWSER_SCREENSHOT_SURFACE_PREPARE_TIMEOUT_MS;
    this.activityTimeoutMs = options.activityTimeoutMs ?? 35000;
  }

  prepare(input: BrowserScreenshotSurfacePrepareInput): Promise<BrowserScreenshotSurfaceLease> {
    if (this.disposed) {
      return Promise.reject(new Error("browser screenshot surface coordinator disposed"));
    }
    if (input.signal.aborted) {
      return Promise.reject(new Error("browser screenshot surface preparation cancelled"));
    }
    if (input.viewport.width <= 0 || input.viewport.height <= 0) {
      return Promise.reject(new Error("browser screenshot surface preparation requires a non-zero viewport"));
    }

    const key = JSON.stringify([
      input.windowId,
      input.workspaceKey,
      input.sessionId,
      input.browserId,
      input.browserGeneration,
      input.tabId,
      input.webContentsId,
      input.viewport.width,
      input.viewport.height,
      input.surfaceScaleMode ?? "current",
      input.viewportMode ?? "emulated",
    ]);
    let group = this.groupsByGuest.get(key);
    if (group?.ready) {
      return Promise.resolve(this.makeLease(group, input));
    }
    if (!group) {
      group = {
        key,
        payload: toBrowserScreenshotSurfacePreparePayload(input, this.timeoutMs),
        windowId: input.windowId,
        requests: new Set<BrowserScreenshotPendingRequest>(),
        prepareSent: false,
        ready: false,
        released: false,
        leaseReleases: new Set<() => void>(),
        invalidationController: new AbortController(),
        activityTimeoutMs: input.activityTimeoutMs,
      };
      this.groupsByGuest.set(key, group);
      this.queuedGroups.push(group);
    }
    const pendingGroup = group;
    return new Promise<BrowserScreenshotSurfaceLease>((resolve, reject) => {
      let request!: BrowserScreenshotPendingRequest;
      const timer = setTimeout(() => {
        this.errorRequest(
          request,
          new Error(`browser screenshot surface preparation timed out after ${this.timeoutMs}ms`),
        );
      }, this.timeoutMs);
      const abortListener = () => {
        this.errorRequest(request, new Error("browser screenshot surface preparation cancelled"));
      };
      request = { input, group: pendingGroup, resolve, reject, timer, abortListener };
      pendingGroup.requests.add(request);
      input.signal.addEventListener("abort", abortListener, { once: true });
      if (input.signal.aborted) {
        abortListener();
      }
      this.activateNext();
    });
  }

  handleReady(event: {
    windowId: number;
    senderWebContentsId: number;
    payload: BrowserViewScreenshotSurfaceReadyPayload;
  }): void {
    const group = this.groupsByReadyRequestId.get(event.payload.requestId);
    if (!group || group !== this.activeGroup || group.released || group.ready) return;
    const expected = group.payload;
    const actual = event.payload;
    if (
      event.windowId !== group.windowId ||
      actual.requestId !== expected.requestId ||
      actual.workspaceKey !== expected.workspaceKey ||
      actual.sessionId !== expected.sessionId ||
      actual.browserId !== expected.browserId ||
      actual.browserGeneration !== expected.browserGeneration ||
      actual.tabId !== expected.tabId ||
      actual.webContentsId !== expected.webContentsId ||
      (actual.viewportMode ?? "emulated") !== (expected.viewportMode ?? "emulated")
    ) {
      this.options.log?.("[browser-screenshot-surface] ignored ready with mismatched identity");
      return;
    }
    group.senderWebContentsId ??= event.senderWebContentsId;
    if (group.senderWebContentsId !== event.senderWebContentsId) {
      this.options.log?.("[browser-screenshot-surface] ignored ready from a different renderer");
      return;
    }
    if (!sameBrowserScreenshotViewport(expected.viewport, actual.viewport)) {
      this.options.log?.("[browser-screenshot-surface] ignored ready with unstable viewport");
      return;
    }
    if (!Number.isFinite(actual.surfaceScale) || actual.surfaceScale <= 0) {
      this.options.log?.("[browser-screenshot-surface] ignored ready with invalid surface scale");
      return;
    }
    if (
      expected.surfaceScaleMode === "unscaled" &&
      Math.abs(actual.surfaceScale - 1) > 0.001
    ) {
      this.options.log?.("[browser-screenshot-surface] ignored ready with scaled recording surface");
      return;
    }
    group.activityLease?.markPrepared?.();
    if (group.released) return;
    group.ready = true;
    group.readyViewport = actual.viewport;
    group.readySurfaceScale = actual.surfaceScale;
    this.groupsByReadyRequestId.delete(expected.requestId);
    const requests = Array.from(group.requests);
    group.requests.clear();
    for (const request of requests) {
      clearTimeout(request.timer);
      request.input.signal.removeEventListener("abort", request.abortListener);
      request.resolve(this.makeLease(group, request.input));
    }
  }

  handleWindowDestroyed(windowId: number): void {
    const groups = Array.from(this.groupsByGuest.values());
    const wasSuspended = this.schedulingSuspended;
    this.schedulingSuspended = true;
    try {
      for (const group of groups) {
        if (group.windowId === windowId) {
          this.errorGroup(
            group,
            new Error("browser screenshot surface preparation window destroyed"),
          );
        }
      }
    } finally {
      this.schedulingSuspended = wasSuspended;
      if (!wasSuspended) this.activateNext();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const groups = Array.from(this.groupsByGuest.values());
    for (const group of groups) {
      this.errorGroup(group, new Error("browser screenshot surface coordinator disposed"));
    }
  }

  private activateNext(): void {
    if (this.activeGroup || this.disposed || this.schedulingSuspended) return;
    const group = this.queuedGroups.shift();
    if (!group) return;
    if (group.released || group.requests.size === 0) {
      this.activateNext();
      return;
    }
    this.activeGroup = group;
    this.groupsByReadyRequestId.set(group.payload.requestId, group);

    const acquireActivity = this.options.acquireActivity;
    if (acquireActivity) {
      const activityLease = acquireActivity(group.windowId, group.payload);
      if (!activityLease) {
        this.errorGroup(group, new Error("browser screenshot activity could not be acquired"));
        return;
      }
      group.activityLease = activityLease;
    }
    if (group.released) return;

    const invalidated = group.activityLease?.invalidated;
    if (invalidated) {
      const onActivityAbort = () => {
        const reason = invalidated.reason;
        this.errorGroup(
          group,
          reason instanceof Error
            ? reason
            : new Error("browser screenshot activity was invalidated"),
        );
      };
      group.activityAbortListener = onActivityAbort;
      invalidated.addEventListener("abort", onActivityAbort, { once: true });
      if (invalidated.aborted) onActivityAbort();
    }
    if (group.released) return;

    const activityTimeout = group.activityTimeoutMs ?? this.activityTimeoutMs;
    group.activityTimer = setTimeout(() => {
      this.options.warn?.(
        `[browser-screenshot-surface] activity watchdog released requestId=${group.payload.requestId} windowId=${group.windowId}`,
      );
      this.errorGroup(
        group,
        new Error(`browser screenshot activity timed out after ${activityTimeout}ms`),
      );
    }, activityTimeout);
    group.prepareSent = true;
    let sent: boolean;
    try {
      sent = this.options.sendPrepare(group.windowId, group.payload);
    } catch {
      if (!group.ready && !group.released) {
        this.errorGroup(group, new Error("browser screenshot surface preparation could not be sent"));
      }
      return;
    }
    if (!sent && !group.ready && !group.released) {
      this.errorGroup(group, new Error("browser screenshot surface preparation could not be sent"));
    }
  }

  private errorRequest(request: BrowserScreenshotPendingRequest, error: Error): void {
    const group = request.group;
    if (!group.requests.delete(request)) return;
    clearTimeout(request.timer);
    request.input.signal.removeEventListener("abort", request.abortListener);
    request.reject(error);
    if (!group.ready && group.requests.size === 0) this.settleGroup(group);
  }

  private errorGroup(group: BrowserScreenshotPreparationGroup, error: Error): void {
    if (group.released) return;
    group.invalidationController.abort(error);
    const requests = Array.from(group.requests);
    group.requests.clear();
    for (const request of requests) {
      clearTimeout(request.timer);
      request.input.signal.removeEventListener("abort", request.abortListener);
      request.reject(error);
    }
    this.settleGroup(group);
  }

  private makeLease(
    group: BrowserScreenshotPreparationGroup,
    input: BrowserScreenshotSurfacePrepareInput,
  ): BrowserScreenshotSurfaceLease {
    const onAbort = () => release();
    const release = releaseBrowserScreenshotResourceOnce(() => {
      input.signal.removeEventListener("abort", onAbort);
      group.leaseReleases.delete(release);
      if (group.released) return;
      if (group.leaseReleases.size === 0) this.settleGroup(group);
    });
    group.leaseReleases.add(release);
    input.signal.addEventListener("abort", onAbort, { once: true });
    if (input.signal.aborted) release();
    return {
      invalidated: group.invalidationController.signal,
      surfaceScale: group.readySurfaceScale ?? 1,
      webContentsId: group.payload.webContentsId,
      viewport: group.readyViewport ?? group.payload.viewport,
      release,
    };
  }

  private settleGroup(group: BrowserScreenshotPreparationGroup): void {
    if (group.released) return;
    group.released = true;
    if (group.activityTimer) {
      clearTimeout(group.activityTimer);
      group.activityTimer = undefined;
    }
    this.groupsByGuest.delete(group.key);
    this.groupsByReadyRequestId.delete(group.payload.requestId);
    const index = this.queuedGroups.indexOf(group);
    if (index !== -1) this.queuedGroups.splice(index, 1);
    try {
      if (group.prepareSent) {
        this.options.sendRelease(
          group.windowId,
          toBrowserScreenshotSurfaceReleasePayload(group.payload),
        );
      }
    } catch {
      this.options.warn?.("[browser-screenshot-surface] release send failed");
    } finally {
      for (const release of group.leaseReleases) release();
      group.leaseReleases.clear();
      if (group.activityAbortListener) {
        group.activityLease?.invalidated?.removeEventListener(
          "abort",
          group.activityAbortListener,
        );
      }
      group.activityAbortListener = undefined;
      group.activityLease?.release();
      group.activityLease = undefined;
    }
    if (this.activeGroup === group) {
      this.activeGroup = undefined;
      if (!this.schedulingSuspended) this.activateNext();
    }
  }
}
