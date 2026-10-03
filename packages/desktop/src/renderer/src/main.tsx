import { DatabaseStartupAdmission } from "./databaseStartupAdmission.js";

import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import {
  AppErrorBoundary,
  Root,
  GlobalDatabaseStartupLoading,
  KnorviaIntlProvider,
  registerBaseWorkspaceServices,
  registerRemoteWorkspaceSession,
  createRemoteWorkspaceDisconnectedError,
  playTaskNotificationSound,
} from "@knorvia/ui";
import "@knorvia/ui/styles.css";
import { connectViaMessagePort, createMessagePortServiceConnection } from "@knorvia/client";
import {
  InternalChannels,
  databaseStartupStateSchema,
  type DatabaseStartupControl,
  parseLaunchMarks,
  LAUNCH_MARKS_QUERY_KEY,
  type LaunchMarks,
  DEFAULT_LOCALE,
  type Locale,
} from "@knorvia/shared";
import type { IServiceAccessor } from "@knorvia/services";
import { createDesktopPlatform } from "./desktopPlatform.js";
import { resolveRendererAppearance } from "./rendererAppearance.js";
import { startPerformanceTimelineCleanup } from "./performanceTimelineCleanup.js";
import { buildRemoteWorkspaceSessionServices } from "./remoteWorkspaceSessionServices.js";
import {
  notifyRemoteWorkspaceServicePortReady,
  parseRemoteWorkspaceServicePortMessage,
  type RemoteWorkspaceServicePortRegistration,
} from "./remoteWorkspaceServicePortBridge.js";

type DesktopRendererImportMetaEnv = {
  VITE_KNORVIA_E2E_STORE_BRIDGE?: string;
};

startPerformanceTimelineCleanup();
const rendererStartedAt = Date.now();
const launchMarks: LaunchMarks | null = parseLaunchMarks(
  new URLSearchParams(window.location.search).get(LAUNCH_MARKS_QUERY_KEY),
);
(
  window as Window & {
    __KNORVIA_RENDERER_START__?: number;
    __KNORVIA_LAUNCH_MARKS__?: LaunchMarks | null;
  }
).__KNORVIA_RENDERER_START__ = rendererStartedAt;
(window as Window & { __KNORVIA_LAUNCH_MARKS__?: LaunchMarks | null }).__KNORVIA_LAUNCH_MARKS__ =
  launchMarks;
registerE2EStoreBridgesIfEnabled();

function registerE2EStoreBridgesIfEnabled() {
  const env = ((import.meta as ImportMeta & { env?: DesktopRendererImportMetaEnv }).env ??
    {}) as DesktopRendererImportMetaEnv;
  if (env.VITE_KNORVIA_E2E_STORE_BRIDGE !== "1") return;
  void import("@knorvia/ui/e2e-store-bridge").then(({ registerE2EStoreBridges }) => {
    registerE2EStoreBridges();
  });
}

// Apply the existing white default before UI hooks take over the persisted theme.
const appearance = resolveRendererAppearance(
  localStorage.getItem("knorvia-theme") || "knorvia-light",
  () => window.matchMedia("(prefers-color-scheme: dark)").matches,
);
if (appearance.dark) document.documentElement.classList.add("dark");
document.documentElement.classList.toggle(
  "theme-knorvia-light",
  appearance.theme === "knorvia-light",
);
document.documentElement.classList.toggle(
  "theme-knorvia-dark",
  appearance.theme === "knorvia-dark",
);

const isMacDesktop = navigator.userAgent.includes("Mac");
const isWindowsDesktop = navigator.userAgent.includes("Windows");
const isLinuxDesktop = !isMacDesktop && !isWindowsDesktop;
// These existing chrome classes keep overlays clear of each native title bar.
document.documentElement.classList.toggle("platform-mac-desktop", isMacDesktop);
document.documentElement.classList.toggle("platform-windows-desktop", isWindowsDesktop);
document.documentElement.classList.toggle("platform-linux-desktop", isLinuxDesktop);
const isLocalDevelopmentRuntime =
  (globalThis as typeof globalThis & { __KNORVIA_LOCAL_DEVELOPMENT_RUNTIME__?: boolean })
    .__KNORVIA_LOCAL_DEVELOPMENT_RUNTIME__ === true;

function readBooleanFlag(name: string, defaultValue: boolean): boolean {
  const value = new URLSearchParams(window.location.search).get(name);
  if (value == null) return defaultValue;
  return value !== "false" && value !== "0";
}

function readStringFlag(name: string): string | undefined {
  const value = new URLSearchParams(window.location.search).get(name);
  return value == null || value.trim() === "" ? undefined : value;
}

const restoreSession = readBooleanFlag("restoreSession", true);
const supportsSettings = readBooleanFlag("supportsSettings", true);
const initialWorkspaceAbsPath = readStringFlag("initialWorkspacePath");
const initialWorkspacePurpose = readStringFlag("initialWorkspacePurpose");
const unavailableWorkspacePath = readStringFlag("unavailableWorkspacePath");
const initialLocaleFlag = readStringFlag("locale");
const initialLocale: Locale =
  initialLocaleFlag === "zh-CN" || initialLocaleFlag === "en-US"
    ? initialLocaleFlag
    : DEFAULT_LOCALE;
const desktopPlatform = createDesktopPlatform({ isLocalDevelopmentRuntime });

/** Own the one local admission and the FIFO of remote ports awaiting its base. */
class DesktopRendererStartup {
  private initialized = false;
  private baseServices: IServiceAccessor | null = null;
  private readonly waitingRemotePorts: RemoteWorkspaceServicePortRegistration[] = [];
  private readonly admission = new DatabaseStartupAdmission();
  private readonly root = createRoot(document.getElementById("root")!);
  private readonly firstStateTimer = setTimeout(() => this.observeMissingState(), 30_000);

