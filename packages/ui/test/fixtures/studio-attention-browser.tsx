// Controlled public service transport; production inbox, actions, cache and run history are unchanged.
import { useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import type { IServiceAccessor, StudioCommand, IStudioRuntimeService } from "@knorvia/services";
import { ServiceProvider } from "../../src/hooks/useServices.js";
import { KnorviaIntlProvider } from "../../src/i18n/IntlProvider.js";
import { StudioAttentionInbox } from "../../src/studio/attention/StudioAttentionInbox.js";
import type { StudioAttentionRow } from "../../src/studio/attention/attentionRows.js";
import { studioAttentionRoute } from "../../src/studio/attention/attentionNavigation.js";
import { StudioRunHistory } from "../../src/studio/runtime/StudioRunHistory.js";
import { StudioRunFocusContext } from "../../src/studio/runtime/studioRunFocus.js";
import { buildTaskEntityKey } from "../../src/lib/taskQueryCache.js";
import { useTaskQueryCacheStore } from "../../src/store/taskQueryCacheStore.js";
import "../../src/styles.css";

async function rpc(method: string, args: unknown[] = []) {
  const response = await fetch("/__attention_test", {
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
  onDidChange: none,
} as IStudioRuntimeService;
const controller = {
  listTaskList: (query: unknown) => rpc("native-list", [query]),
  mutateTask: (request: unknown) => rpc("native-read", [request]),
  onDynamicControllerFrame: () => none,
  subscribeControllerV4: async () => ({ subscriptionId: "fixture" }),
  unsubscribeControllerV4: async () => {},
};
const services = {
  studioRuntimeService: runtime,
  windowControllerService: controller,
} as unknown as IServiceAccessor;
const workspaceTabs = ["a", "b"].map((id) => ({
  workspacePath: "/same/path",
  workspaceIdentity: `remote:${id}`,
  remoteSessionId: `connection:${id}`,
}));

function Fixture() {
  const [opened, setOpened] = useState<StudioAttentionRow | null>(null);
  const cache = useSyncExternalStore(
    useTaskQueryCacheStore.subscribe,
    useTaskQueryCacheStore.getState,
    useTaskQueryCacheStore.getState,
  );
  const target = opened?.source === "studio" ? opened.item : null;
  const select = (row: StudioAttentionRow) => setOpened(row);
  // A protocol/event fixture injects a newer authoritative marker through the real cache owner.
  Object.assign(window, {
    attentionFixture: {
      observeNative: async () => {
        const { items } = await rpc("native-list", [{ kind: "timeline" }]);
        for (const item of items) useTaskQueryCacheStore.getState().upsertTaskMeta(item);
      },
    },
  });
  const nativeKey = buildTaskEntityKey({
    taskId: "native",
    workspacePath: "/same/path",
    workspaceIdentity: "remote:a",
  });
  return (
    <>
      <div style={{ height: "100vh", width: target ? "65%" : "100%" }}>
        <StudioAttentionInbox workspaceTabs={workspaceTabs} onOpen={select} />
      </div>
      <output data-testid="native-marker">
        {cache.taskMetaByEntityKey[nativeKey]?.unreadAt ?? "read"}
      </output>
      <output data-testid="attention-target">
        {opened
          ? JSON.stringify(
              opened.source === "studio"
                ? { workspacePath: opened.item.workspacePath, ...studioAttentionRoute(opened.item) }
                : opened.item,
            )
          : "none"}
      </output>
      {target ? (
        <aside
          style={{
            position: "fixed",
            right: 0,
            top: 0,
            width: "35%",
            height: "100vh",
            overflow: "auto",
          }}
        >
          <StudioRunFocusContext.Provider
            value={{ targetId: target.targetId, runId: target.runId }}
          >
            <StudioRunHistory targetId={target.targetId} compact />
          </StudioRunFocusContext.Provider>
        </aside>
      ) : null}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <ServiceProvider services={services}>
    <KnorviaIntlProvider initialLocale="en-US">
      <Fixture />
    </KnorviaIntlProvider>
  </ServiceProvider>,
);
