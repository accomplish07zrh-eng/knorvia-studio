// SPDX-License-Identifier: Apache-2.0
// Pending projection contracts; not executed or presented as DOM/scroll acceptance.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorkspaceFileTreeRow } from "../src/workspace-file-tree/model.js";
import { indexWorkspaceStickyDirectories, projectWorkspaceStickyFolders } from "../src/workspace-file-tree/stickyFolderProjection.js";

const row = (name: string, depth: number, type: "directory" | "file" = "directory", expanded = true): WorkspaceFileTreeRow => ({
  path: `/w/${name}`, name, depth, type, expanded, loaded: true, loading: false, error: null,
});

function projection(rows: WorkspaceFileTreeRow[], scrollOffset: number, enabled = true, virtualItemCount = 1) {
  return projectWorkspaceStickyFolders({ rows, directories: indexWorkspaceStickyDirectories(rows), scrollOffset, enabled, virtualItemCount });
}

test("disabled/empty/top threshold returns no overlay, including missing probes", () => {
  const rows = [row("root", 0), row("leaf", 1, "file")];
  assert.deepEqual(projection(rows, 100, false), []);
  assert.deepEqual(projection(rows, 100, true, 0), []);
  assert.deepEqual(projection([], 100), []);
  assert.deepEqual(projection(rows, 0.5), []);
  assert.deepEqual(projection(rows, NaN), []);
});

test("the stack's cumulative height advances the next directory trigger and retains row references", () => {
  const root = row("root", 0), child = row("child", 1), grandchild = row("grandchild", 2);
  const rows = [root, child, grandchild, row("leaf", 3, "file")];
  const sticky = projection(rows, 1);
  assert.deepEqual(sticky.map((item) => item.index), [0, 1, 2]);
  assert.equal(sticky[0]!.row, root);
  assert.equal(sticky[1]!.row, child);
  assert.equal(sticky[2]!.row, grandchild);
  assert.deepEqual(rows, [root, child, grandchild, rows[3]]);
});

test("a sibling branch chooses preceding directories at each exact depth", () => {
  const rows = [row("root", 0), row("earlier-child", 1), row("first-leaf", 2, "file"),
    row("later-child", 1), row("second-leaf", 2, "file")];
  assert.deepEqual(projection(rows, 85).map((item) => item.index), [0, 3]);
});

test("collapsed directories are excluded and a missing intermediate depth is not invented", () => {
  const collapsed = [row("root", 0), row("collapsed", 1, "directory", false), row("leaf", 1, "file")];
  assert.deepEqual(projection(collapsed, 60).map((item) => item.index), [0]);
  const gap = [row("root", 0), row("compressed", 3), row("leaf", 4, "file")];
  assert.deepEqual(projection(gap, 60).map((item) => item.index), [1]);
  const noParent = [row("root", 0), row("leaf", 4, "file")];
  assert.deepEqual(projection(noParent, 60), []);
});

test("the half pixel boundary retains a preceding root even when the probe is a non-directory row", () => {
  const rows = [row("root", 0), row("leaf", 1, "file")];
  assert.deepEqual(projection(rows, 27.5).map((item) => item.index), [0]);
  assert.deepEqual(projection(rows, 28).map((item) => item.index), [0]);
  assert.deepEqual(projection(rows, Infinity).map((item) => item.index), [0]);
});

test("a nonmonotonic depth sequence still uses an earlier exact-depth predecessor", () => {
  const rows = [row("depth-two", 2), row("depth-zero", 0), row("depth-one", 1), row("probe", 3, "file")];
  assert.deepEqual(projection(rows, 100).map((item) => item.index), [0]);
});
