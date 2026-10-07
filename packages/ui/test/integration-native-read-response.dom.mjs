// SPDX-License-Identifier: Apache-2.0
// 真实 React hook/query cache 时序 gate；仅替换外部 ports，不等于完整桌面 GUI。
import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(new URL("../package.json", import.meta.url));
const domRequire = process.env.KNORVIA_INTEGRATION_DOM_DEPS
  ? createRequire(`${process.env.KNORVIA_INTEGRATION_DOM_DEPS}/package.json`)
  : require;
const { JSDOM } = domRequire("jsdom");
const dom = new JSDOM("<!doctype html><body></body>", { url: "http://127.0.0.1/" });
for (const key of ["window", "document", "HTMLElement", "Node", "Event", "MutationObserver"])
  globalThis[key] = key === "window" ? dom.window : dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement: h, act } = require("react");
const { createRoot } = require("react-dom/client");
let context;
const noAction = () => {};
const session = {
  taskNavHistory: { entries: [], cursor: -1 },
  taskNavPushAutomations: noAction,
  taskNavPushPluginStore: noAction,
  taskNavGoBack: noAction,
  taskNavGoForward: noAction,
  removeTaskFromNavHistory: noAction,
  getWorkspaceState: () => ({ modelSwitchPending: false, modelSwitchStage: null }),
  setActiveTaskId: (...args) => context.navigation.push(args),
  setTaskUnreadIndicator: (...args) => context.legacyCalls.push(args),
};
const sessionHook = Object.assign((selector) => selector(session), { getState: () => session });
const port = (path, namedExports) =>
  mock.module(new URL(`../src/${path}.ts`, import.meta.url).href, { namedExports });
mock.module(new URL("../src/hooks/useWorkspaceServices.tsx", import.meta.url).href, {
  namedExports: { useBaseWorkspaceServices: () => context.services },
});
port("store/sessionStore", {
  useKnorviaSessionStore: sessionHook,
  getVisibleTaskMetas: () => [],
  getTaskUnreadIndicator: () => false,
});
mock.module(new URL("../src/store/TabStoreProvider.tsx", import.meta.url).href, {
  namedExports: { useTabStoreApi: () => ({ getState: () => context.tabs }) },
});
port("store/remoteWorkspaceSessionStore", {
  getRemoteWorkspaceSession: (id) => ({ services: context.remoteServices.get(id) }),
});
port("logger", {
  logger: { info: noAction, warn: noAction, error: noAction },
  logMemoryDiagnostics: noAction,
});
mock.module(new URL("../src/components/ui/toast.tsx", import.meta.url).href, {
  namedExports: { toast: noAction },
});
const { useWorkspaceTaskNavigation } =
  await import("../src/app-shell/useWorkspaceTaskNavigation.ts");
const { useTaskQueryCacheStore } = await import("../src/store/taskQueryCacheStore.ts");
const { buildTaskEntityKey } = await import("../src/lib/taskQueryCache.ts");
const { syncTaskUnreadFromStatusWorkspaceEvent } =
  await import("../src/lib/taskStatusUnreadSync.ts");
