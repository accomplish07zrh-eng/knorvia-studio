import assert from "node:assert/strict";
import test from "node:test";
import type { StudioKernelStatus } from "@knorvia/services";
import {
  isStudioKernelId,
  studioKernelOption,
  studioKernelOptions,
  studioSelectableKernelOptions,
  studioManagesKernel,
} from "../src/studio/types.js";
import { StudioKernelCatalog } from "../src/studio/agents/studioKernelCatalog.js";
import { createStudioAgentStore } from "../src/store/studioAgentStore.js";
import { normalizeGroupConfig, newGroupConfig } from "../src/studio/groups/groupModel.js";
import { isStudioWorkflow } from "../src/studio/workflow/graph.js";
import { createWorkflowGraph } from "../src/studio/workflow/types.js";

function detected(id: string, displayName?: string): StudioKernelStatus {
  return {
    id,
    displayName,
    installed: true,
    origin: "external",
    management: "external",
    capabilities: {
      resume: true,
      approval: true,
      questions: true,
      readOnly: false,
      fullAccess: false,
    },
  } as StudioKernelStatus;
}

test("custom ACP adapters join the known catalog and stale selections keep a safe name", () => {
  const statuses = [detected("acp:my-agent", "My Local Agent")];
  const options = studioKernelOptions(statuses, ["acp:retired" as never]);
  assert.equal(options.find((item) => item.id === "acp:my-agent")?.name, "My Local Agent");
  assert.equal(options.find((item) => item.id === "acp:retired")?.name, "retired");
  assert.equal(studioKernelOption("acp:my-agent" as never, statuses).vendor, "Local ACP");
  assert.equal(isStudioKernelId("acp:my-agent"), true);
  assert.equal(isStudioKernelId("acp:__proto__"), false);
  assert.equal(isStudioKernelId("acp:bad/../path"), false);
  assert.equal(isStudioKernelId("constructor"), false);
  assert.equal(studioManagesKernel("codex" as never), true);
  assert.equal(studioManagesKernel("acp:my-agent" as never, statuses[0]), false);
  const selectable = studioSelectableKernelOptions(statuses, ["acp:retired" as never]);
  assert.deepEqual(
    selectable.map((item) => item.id),
    ["knorvia", "acp:my-agent", "acp:retired"],
  );
});

test("one service inspection is shared, and refresh during inspection reruns after it", async () => {
  let releaseFirst: ((value: StudioKernelStatus[]) => void) | undefined;
  let calls = 0;
  const catalog = new StudioKernelCatalog({
    inspectKernels: () => {
      calls++;
      return calls === 1
        ? new Promise((resolve) => {
            releaseFirst = resolve;
          })
        : Promise.resolve([detected("acp:new-agent")]);
    },
  });
  const changes: number[] = [];
  const offA = catalog.subscribe(() => changes.push(catalog.getSnapshot().statuses.length));
  const offB = catalog.subscribe(() => changes.push(catalog.getSnapshot().statuses.length));
  await Promise.resolve();
  assert.equal(calls, 1);
  const refreshed = catalog.refresh();
  releaseFirst?.([detected("codex")]);
  await refreshed;
  assert.equal(calls, 2);
  assert.equal(catalog.getSnapshot().statuses[0]?.id, "acp:new-agent");
  assert.equal(catalog.getSnapshot().error, "");
  assert.ok(changes.length >= 2);
  offA();
  offB();
});

test("inspection failure keeps the last known view and another service is independent", async () => {
  let fail = false;
  const first = new StudioKernelCatalog({
    inspectKernels: async () => {
      if (fail) throw new Error("offline");
      return [detected("acp:first")];
    },
  });
  const second = new StudioKernelCatalog({
    inspectKernels: async () => [detected("acp:second")],
  });
  await first.refresh();
  fail = true;
  await first.refresh();
  await second.refresh();
  assert.equal(first.getSnapshot().statuses[0]?.id, "acp:first");
  assert.equal(first.getSnapshot().error, "offline");
  assert.equal(second.getSnapshot().statuses[0]?.id, "acp:second");
});

