import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { IServiceAccessor, IStudioRuntimeService, StudioCommand } from "@knorvia/services";
import type { IPlatformService } from "@knorvia/shared";
import { TooltipProvider } from "../../src/components/ui/tooltip.js";
import { ServiceProvider } from "../../src/hooks/useServices.js";
import { PlatformProvider } from "../../src/hooks/usePlatform.js";
import { TabStoreProvider } from "../../src/store/TabStoreProvider.js";
import { KnorviaIntlProvider } from "../../src/i18n/IntlProvider.js";
import { StudioExternalChat } from "../../src/studio/agents/StudioExternalChat.js";
import { studioAgentStore } from "../../src/store/studioAgentStore.js";
import "../../src/styles.css";
async function rpc(method: string, args: unknown[] = []) {
  const response = await fetch("/__image_test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ method, args }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
const none = () => ({ dispose() {} });
const runtime = {
  overview: () => rpc("overview"),
  timeline: (...args: unknown[]) => rpc("timeline", args),
  command: (command: StudioCommand) => rpc("command", [command]),
  inspectKernels: () => rpc("inspect"),
  kernelOptions: (...args: unknown[]) => rpc("options", args),
  onDidChange: none,
} as IStudioRuntimeService;
const inert = new Proxy(
  {},
  { get: (_target, key) => (String(key).startsWith("on") ? none : async () => []) },
);
const services = new Proxy(
  { studioRuntimeService: runtime },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : inert) },
) as unknown as IServiceAccessor;
const reconnectedServices = new Proxy(
  { studioRuntimeService: { ...runtime } },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : inert) },
) as unknown as IServiceAccessor;
const platform = {
  type: "web",
  selectDirectory: async () => null,
  isWindows: false,
} as unknown as IPlatformService;
function Fixture() {
  const [sessionId, setSession] = useState("chat");
  const [reconnected, setReconnected] = useState(false);
  Object.assign(window, {
    imageFixture: {
      draft: (id = sessionId) => studioAgentStore.getState().drafts[id],
      selectModel: (model: string) =>
        studioAgentStore.getState().setDraftSelection(sessionId, "codex", { model }),
    },
  });
  return (
    <ServiceProvider services={reconnected ? reconnectedServices : services}>
      <button onClick={() => setSession(sessionId === "chat" ? "other" : "chat")}>
        Switch session
      </button>
      <button onClick={() => setReconnected(!reconnected)}>Switch connection</button>
      <div style={{ height: "94vh" }}>
        <StudioExternalChat
          kernelId="codex"
          sessionId={sessionId}
          workspaceMenuProps={{
            workspaceTabs: [],
            isWindowsDesktop: false,
            onConnectRemote: async () => {},
            onSelectRemoteProject: () => {},
            onCancelRemoteProject: () => {},
          }}
          onOpenAgentSettings={() => {}}
          onHandoffComplete={() => {}}
          onNativeHandoffComplete={() => {}}
        />
      </div>
    </ServiceProvider>
  );
}
for (const id of ["chat", "other"])
  studioAgentStore.getState().setDraftSelection(id, "codex", { model: "vision" });
createRoot(document.getElementById("root")!).render(
  <PlatformProvider platform={platform}>
    <TabStoreProvider>
      <TooltipProvider>
        <KnorviaIntlProvider initialLocale="en-US">
          <Fixture />
        </KnorviaIntlProvider>
      </TooltipProvider>
    </TabStoreProvider>
  </PlatformProvider>,
);