const owner = () => useTaskQueryCacheStore.getState();
after(() => dom.window.close());

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const task = (identity) => ({
  taskId: "synthetic-read-task",
  workspacePath: "/synthetic-project",
  title: "Synthetic",
  createdAt: 1,
  updatedAt: 10,
  status: "completed",
  unreadAt: 100,
  ...(identity ? { workspaceIdentity: identity } : {}),
});
const query = (target, unreadAt = 100, updatedAt = 10) => {
  const workspaceKey = target.workspaceIdentity ?? target.workspacePath;
  owner().setQueryResult({
    queryKey: `synthetic-query:${workspaceKey}`,
    descriptor: {
      kind: "workspace",
      sortBy: "updatedAt",
      search: "",
      expanded: true,
      visibleLimit: null,
      workspaceKeys: [workspaceKey],
    },
    items: [{ ...target, unreadAt, updatedAt }],
    total: 1,
    hasMore: false,
  });
};
async function fixture(t, target = task(), seed = true) {
  owner().clearAll();
  context = { requests: [], navigation: [], legacyCalls: [], remoteServices: new Map() };
  context.services = {
    taskService: new Proxy(
      {
        setTaskUnread(params) {
          const reply = deferred();
          context.requests.push({ params, ...reply });
          return reply.promise;
        },
      },
      {
        get(object, name) {
          assert(name in object, `Unexpected service call: ${String(name)}`);
          return object[name];
        },
      },
    ),
  };
  const remoteSessionId = target.workspaceIdentity ? "synthetic-remote" : undefined;
  context.remoteServices.set(remoteSessionId, context.services);
  context.tabs = {
    activeTabId: "synthetic-tab",
    tabs: [
      {
        id: "synthetic-tab",
        kind: "workspace",
        workspacePath: target.workspacePath,
        workspaceIdentity: target.workspaceIdentity,
        remoteSessionId,
      },
    ],
  };
  if (seed) owner().upsertTaskMeta(target);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function ReadView({ rowMarker }) {
    const navigation = useWorkspaceTaskNavigation({
      intl: { formatMessage: ({ id }) => id },
      workspaceAbsPath: target.workspacePath,
      workspaceIdentity: target.workspaceIdentity,
      activateTabByPath: () => true,
    });
    const marker = useTaskQueryCacheStore(
      (state) => state.taskMetaByEntityKey[buildTaskEntityKey(target)]?.unreadAt,
    );
    return h(
      "div",
      null,
      h(
        "button",
        {
          onClick: () =>
            navigation.handleSelectTask(
              target.workspacePath,
              target.taskId,
              target.workspaceIdentity,
              rowMarker,
            ),
        },
        "Read",
      ),
      h("output", null, marker ?? "read"),
    );
  }
  const render = (marker) => act(() => root.render(h(ReadView, { rowMarker: marker })));
  await render(100);
  t.after(async () => {
    await act(() => root.unmount());
    host.remove();
    owner().clearAll();
  });
  return {
    target,
    render,
    click: () =>
      act(() =>
        host
          .querySelector("button")
          .dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })),
      ),
    marker: () => host.querySelector("output").textContent,
    event: (unreadAt) => act(() => owner().upsertTaskMeta({ ...target, updatedAt: 20, unreadAt })),
    reply: (index, unreadAt) =>
      act(async () => {
        context.requests[index].resolve({ ...target, unreadAt });
        await context.requests[index].promise;
      }),
    fail: (index) =>
      act(async () => {
        context.requests[index].reject(new Error("synthetic-read-failure"));
        await context.requests[index].promise.catch(noAction);
      }),
  };
}