test("a synchronous inspection failure is reported without leaving the catalog checking", async () => {
  const catalog = new StudioKernelCatalog({
    inspectKernels: () => {
      throw new Error("CLI probe unavailable");
    },
  });
  await catalog.refresh();
  assert.equal(catalog.getSnapshot().checking, false);
  assert.equal(catalog.getSnapshot().error, "CLI probe unavailable");
});

test("re-probe uses the explicit refresh path while a plain refresh reuses the cache", async () => {
  const calls: Array<{ refresh?: boolean } | undefined> = [];
  const catalog = new StudioKernelCatalog({
    inspectKernels: (options?: { refresh?: boolean }) => {
      calls.push(options);
      return Promise.resolve([detected("codex")]);
    },
  });
  await catalog.refresh();
  await catalog.reprobe();
  assert.deepEqual(calls, [undefined, { refresh: true }]);
  assert.equal(catalog.getSnapshot().inspected, true);
  assert.equal(catalog.getSnapshot().reprobing, false);
  assert.equal(catalog.getSnapshot().checking, false);
});

test("a re-probe requested during an inspection reruns after it with the cache bypassed", async () => {
  const calls: Array<{ refresh?: boolean } | undefined> = [];
  let release: ((value: StudioKernelStatus[]) => void) | undefined;
  const catalog = new StudioKernelCatalog({
    inspectKernels: (options?: { refresh?: boolean }) => {
      calls.push(options);
      if (calls.length === 1)
        return new Promise<StudioKernelStatus[]>((resolve) => {
          release = resolve;
        });
      return Promise.resolve([detected("codex")]);
    },
  });
  const off = catalog.subscribe(() => {});
  await Promise.resolve();
  assert.equal(catalog.getSnapshot().reprobing, false);
  const pending = catalog.reprobe();
  assert.equal(catalog.getSnapshot().reprobing, true);
  release?.([detected("codex")]);
  await pending;
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls, [undefined, { refresh: true }]);
  assert.equal(catalog.getSnapshot().reprobing, false);
  off();
});

test("a custom kernel keeps its isolated draft and model choice after reopen", () => {
  let raw: string | null = null;
  const storage = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  };
  const id = "acp:my-agent" as never;
  const store = createStudioAgentStore(storage);
  assert.equal(store.getState().saveDraft("custom-chat", id, "pending task"), true);
  assert.equal(
    store.getState().setDraftSelection("custom-chat", id, {
      model: "local-model",
      reasoningEffort: "high",
    }),
    true,
  );
  assert.equal(store.getState().saveConfig(id, { executablePath: "", permission: "ask" }), true);
  const reopened = createStudioAgentStore(storage);
  assert.equal(reopened.getState().drafts["custom-chat"]?.kernelId, id);
  assert.deepEqual(reopened.getState().drafts["custom-chat"]?.selection, {
    model: "local-model",
    reasoningEffort: "high",
  });
  assert.equal(reopened.getState().configs[id]?.permission, "ask");
  assert.equal(reopened.getState().saveDraft("unsafe", "acp:__proto__" as never, "bad"), false);
});

test("a group preserves a valid custom member without accepting unsafe IDs", () => {
  const custom = "acp:my-agent" as never;
  const config = normalizeGroupConfig({
    ...newGroupConfig(),
    name: "Local team",
    members: ["knorvia", custom, "acp:bad/../path" as never],
    host: custom,
  });
  assert.deepEqual(config?.members, ["knorvia", custom]);
  assert.equal(config?.host, custom);
});

test("a stored workflow keeps a custom agent node but rejects an unsafe identity", () => {
  const graph = createWorkflowGraph("sequence");
  const agent = graph.nodes.find((node) => node.data.kind === "agent")!;
  agent.data.kernel = "acp:my-agent" as never;
  const workflow = {
    id: "local-flow",
    name: "Local workflow",
    workspacePath: "D:/project",
    updatedAt: 1,
    ...graph,
  };
  assert.equal(isStudioWorkflow(workflow), true);
  agent.data.kernel = "acp:__proto__" as never;
  assert.equal(isStudioWorkflow(workflow), false);
});
