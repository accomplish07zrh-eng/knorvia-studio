import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeWorkbench,
  emptyWorkbench,
  layoutWorkbench,
  workbenchMinimumSize,
} from "../src/studio/workbench/workbenchModel.js";
import {
  claimWorkbenchConnection,
  forgetWorkbenchConnection,
} from "../src/studio/workbench/workbenchConnection.js";

const scope = { workspacePath: "/test/project" };
test("zero-task layout supports identical kernels with independent stable tiles and bounded geometry", () => {
  let state = emptyWorkbench(scope, "tile-a");
  const a = state.tiles["workspace-main"]!;
  state = layoutWorkbench(
    state,
    {
      kind: "split",
      anchor: "workspace-main",
      direction: "row",
      before: false,
      binding: { workspaceScope: scope, sessionId: null },
    },
    { ...a, id: "tile-b" },
  );
  assert.equal(Object.keys(state.tiles).length, 2);
  assert.equal(state.tiles["workspace-main"], a);
  assert.equal(state.tiles["pane-1"]?.kernel, a.kernel);
  state = layoutWorkbench(state, { kind: "ratio", splitId: "n1", ratio: 0.25 });
  assert.deepEqual(workbenchMinimumSize(state.layout.root), { width: 1440, height: 300 });
  assert.ok(Object.values(state.tiles).every((tile) => !tile.opened && tile.sessionId === null));
  const restored = decodeWorkbench(JSON.stringify({ version: 1, ...state }));
  assert.deepEqual(restored?.layout.root, state.layout.root);
  assert.equal(restored?.tiles["pane-1"]?.id, "tile-b");
  state = layoutWorkbench(state, { kind: "close", paneId: "pane-1" });
  assert.equal(state.tiles["workspace-main"], a);
});
test("corrupt, duplicate, oversized and deeply nested layouts never restore executable bindings", () => {
  const board = emptyWorkbench(scope, "tile-a");
  const encode = (value: unknown) => JSON.stringify({ version: 1, ...board, ...(value as object) });
  assert.equal(decodeWorkbench("x".repeat(65537)), undefined);
  assert.equal(
    decodeWorkbench(
      encode({
        layout: {
          ...board.layout,
          root: {
            type: "split",
            id: "n1",
            direction: "row",
            ratio: 0.5,
            first: board.layout.root,
            second: board.layout.root,
          },
        },
      }),
    ),
    undefined,
  );
  assert.equal(
    decodeWorkbench(
      encode({
        tiles: { "workspace-main": { ...board.tiles["workspace-main"], sessionId: "__proto__" } },
      }),
    ),
    undefined,
  );
});
test("two Hosts with an identical session cannot claim the same live tile", () => {
  const a = {},
    b = {};
  assert.equal(claimWorkbenchConnection("owned", a), true);
  assert.equal(claimWorkbenchConnection("owned", b), false);
  assert.equal(claimWorkbenchConnection("other", b), true);
  forgetWorkbenchConnection("owned");
  forgetWorkbenchConnection("other");
});

test("layout store rejects late tile and directory callbacks, keeps siblings on removal, and reports storage failures", async () => {
  const values = new Map<string, string>();
  let fail = false;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (fail) throw new Error("quota");
        values.set(key, value);
      },
    },
  });
  const { useTaskWorkbench: store } = await import("../src/studio/workbench/workbenchStore.js");
  store.setState({ board: null, storageError: false });
  store.getState().initialize(scope);
  const tile = {
    id: "existing-a",
    kernel: "codex" as const,
    scope,
    sessionId: "session-a",
    opened: true,
    existing: true,
  };
  assert.equal(store.getState().add(tile), true);
  assert.equal(store.getState().add({ ...tile, id: "existing-b", sessionId: "session-b" }), true);
  assert.equal(Object.keys(store.getState().board!.tiles).length, 2);
  assert.equal(store.getState().add({ ...tile, id: "duplicate" }), true);
  assert.equal(Object.keys(store.getState().board!.tiles).length, 2);
  store.getState().update("workspace-main", { scope: { workspacePath: "/wrong" } }, "existing-a");
  assert.equal(
    store.getState().board!.tiles["workspace-main"]!.scope.workspacePath,
    scope.workspacePath,
  );
  store.getState().close("workspace-main");
  assert.equal(store.getState().board!.tiles["workspace-main"]!.id, "existing-b");
  store.getState().update("workspace-main", { sessionId: "late-result" }, "existing-a");
  assert.equal(store.getState().board!.tiles["workspace-main"]!.sessionId, "session-b");
  fail = true;
  store.getState().split("workspace-main", "column");
  assert.equal(store.getState().storageError, true);
  assert.equal(Object.keys(store.getState().board!.tiles).length, 2);
});

