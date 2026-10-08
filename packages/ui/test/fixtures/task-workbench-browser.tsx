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
    broadcastService: broadcast,
    settingService: { get: async () => ({}), update: async () => {} },
    fileService: { resolvePath: async ({ path }: { path: string }) => path },
  } as unknown as IServiceAccessor;
}
const hosts = { a: services("a"), b: services("b") };
const scope = { workspacePath: "/test/project" };
function App() {
  const [host, setHost] = useState<"a" | "b">("a");
  const navigation = useStudioNavigation();
  Object.assign(window, {
    workbenchFixture: {
      setHost,
      fixture,
      board: useTaskWorkbench,
      drafts: studioAgentStore,
      navigation,
    },
  });
  return (
    <ServiceProvider services={hosts[host]}>
      <PlatformProvider platform={platform}>
        <StoreProvider broadcastService={broadcast}>
          <TabStoreProvider>
            <KnorviaIntlProvider initialLocale="en-US">
              <TooltipProvider>
                <div className="flex h-screen w-screen">
                  <StudioActivityRail
                    navigation={navigation}
                    settingsActive={false}
                    onReturnToWorkspace={() => {}}
                  />
                  <div className="min-h-0 min-w-0 flex-1">
                    {navigation.route.view === "workbench" ? (
                      <TaskWorkbench
                        scope={scope}
                        workspaceMenuProps={{ workspaceTabs: [] }}
                        onOpenAgentSettings={() => {}}
                      />
                    ) : (
                      <AddToWorkbench
                        kernel="codex"
                        sessionId="saved"
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
