import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeWorkbench,
  emptyWorkbench,
  workbenchTileView,
} from "../src/studio/workbench/workbenchModel.js";
import {
  isWorkbenchPreviewUrl,
  useWorkbenchPreview,
  workbenchPreviewBinding,
} from "../src/studio/workbench/workbenchPreviewStore.js";
import {
  defaultArtifactIndex,
  latestArtifactRun,
} from "../src/studio/workbench/useWorkbenchArtifacts.js";
import { canRenderWorkbenchPreview } from "../src/studio/workbench/WorkbenchPreview.js";

// specs/knorvia-workbench-artifact-preview-20261008.md

const scope = { workspacePath: "/test/project" };

test("tile view defaults to chat+preview, persists known values and ignores unknown ones", () => {
  const state = emptyWorkbench(scope, "tile-a");
  const tile = state.tiles["workspace-main"]!;
  assert.equal(workbenchTileView(tile), "split");
  for (const view of ["chat", "preview"] as const) {
    const saved = { ...state, tiles: { "workspace-main": { ...tile, view } } };
    const restored = decodeWorkbench(JSON.stringify({ version: 1, ...saved }));
    assert.equal(restored?.tiles["workspace-main"]?.view, view);
  }
  const unknown = { ...state, tiles: { "workspace-main": { ...tile, view: "terminal" } } };
  const restored = decodeWorkbench(JSON.stringify({ version: 1, ...unknown }));
  // 未知视图值不导致整套布局被拒绝，按默认显示。
  assert.ok(restored);
  assert.equal(workbenchTileView(restored.tiles["workspace-main"]!), "split");
});

test("only local files and local services open inside a tile preview", () => {
  assert.equal(isWorkbenchPreviewUrl("file:///tmp/pelican/index.html"), true);
  assert.equal(isWorkbenchPreviewUrl("file:///C:/work/a%20b.htm"), true);
  assert.equal(isWorkbenchPreviewUrl("file:///tmp/notes.md"), false);
  assert.equal(isWorkbenchPreviewUrl("http://localhost:5173/"), true);
  assert.equal(isWorkbenchPreviewUrl("http://127.0.0.1:8080/x"), true);
  assert.equal(isWorkbenchPreviewUrl("https://example.com/"), false);
  assert.equal(isWorkbenchPreviewUrl("not a url"), false);
});

test("previews are isolated per tile and bound to the tile's conversation", () => {
  const store = useWorkbenchPreview.getState();
  const a = workbenchPreviewBinding({ kernel: "codex", sessionId: "s1" });
  const b = workbenchPreviewBinding({ kernel: "claude-code", sessionId: "s2" });
  store.open("tile-a", a, { url: "file:///a/index.html", title: "a" });
  store.open("tile-b", b, { url: "file:///b/index.html", title: "b" });
  let entries = useWorkbenchPreview.getState().entries;
  assert.equal(entries["tile-a"]?.url, "file:///a/index.html");
  assert.equal(entries["tile-b"]?.url, "file:///b/index.html");
  // 同一地址被重新生成：版本递增以便重新加载。
  store.open("tile-a", a, { url: "file:///a/index.html", title: "a" });
  assert.equal(useWorkbenchPreview.getState().entries["tile-a"]?.revision, 2);
  // 格子换了会话：旧版本号不沿用。
  const next = workbenchPreviewBinding({ kernel: "codex", sessionId: "s3" });
  store.open("tile-a", next, { url: "file:///c/index.html", title: "c" });
  entries = useWorkbenchPreview.getState().entries;
  assert.equal(entries["tile-a"]?.binding, next);
  assert.equal(entries["tile-a"]?.revision, 1);
  store.clear("tile-a");
  store.clear("tile-b");
  assert.deepEqual(useWorkbenchPreview.getState().entries, {});
});

test("external tiles read only the latest finished isolated run of their own conversation", () => {
  const run = (id: string, targetId: string, state: string, updatedAt: number, steps?: string[]) =>
    ({ id, targetId, state, updatedAt, workspaceStepIds: steps }) as never;
  const timeline = {
    runs: [
      run("old", "s1", "succeeded", 1, ["step"]),
      run("other", "s2", "succeeded", 9, ["step"]),
      run("running", "s1", "running", 10, ["step"]),
      run("no-workspace", "s1", "succeeded", 11),
      run("latest", "s1", "failed", 5, ["a", "b"]),
    ],
  };
  const target = latestArtifactRun(timeline, "s1");
  assert.equal(target?.runId, "latest");
  assert.equal(target?.stepId, "b");
  assert.equal(latestArtifactRun({ runs: [run("r", "s1", "waiting", 1, ["x"])] }, "s1"), null);
  assert.equal(latestArtifactRun(undefined, "s1"), null);
  assert.equal(defaultArtifactIndex(["a.html", "site/index.html"]), 1);
  assert.equal(defaultArtifactIndex(["b.html", "c.htm"]), 0);
});

test("tile previews render only on desktop for local, non-remote conversations", () => {
  const tile = emptyWorkbench(scope, "t").tiles["workspace-main"]!;
  assert.equal(canRenderWorkbenchPreview(tile, true), true);
  assert.equal(canRenderWorkbenchPreview(tile, false), false);
  assert.equal(
    canRenderWorkbenchPreview({ ...tile, scope: { ...scope, remoteSessionId: "r" } }, true),
    false,
  );
  assert.equal(
    canRenderWorkbenchPreview(
      { ...tile, kernel: "ssh:aaaaaaaaaaaaaaaaaaaaaaaa:codex" as never },
      true,
    ),
    false,
  );
});
