// Real GUI components and transport projections; only platform IO and the model adapter are synthetic.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { IServiceAccessor, IStudioRuntimeService } from "@knorvia/services";
import type { IPlatformService } from "@knorvia/shared";
import { ServiceProvider } from "../../src/hooks/useServices.js";
import { PlatformProvider } from "../../src/hooks/usePlatform.js";
import { KnorviaIntlProvider } from "../../src/i18n/IntlProvider.js";
import { StoreProvider } from "../../src/store/StoreProvider.js";
import { TabStoreProvider } from "../../src/store/TabStoreProvider.js";
import { StudioActivityRail } from "../../src/studio/StudioActivityRail.js";
import { useStudioNavigation } from "../../src/studio/useStudioNavigation.js";
import { TooltipProvider } from "../../src/components/ui/tooltip.js";
import { TaskWorkbench } from "../../src/studio/workbench/TaskWorkbench.js";
import { AddToWorkbench } from "../../src/studio/workbench/AddToWorkbench.js";
import { useTaskWorkbench } from "../../src/studio/workbench/workbenchStore.js";
import { studioAgentStore } from "../../src/store/studioAgentStore.js";
import { WorkbenchNativeDraftProbe } from "./workbench-native-draft-probe.js";
import "../../src/styles.css";

const none = () => ({ dispose() {} });
const broadcast = { onMessage: none, send: async () => {} };
const platform = {
  selectDirectory: async () => "/test/project",
  isDesktop: false,
  isMac: false,
} as unknown as IPlatformService;
const fixture = { held: false, delivered: 0, release: null as null | (() => void) };
function services(host: string) {
  const listeners = new Set<(frame: unknown) => void>();
  const rpc = async (method: string, ...args: unknown[]) => {
    const response = await fetch(`/__workbench/${host}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method, args }),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error);
    if (method === "command" && fixture.held && (args[0] as { type: string }).type === "send") {
      await new Promise<void>((resolve) => {
        fixture.release = resolve;
      });
      fixture.delivered++;
    }
    return value;
  };
  const runtime = {
    onDidChange: none,
    overview: () => rpc("overview"),
    timeline: (...args: unknown[]) => rpc("timeline", ...args),
    command: (command: unknown) => rpc("command", command),
    inspectKernels: () => rpc("inspectKernels"),
    kernelOptions: (input: unknown) => rpc("kernelOptions", input),
    workspaceChanges: (input: unknown) => rpc("workspaceChanges", input),
  } as IStudioRuntimeService;
  return {
    studioRuntimeService: runtime,
    windowControllerService: {
      listTaskList: async () => ({ items: [], total: 0, hasMore: false }),
      onDynamicControllerFrame: () => (listener: (frame: unknown) => void) => {
        listeners.add(listener);
        return { dispose: () => listeners.delete(listener) };
      },
      subscribeControllerV4: async ({ topic }: { topic: string }) => {
        const subscriptionId = `${host}:${topic}`;
        const frame = {
          topic,
          subscriptionId,
          logEpoch: host,
          fromSeq: 0,
          toSeq: 0,
          sentAt: Date.now(),
          payload: {
            kind: "snapshot",
            snapshot: topic.endsWith("workspaces")
              ? {
                  workspaces: [
                    {
                      workspacePath: "/test/project",
                      sourceAvailability: "online",
                      connectionState: "online",
                    },
                  ],
                }
              : { tasks: [] },
          },
        };
        queueMicrotask(() => listeners.forEach((listener) => listener(frame)));
        return { ack: { subscriptionId } };
      },
      unsubscribeControllerV4: async () => {},
    },
    broadcastService: broadcast,
    settingService: { get: async () => ({}), update: async () => {} },
    fileService: {
      resolvePath: async ({ path }: { path: string }) => path,
      // 媒体消息证据：任意本机路径读出一张固定的 PNG。
      readMediaPreview: async () => ({
        mediaType: "image/png",
        dataBase64:
          "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFklEQVR42mNkYGD4z0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC",
      }),
    },
  } as unknown as IServiceAccessor;
}
const hostPrefix =
  new URLSearchParams(location.search).get("fixture") === "reload" ? "reload-" : "";
const hosts = { a: services(`${hostPrefix}a`), b: services(`${hostPrefix}b`) };
const scope = { workspacePath: "/test/project" };
function App() {
  const [host, setHost] = useState<"a" | "b">(() =>
    sessionStorage.getItem("workbench-fixture-host") === "b" ? "b" : "a",
  );
  const [chat, setChat] = useState(
    () => sessionStorage.getItem("workbench-fixture-chat") || "saved",
  );
  const [probe, setProbe] = useState(false);
  const navigation = useStudioNavigation(() => {});
  Object.assign(window, {
    workbenchFixture: {
      setHost: (next: "a" | "b") => {
        sessionStorage.setItem("workbench-fixture-host", next);
        setHost(next);
      },
      setChat: (next: string) => {
        sessionStorage.setItem("workbench-fixture-chat", next);
        setChat(next);
      },
      fixture,
      board: useTaskWorkbench,
      drafts: studioAgentStore,
      navigation,
      setProbe,
    },
  });
  return (
    <ServiceProvider services={hosts[host]}>
      <PlatformProvider platform={platform}>
        <StoreProvider broadcastService={broadcast}>
          <TabStoreProvider>
            <KnorviaIntlProvider initialLocale="en-US">
              <TooltipProvider>
                {probe && (
                  <div>
                    <WorkbenchNativeDraftProbe id="a" />
                    <WorkbenchNativeDraftProbe id="b" />
                  </div>
                )}
                <div className="flex h-screen w-screen">
                  <StudioActivityRail
                    navigation={navigation}
                    settingsActive={false}
                    onReturnToWorkspace={() => {}}
                  />
                  <div className="min-h-0 min-w-0 flex-1">
                    {navigation.route.view === "workbench" ? (
                      <TaskWorkbench
                        onOpenTarget={navigation.navigate}
                        onOpenAttention={(row) => {
                          sessionStorage.setItem("workbench-fixture-attention", row.key);
                        }}
                        scope={scope}
                        workspaceMenuProps={{ workspaceTabs: [] }}
                        onOpenAgentSettings={() => {}}
                      />
                    ) : (
                      <AddToWorkbench
                        kernel="codex"
                        sessionId={chat}
                        scope={scope}
                        onOpen={() => navigation.navigate({ view: "workbench" })}
                      />
                    )}
                  </div>
                </div>
              </TooltipProvider>
            </KnorviaIntlProvider>
          </TabStoreProvider>
        </StoreProvider>
      </PlatformProvider>
    </ServiceProvider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