test("mounted native read uses only the existing CAS port and settles normally", async (t) => {
  const view = await fixture(t);
  await view.click();
  assert.equal(view.marker(), "read");
  assert.equal(context.requests.length, 1);
  assert.deepEqual(context.requests[0].params, {
    taskId: view.target.taskId,
    workspacePath: view.target.workspacePath,
    unread: false,
    expectedUnreadAt: 100,
  });
  await view.reply(0, undefined);
  assert.equal(view.marker(), "read");
  assert.equal(context.navigation.length, 1);
});
test("a newer authoritative marker survives the old successful read reply", async (t) => {
  const view = await fixture(t);
  await view.click();
  await view.event(101);
  assert.equal(view.marker(), "101");
  await view.reply(0, undefined);
  assert.equal(view.marker(), "101");
});
test("a newer authoritative marker survives the old failed read rollback", async (t) => {
  const view = await fixture(t);
  await view.click();
  await view.event(101);
  await view.fail(0);
  assert.equal(view.marker(), "101");
});
test("a second reading cannot be overwritten by the first CAS response (ABA)", async (t) => {
  const view = await fixture(t);
  await view.click();
  await view.event(101);
  await view.render(101);
  await view.click();
  assert.equal(context.requests.length, 2);
  assert.equal(context.requests[1].params.expectedUnreadAt, 101);
  await view.reply(0, 101);
  assert.equal(view.marker(), "read");
  await view.reply(1, undefined);
  assert.equal(view.marker(), "read");
});
for (const operation of ["removeTask", "clearAll"]) {
  test(`old read reply cannot affect the same ID recreated after ${operation}`, async (t) => {
    const view = await fixture(t);
    await view.click();
    await act(() => {
      owner()[operation](view.target);
      owner().upsertTaskMeta(view.target);
    });
    await view.reply(0, undefined);
    assert.equal(view.marker(), "100");
  });
}
test("old membership stays hidden but a newer membership marker stays visible", async (t) => {
  const view = await fixture(t);
  await act(() => query(view.target));
  await view.click();
  await act(() => query(view.target));
  assert.equal(view.marker(), "read");
  await act(() => query(view.target, 101, 20));
  assert.equal(view.marker(), "101");
  await view.reply(0, undefined);
  assert.equal(view.marker(), "101");
});
test("Host CAS rejection returns the current marker through the existing port", async (t) => {
  const view = await fixture(t);
  await view.click();
  await view.reply(0, 101);
  assert.equal(view.marker(), "101");
});
test("same path and task ID in a different workspaceIdentity remain separate", async (t) => {
  const view = await fixture(t, task("ssh:synthetic-A"));
  const other = task("ssh:synthetic-B");
  await act(() => owner().upsertTaskMeta({ ...other, unreadAt: 150 }));
  await view.click();
  await view.reply(0, undefined);
  assert.equal(context.requests[0].params.workspaceIdentity, "ssh:synthetic-A");
  assert.equal(owner().taskMetaByEntityKey[buildTaskEntityKey(other)].unreadAt, 150);
});
test("an uncached displayed row still sends its observed CAS marker", async (t) => {
  const view = await fixture(t, task(), false);
  await view.click();
  assert.equal(context.requests[0].params.expectedUnreadAt, 100);
  await view.reply(0, undefined);
  await act(() => query(view.target, undefined, 20));
  assert.equal(view.marker(), "read");
});

function backgroundSignal(target) {
  return act(() =>
    syncTaskUnreadFromStatusWorkspaceEvent({
      activeWorkspace: { workspacePath: target.workspacePath },
      event: {
        workspacePath: target.workspacePath,
        taskId: target.taskId,
        reason: "task_status_changed",
        unreadSignal: "background_terminal",
        taskMeta: target,
      },
      service: context.services.taskService,
    }),
  );
}
test("late background mark-unread ACK cannot undo a later explicit reading", async (t) => {
  const view = await fixture(t, {
    ...task(),
    taskId: "synthetic-background-success",
    unreadAt: undefined,
  });
  await backgroundSignal(view.target);
  const observed = Number(view.marker());
  assert(Number.isFinite(observed));
  assert.equal(context.requests[0].params.unread, true);
  await view.render(observed);
  await view.click();
  await view.reply(1, undefined);
  const legacyCount = context.legacyCalls.length;
  await view.reply(0, observed);
  assert.equal(view.marker(), "read");
  assert.equal(context.legacyCalls.length, legacyCount);
});
test("late background failure cannot remove a newer authoritative marker", async (t) => {
  const view = await fixture(t, {
    ...task(),
    taskId: "synthetic-background-failure",
    unreadAt: undefined,
  });
  await backgroundSignal(view.target);
  const observed = Number(view.marker());
  const nextMarker = observed + 1;
  await view.event(nextMarker);
  const legacyCount = context.legacyCalls.length;
  await view.fail(0);
  assert.equal(view.marker(), String(nextMarker));
  assert.equal(context.legacyCalls.length, legacyCount);
});