  start(): void {
    window.addEventListener("message", this.receive);
    this.renderDatabaseStartup();
    this.sendControl({ action: "snapshot" });
  }

  private sendControl(control: DatabaseStartupControl): void {
    window.postMessage({ type: InternalChannels.DatabaseStartupControl, control }, "*");
  }

  private observeMissingState(): void {
    if (this.admission.state) return;
    this.admission.state = {
      schemaVersion: 1,
      startupId: "unavailable",
      attemptId: "startup-channel-unavailable",
      sequence: 0,
      startedAt: rendererStartedAt,
      updatedAt: Date.now(),
      phase: "failed",
      errorCode: "startup_status_timeout",
      disk: [],
    };
    this.renderDatabaseStartup();
  }

  private readonly receive = (event: MessageEvent): void => {
    if (event.source === window && event.data?.type === InternalChannels.DatabaseStartupState) {
      const result = databaseStartupStateSchema.safeParse(event.data.state);
      if (!result.success || this.initialized) return;
      if (!this.admission.acceptState(result.data)) return;
      if (this.firstStateTimer) clearTimeout(this.firstStateTimer);
      this.renderDatabaseStartup();
      this.tryEnterBusinessRoot();
      return;
    }
    if (event.data === InternalChannels.TaskNotificationSound) {
      void playTaskNotificationSound();
      return;
    }
    const remote = parseRemoteWorkspaceServicePortMessage(event);
    if (remote) {
      if (this.baseServices) this.installRemotePort(remote);
      else this.waitingRemotePorts.push(remote);
      return;
    }
    if (
      event.source !== window ||
      event.data?.type !== InternalChannels.ServicePort ||
      this.initialized
    ) return;
    const port = event.ports[0];
    if (!port) return;
    this.admission.acceptPort({ databaseStartupId: event.data.databaseStartupId }, port);
    this.tryEnterBusinessRoot();
  };

  private installRemotePort(registration: RemoteWorkspaceServicePortRegistration): void {
    if (!this.baseServices) return;
    const connection = createMessagePortServiceConnection(registration.port);
    const services = buildRemoteWorkspaceSessionServices(
      this.baseServices,
      connection.services,
    );
    registerRemoteWorkspaceSession({
      sessionId: registration.sessionId,
      target: registration.target,
      services,
      dispose: (reason) => connection.dispose(reason ?? createRemoteWorkspaceDisconnectedError()),
    });
    // Publish ready only after the canonical store owns this generation's services.
    notifyRemoteWorkspaceServicePortReady(registration);
  }

  private drainRemotePorts(): void {
    if (!this.baseServices || this.waitingRemotePorts.length === 0) return;
    const detached = this.waitingRemotePorts.splice(0);
    for (const registration of detached) this.installRemotePort(registration);
  }

  private tryEnterBusinessRoot(): void {
    if (this.initialized) return;
    const port = this.admission.takeReadyPort();
    if (!port) return;
    this.initialized = true;
    const services = connectViaMessagePort(port);
    this.baseServices = services;
    registerBaseWorkspaceServices(services);
    this.drainRemotePorts();
    const settingService = supportsSettings ? services.settingService : undefined;

    this.root?.render(
      <AppErrorBoundary isDesktop isMacDesktop={isMacDesktop} isWindowsDesktop={isWindowsDesktop}>
        <KnorviaIntlProvider
          settingService={settingService}
          broadcastService={services.broadcastService}
          resolveSystemLocale={desktopPlatform.getSystemLocale}
        >
          <StartupReadyNotifier />
          <Root
            services={services}
            platform={desktopPlatform}
            isDesktop
            assistantCodeCommentCardsEnabled
            isMacDesktop={isMacDesktop}
            isWindowsDesktop={isWindowsDesktop}
            restoreSession={restoreSession}
            supportsSettings={supportsSettings}
            initialWorkspaceAbsPath={initialWorkspaceAbsPath}
            initialWorkspacePurpose={
              initialWorkspacePurpose === "conversation" ? "conversation" : "project"
            }
            unavailableWorkspacePath={unavailableWorkspacePath}
          />
        </KnorviaIntlProvider>
      </AppErrorBoundary>,
    );
  }

  private renderDatabaseStartup(): void {
    this.root?.render(
      <AppErrorBoundary isDesktop isMacDesktop={isMacDesktop} isWindowsDesktop={isWindowsDesktop}>
        <KnorviaIntlProvider
          initialLocale={initialLocaleFlag ? initialLocale : undefined}
          resolveSystemLocale={desktopPlatform.getSystemLocale}
        >
          <StartupReadyNotifier />
          <GlobalDatabaseStartupLoading
            state={this.admission.state}
            onRetry={() => {
              if (this.admission.state)
                this.sendControl({
                  action: "retry",
                  attemptId: this.admission.state.attemptId,
                });
            }}
            onCopy={(details) => navigator.clipboard.writeText(details)}
            onExit={() => this.sendControl({ action: "exit" })}
          />
        </KnorviaIntlProvider>
      </AppErrorBoundary>,
    );
  }
}

function StartupReadyNotifier() {
  useEffect(() => {
    (window as Window & { __KNORVIA_REACT_COMMIT_AT__?: number }).__KNORVIA_REACT_COMMIT_AT__ =
      Date.now();
    window.dispatchEvent(new Event("knorvia-react-startup-ready"));
  }, []);
  return null;
}

new DesktopRendererStartup().start();