test("restored visible and shelved references cannot claim a matching foreign Host until explicit rejoining", async () => {
  const tile = {
    id: "restored-visible",
    kernel: "codex" as const,
    scope,
    sessionId: "matching-id",
    opened: true,
    existing: true,
  };
  const saved = {
    ...emptyWorkbench(scope, tile.id),
    tiles: { "workspace-main": tile },
    shelved: [{ ...tile, id: "restored-shelved", sessionId: "shelved-id" }],
  };
  let encoded = JSON.stringify({ version: 1, ...saved });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => encoded, setItem: (_: string, value: string) => (encoded = value) },
  });
  const { useTaskWorkbench: store } = await import("../src/studio/workbench/workbenchStore.js");
  store.setState({ board: null, storageError: false });
  store.getState().initialize(scope);
  const foreign = {};
  assert.equal(claimWorkbenchConnection(tile.id, foreign), false);
  assert.equal(claimWorkbenchConnection("restored-shelved", foreign), false);
  assert.deepEqual(
    store.getState().board!.tiles["workspace-main"],
    decodeWorkbench(JSON.stringify({ version: 1, ...saved }))!.tiles["workspace-main"],
  );
  store.getState().collect([{ ...tile, id: "automatic-id" }]);
  store.getState().show(tile);
  store.getState().reopenInput("workspace-main", tile.id);
  assert.equal(claimWorkbenchConnection(tile.id, foreign), false);
  store.getState().update("workspace-main", { scope: { ...scope }, existing: true }, tile.id);
  assert.equal(claimWorkbenchConnection(tile.id, foreign), false);
  const shelved = saved.shelved[0]!;
  store.getState().show(shelved);
  assert.equal(claimWorkbenchConnection(shelved.id, foreign), false);
  const shelfPane = Object.entries(store.getState().board!.tiles).find(
    ([, value]) => value.id === shelved.id,
  )![0];
  store.getState().close(shelfPane);
  assert.equal(
    store.getState().board!.shelved.some((value) => value.id === shelved.id),
    true,
  );
  assert.equal(store.getState().add({ ...shelved, id: "explicit-new-id" }), true);
  assert.equal(claimWorkbenchConnection(shelved.id, foreign), true);
  assert.equal(store.getState().add({ ...tile, id: "explicit-visible-id" }), true);
  assert.equal(claimWorkbenchConnection(tile.id, foreign), true);
  assert.equal(
    Object.values(store.getState().board!.tiles).some((value) => value.id === tile.id),
    true,
  );
  forgetWorkbenchConnection(tile.id);
  forgetWorkbenchConnection(shelved.id);
});

test("restored unsent inputs reopen explicitly with the original tile and draft scope, never an existing binding", async () => {
  const native = {
    ...emptyWorkbench(scope, "restored-native-input").tiles["workspace-main"]!,
    opened: true,
  };
  const external = {
    ...native,
    id: "restored-external-input",
    kernel: "codex" as const,
    sessionId: "draft-id",
  };
  let encoded = JSON.stringify({
    version: 1,
    ...emptyWorkbench(scope, native.id),
    tiles: { "workspace-main": native },
    shelved: [external],
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => encoded, setItem: (_: string, value: string) => (encoded = value) },
  });
  const { useTaskWorkbench: store } = await import("../src/studio/workbench/workbenchStore.js");
  store.setState({ board: null, storageError: false });
  store.getState().initialize(scope);
  const current = {};
  assert.equal(claimWorkbenchConnection(native.id, current), false);
  store.getState().reopenInput("workspace-main", "stale-id");
  assert.equal(claimWorkbenchConnection(native.id, current), false);
  store.getState().reopenInput("workspace-main", native.id);
  assert.equal(claimWorkbenchConnection(native.id, current), true);
  assert.equal(store.getState().board!.tiles["workspace-main"]!.sessionId, null);
  store.getState().show(external);
  const pane = Object.entries(store.getState().board!.tiles).find(
    ([, value]) => value.id === external.id,
  )![0];
  assert.equal(claimWorkbenchConnection(external.id, current), false);
  store.getState().reopenInput(pane, external.id);
  assert.equal(claimWorkbenchConnection(external.id, current), true);
  assert.equal(store.getState().board!.tiles[pane]!.sessionId, external.sessionId);
  forgetWorkbenchConnection(native.id);
  forgetWorkbenchConnection(external.id);
});
