import assert from "node:assert/strict";
import { test } from "node:test";
import type { StudioWorkspaceChange } from "@knorvia/services";
import { studioWorkspaceDiff } from "../src/studio/runtime/studioWorkspaceDiff.js";

const change = (overrides: Partial<StudioWorkspaceChange>): StudioWorkspaceChange => ({
  path: "draft.txt",
  kind: "modified",
  before: "old\n",
  after: "new\n",
  ...overrides,
});

test("added and deleted text files retain their empty side for a real diff", () => {
  const added = studioWorkspaceDiff(change({ kind: "added", before: null, after: "new\n" }));
  assert.equal(added.canShowText, true);
  assert.deepEqual(added.oldFile, { name: "draft.txt", contents: "" });
  assert.equal(added.newFile?.contents, "new\n");
  const deleted = studioWorkspaceDiff(change({ kind: "deleted", before: "old\n", after: null }));
  assert.equal(deleted.canShowText, true);
  assert.equal(deleted.oldFile?.contents, "old\n");
  assert.deepEqual(deleted.newFile, { name: "draft.txt", contents: "" });
});

test("binary and unreadable sides cannot be mislabeled as empty text", () => {
  for (const item of [
    change({ binary: true, before: null, after: null }),
    change({ before: null }),
    change({ after: null }),
  ]) {
    const diff = studioWorkspaceDiff(item);
    assert.equal(diff.canShowText, false);
    assert.equal(diff.oldFile, null);
    assert.equal(diff.newFile, null);
  }
});

test("a conflicted file remains reviewable but cannot be applied", () => {
  const diff = studioWorkspaceDiff(change({ conflict: true }));
  assert.equal(diff.canShowText, true);
  assert.equal(diff.canApply, false);
});
