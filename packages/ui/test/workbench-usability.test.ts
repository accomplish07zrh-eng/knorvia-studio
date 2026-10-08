import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeWorkbench,
  emptyWorkbench,
  fitsWorkbenchGrid,
  layoutWorkbench,
  normalizeWorkbenchZoom,
  workbenchGrid,
  type TaskWorkbenchState,
  type WorkbenchTile,
} from "../src/studio/workbench/workbenchModel.js";
import {
  autoSplitWorkbench,
  canSplitWorkbenchPane,
} from "../src/studio/workbench/workbenchPlacement.js";
import { useTaskWorkbench } from "../src/studio/workbench/workbenchStore.js";

// specs/knorvia-workbench-usability-20261008.md

const scope = { workspacePath: "/test/project" };
const tile = (id: string, patch: Partial<WorkbenchTile> = {}): WorkbenchTile => ({
  id,
  scope,
  kernel: "knorvia",
  sessionId: `session-${id}`,
  opened: true,
  ...patch,
});
function fill(count: number): TaskWorkbenchState {
  let board = emptyWorkbench(scope, "t0");
  board.tiles["workspace-main"] = tile("t0");
  for (let index = 1; index < count; index += 1)
    board = autoSplitWorkbench(board, tile(`t${index}`))!;
  return board;
}

test("auto placement grows a balanced grid up to two rows of four", () => {
  const shapes: string[] = [];
  let board = emptyWorkbench(scope, "t0");
  board.tiles["workspace-main"] = tile("t0");
  for (let index = 1; index < 8; index += 1) {
    board = autoSplitWorkbench(board, tile(`t${index}`))!;
    assert.ok(board, `tile ${index + 1} fits`);
    const grid = workbenchGrid(board.layout.root);
    shapes.push(`${grid.rows}x${grid.columns}`);
  }
  // 2 格左右并排，4 格 2×2，8 格 2×4。
  assert.equal(shapes[0], "1x2");
  assert.equal(shapes[2], "2x2");
  assert.equal(shapes[6], "2x4");
  assert.equal(Object.keys(board.tiles).length, 8);
  assert.equal(autoSplitWorkbench(board, tile("t8")), null);
});

test("manual splits cannot create a third row or a fifth column", () => {
  const four = fill(4);
  for (const pane of Object.keys(four.tiles)) {
    assert.equal(canSplitWorkbenchPane(four, pane, "column"), false, `${pane} third row`);
    assert.equal(canSplitWorkbenchPane(four, pane, "row"), true, `${pane} widen row`);
  }
  const eight = fill(8);
  for (const pane of Object.keys(eight.tiles)) {
    assert.equal(canSplitWorkbenchPane(eight, pane, "row"), false);
    assert.equal(canSplitWorkbenchPane(eight, pane, "column"), false);
  }
  // 单行时上下分格仍可用。
  const two = fill(2);
  assert.equal(canSplitWorkbenchPane(two, "workspace-main", "column"), true);
  const stacked = layoutWorkbench(
    two,
    {
      kind: "split",
      anchor: "workspace-main",
      direction: "column",
      before: false,
      binding: { workspaceScope: scope, sessionId: null },
    },
    tile("extra"),
  );
  assert.equal(workbenchGrid(stacked.layout.root).rows, 2);
});

test("persisted layouts accept two rows of four, reject a third row and normalize zoom", () => {
  const eight = { ...fill(8), zoom: 0.73 };
  const restored = decodeWorkbench(JSON.stringify({ version: 1, ...eight }));
  assert.ok(restored);
  assert.equal(Object.keys(restored.tiles).length, 8);
  assert.equal(restored.zoom, 0.7);
  assert.equal(normalizeWorkbenchZoom(9), 1.5);
  assert.equal(normalizeWorkbenchZoom(0.1), 0.5);
  assert.equal(normalizeWorkbenchZoom("x"), 1);
  const leaf = (paneId: string) => ({ type: "leaf", paneId });
  const threeRows = {
    type: "split",
    id: "n1",
    direction: "column",
    ratio: 0.5,
    first: leaf("workspace-main"),
    second: {
      type: "split",
      id: "n2",
      direction: "column",
      ratio: 0.5,
      first: leaf("pane-1"),
      second: leaf("pane-2"),
    },
  };
  assert.equal(fitsWorkbenchGrid(threeRows as never), false);
  const raw = {
    version: 1,
    layout: { root: threeRows, panes: {}, focusedPaneId: "workspace-main" },
    tiles: { "workspace-main": tile("a"), "pane-1": tile("b"), "pane-2": tile("c") },
    maximized: null,
    shelved: [],
  };
  assert.equal(decodeWorkbench(JSON.stringify(raw)), undefined);
});

test("new task reuses a ready tile, adds a tile without shelving, and swaps the focused tile when full", () => {
  const store = useTaskWorkbench;
  store.setState({ board: fill(3) });
  assert.equal(store.getState().create(), true);
  let board = store.getState().board!;
  assert.equal(Object.keys(board.tiles).length, 4);
  assert.equal(board.shelved.length, 0);
  const ready = board.tiles[board.layout.focusedPaneId]!;
  assert.equal(ready.opened, false);
  assert.equal(ready.sessionId, null);
  // 已有未配置待命格：再次新建只聚焦它，不新增。
  store.getState().focus("workspace-main");
  assert.equal(store.getState().create(), true);
  board = store.getState().board!;
  assert.equal(Object.keys(board.tiles).length, 4);
  assert.equal(board.tiles[board.layout.focusedPaneId]!.id, ready.id);

  store.setState({ board: fill(8) });
  store.getState().focus("workspace-main");
  assert.equal(store.getState().create(), true);
  board = store.getState().board!;
  assert.equal(Object.keys(board.tiles).length, 8);
  assert.equal(board.shelved[0]?.id, "t0");
  assert.equal(board.tiles["workspace-main"]!.opened, false);
});

test("new task in a tile shelves its conversation and keeps kernel and project", () => {
  const store = useTaskWorkbench;
  const board = fill(2);
  const pane = Object.keys(board.tiles).find((id) => id !== "workspace-main")!;
  board.tiles[pane] = { ...board.tiles[pane]!, kernel: "codex" };
  store.setState({ board });
  const old = board.tiles[pane]!;
  assert.equal(store.getState().renew(pane, "stale-id"), false);
  assert.equal(store.getState().renew(pane, old.id), true);
  const next = store.getState().board!;
  assert.equal(next.shelved.at(-1)?.id, old.id);
  assert.equal(next.tiles[pane]!.kernel, "codex");
  assert.equal(next.tiles[pane]!.scope, old.scope);
  assert.equal(next.tiles[pane]!.sessionId, null);
  assert.notEqual(next.tiles[pane]!.id, old.id);
  assert.equal(next.layout.root, board.layout.root);
});
