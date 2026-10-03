// SPDX-License-Identifier: Apache-2.0
// Contract scenarios prepared for final integration; not executed in this lane phase.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDeletedGitStatusRowsToWorkspaceFileTree,
  areWorkspaceFilePathsEqual,
  buildWorkspaceFileGitStatusByPath,
  buildWorkspaceFileIgnoredPathSet,
  filterWorkspaceFileTreeRows,
  flattenWorkspaceFileTreeRows,
  getWorkspaceDirectoryGitStatuses,
  getWorkspaceFileAncestorDirectories,
  getWorkspaceFileDirectoryChildDepth,
  getWorkspaceFileParentDirectory,
  getWorkspaceFileRelativePath,
  isWorkspaceFileGitIgnored,
  isWorkspaceFilePathInside,
  isWorkspaceFileTreeAutoFlattenableDirectory,
  isWorkspaceFileTreeDeletedFile,
  isWorkspaceFileTreeGitStatusAvailable,
  type WorkspaceFileGitStatus,
  type WorkspaceFileTreeNode,
  type WorkspaceFileTreeRow,
} from "../src/workspace-file-tree/model.js";
import { getWorkspaceFileTreeRefreshDirectoryPaths } from "../src/workspace-file-tree/refreshDirectories.js";
import {
  createWorkspaceFileTreeRowsFromSearchEntries,
  getWorkspaceFileSearchDirectoryRevealPaths,
} from "../src/workspace-file-tree/searchRows.js";

const node = (
  path: string,
  type: WorkspaceFileTreeNode["type"],
  depth: number,
): WorkspaceFileTreeNode => ({
  path,
  name: path.slice(path.lastIndexOf("/") + 1),
  type,
  depth,
});
const row = (
  path: string,
  type: WorkspaceFileTreeNode["type"],
  depth: number,
): WorkspaceFileTreeRow => ({
  ...node(path, type, depth),
  expanded: false,
  loaded: false,
  loading: false,
  error: null,
});
const tree = (childrenByDirectory: Map<string, WorkspaceFileTreeNode[]>) => ({
  rootPath: "/w",
  childrenByDirectory,
  expandedPaths: new Set<string>(),
  loadedDirectoryPaths: new Set<string>(),
  loadingDirectoryPaths: new Set<string>(),
  errorByDirectory: new Map<string, Error>(),
});

test("path display preserves separator rules, case and lexical boundaries", () => {
  assert.equal(areWorkspaceFilePathsEqual("C:\\w\\", "C:/w"), true);
  assert.equal(areWorkspaceFilePathsEqual("C:/W", "C:/w"), false);
  assert.equal(isWorkspaceFilePathInside("/w", "/work/file"), false);
  assert.equal(isWorkspaceFilePathInside("/w", "/w/../other"), true);
  assert.equal(getWorkspaceFileRelativePath("/w/", "/w/"), ".");
  assert.equal(getWorkspaceFileRelativePath("/w", "/w/a//b"), "a//b");
  assert.equal(getWorkspaceFileRelativePath("/w", "/else/leaf.txt"), "leaf.txt");
  assert.deepEqual(getWorkspaceFileAncestorDirectories("C:\\w\\", "C:\\w\\a\\b\\file"), [
    "C:\\w\\a",
    "C:\\w\\a\\b",
  ]);
  assert.deepEqual(getWorkspaceFileAncestorDirectories("C:\\w\\", "C:/w/a/b/file"), [
    "C:\\w/a",
    "C:\\w/a/b",
  ]);
  assert.equal(getWorkspaceFileParentDirectory("/w/", "/w/file"), "/w");
  assert.equal(getWorkspaceFileParentDirectory("/w", "/w"), null);
  assert.equal(getWorkspaceFileParentDirectory("/w", "/else/file"), null);
  assert.equal(getWorkspaceFileDirectoryChildDepth("/w", "/w/a//b/"), 2);
});

test("UNC ancestors and root slash retain the existing display convention", () => {
  assert.deepEqual(
    getWorkspaceFileAncestorDirectories("\\\\host\\share", "\\\\host\\share\\a\\file"),
    ["\\\\host\\share\\a"],
  );
  assert.equal(getWorkspaceFileParentDirectory("/", "/file"), "");
  assert.equal(getWorkspaceFileRelativePath("/", "/a/file"), "a/file");
});

test("Git file precedence and directory decoration precedence remain separate", () => {
  const statuses = buildWorkspaceFileGitStatusByPath([
    { path: "/w/a", kind: "modified", section: "unstaged", isUntracked: false },
    { path: "\\w\\a\\", kind: "added", section: "staged", isUntracked: false },
    { path: "/w/b", kind: "deleted", section: "staged", isUntracked: false },
    { path: "/w/c", kind: "renamed", section: "staged", isUntracked: false },
    { path: "/w/d", kind: "modified", section: "unstaged", isUntracked: false },
    { path: "/w/e", kind: "modified", section: "untracked", isUntracked: false },
    { path: "/w/e", kind: "deleted", section: "staged", isUntracked: false },
  ]);
  assert.equal(statuses.get("/w/a"), "added");
  assert.equal(statuses.get("/w/e"), "untracked");
  statuses.set("/w/f", "ignored");
  statuses.set("/work/g", "modified");
  assert.deepEqual(getWorkspaceDirectoryGitStatuses(statuses, "/w"), [
    "ignored",
    "modified",
    "added",
    "deleted",
    "renamed",
    "untracked",
  ]);
  assert.deepEqual(getWorkspaceDirectoryGitStatuses(statuses, "/w/a"), []);
});

test("Git availability, ignore paths and deleted row eligibility use explicit facts", () => {
  assert.equal(
    isWorkspaceFileTreeGitStatusAvailable({ isGitAvailable: true, isRepository: false }),
    false,
  );
  assert.equal(
    isWorkspaceFileTreeGitStatusAvailable({ isGitAvailable: false, isRepository: true }),
    false,
  );
  assert.equal(
    isWorkspaceFileTreeGitStatusAvailable({ isGitAvailable: true, isRepository: true }),
    true,
  );
  const ignored = buildWorkspaceFileIgnoredPathSet(["C:\\w\\ignored\\"]);
  assert.equal(isWorkspaceFileGitIgnored(ignored, "C:/w/ignored"), true);
  assert.equal(isWorkspaceFileTreeDeletedFile({ type: "directory" }, "deleted"), false);
  assert.equal(isWorkspaceFileTreeDeletedFile({ type: "file" }, "deleted"), true);
});

test("deleted rows keep input references, sort within loaded parents and do not invent a directory", () => {
  const folder = node("/w/folder", "directory", 0);
  const present = node("/w/z.txt", "file", 0);
  const untouched: WorkspaceFileTreeNode[] = [];
  const children = new Map([
    ["/w", [present, folder]],
    ["/w/folder", untouched],
  ]);
  const result = addDeletedGitStatusRowsToWorkspaceFileTree({
    rootPath: "/w",
    childrenByDirectory: children,
    statusByPath: new Map([
      ["/w/a.txt", "deleted"],
      ["/w/z.txt", "deleted"],
      ["/w/missing/ghost", "deleted"],
      ["/other/file", "deleted"],
    ]),
  });
  assert.notEqual(result, children);
  assert.deepEqual(
    result.get("/w")?.map((item) => item.name),
    ["folder", "a.txt", "z.txt"],
  );
  assert.equal(result.get("/w")?.[0], folder);
  assert.equal(result.get("/w")?.[2], present);
  assert.equal(result.get("/w/folder"), untouched);
  assert.deepEqual(children.get("/w"), [present, folder]);
  assert.equal(result.has("/w/missing"), false);
});

test("deleted projection with only known or unavailable paths returns the original map", () => {
  const children = new Map([["/w", [node("/w/a", "file", 0)]]]);
  assert.equal(
    addDeletedGitStatusRowsToWorkspaceFileTree({
      rootPath: "/w",
      childrenByDirectory: children,
      statusByPath: new Map([
        ["\\w\\a", "deleted"],
        ["/w/missing/file", "deleted"],
      ]),
    }),
    children,
  );
});

test("tree traversal follows sibling order and reports exact terminal directory flags", () => {
  const a = node("/w/a", "directory", 0);
  const file = node("/w/a/file", "file", 1);
  const z = node("/w/z", "file", 0);
  const state = tree(
    new Map([
      ["/w", [a, z]],
      [a.path, [file]],
    ]),
  );
  const error = new Error("unreadable");
  state.expandedPaths.add(a.path);
  state.loadingDirectoryPaths.add(a.path);
  state.errorByDirectory.set(a.path, error);
  const result = flattenWorkspaceFileTreeRows(state);
  assert.deepEqual(
    result.map((item) => [item.path, item.depth]),
    [
      [a.path, 0],
      [file.path, 1],
      [z.path, 0],
    ],
  );
  assert.equal(result[0]?.error, error);
  assert.equal(result[0]?.loading, true);
  assert.deepEqual(a, node("/w/a", "directory", 0));
});

test("single directory chains compact and an expanded inner path expands the projected row", () => {
  const a = node("/w/a", "directory", 0);
  const b = node("/w/a/b", "directory", 1);
  const file = node("/w/a/b/file", "file", 2);
  const state = tree(
    new Map([
      ["/w", [a]],
      [a.path, [b]],
      [b.path, [file]],
    ]),
  );
  state.loadedDirectoryPaths.add(a.path);
  state.loadedDirectoryPaths.add(b.path);
  state.expandedPaths.add(a.path);
  const result = flattenWorkspaceFileTreeRows({ ...state, flattenEmptyDirectories: true });
  assert.equal(result[0]?.name, "a/b");
  assert.equal(result[0]?.path, b.path);
  assert.deepEqual(result[0]?.compactedPaths, [a.path, b.path]);
  assert.deepEqual(
    result.map((item) => item.depth),
    [0, 1],
  );
});

test("nested compaction preserves the existing accumulated child offset", () => {
  const a = node("/w/a", "directory", 0);
  const b = node("/w/a/b", "directory", 1);
  const c = node("/w/a/b/c", "directory", 2);
  const d = node("/w/a/b/c/d", "directory", 3);
  const side = node("/w/a/b/side", "file", 2);
  const file = node("/w/a/b/c/d/file", "file", 4);
  const state = tree(
    new Map([
      ["/w", [a]],
      [a.path, [b]],
      [b.path, [c, side]],
      [c.path, [d]],
      [d.path, [file]],
    ]),
  );
  for (const item of [a, b, c, d]) state.loadedDirectoryPaths.add(item.path);
  state.expandedPaths.add(a.path);
  state.expandedPaths.add(c.path);
  assert.deepEqual(
    flattenWorkspaceFileTreeRows({ ...state, flattenEmptyDirectories: true }).map((item) => [
      item.name,
      item.depth,
    ]),
    [
      ["a/b", 0],
      ["c/d", 1],
      ["file", 1],
      ["side", 1],
    ],
  );
});

test("loading, error entries and symlinks block automatic compaction but allow explicit expansion", () => {
  const a = node("/w/a", "directory", 0);
  const b = { ...node("/w/a/b", "directory", 1), isSymbolicLink: true };
  const file = node("/w/a/b/file", "file", 2);
  const state = tree(
    new Map([
      ["/w", [a]],
      [a.path, [b]],
      [b.path, [file]],
    ]),
  );
  state.loadedDirectoryPaths.add(a.path);
  state.loadedDirectoryPaths.add(b.path);
  state.expandedPaths.add(a.path);
  state.expandedPaths.add(b.path);
  assert.equal(isWorkspaceFileTreeAutoFlattenableDirectory(b), false);
  assert.deepEqual(
    flattenWorkspaceFileTreeRows({ ...state, flattenEmptyDirectories: true }).map(
      (item) => item.name,
    ),
    ["a", "b", "file"],
  );
  const ordinary = node(b.path, "directory", 1);
  state.childrenByDirectory.set(a.path, [ordinary]);
  state.loadingDirectoryPaths.add(a.path);
  assert.equal(
    flattenWorkspaceFileTreeRows({ ...state, flattenEmptyDirectories: true })[0]?.name,
    "a",
  );
  state.loadingDirectoryPaths.clear();
  state.errorByDirectory.set(a.path, new Error("permission"));
  assert.equal(
    flattenWorkspaceFileTreeRows({ ...state, flattenEmptyDirectories: true })[0]?.name,
    "a",
  );
});

test("a deep expanded tree remains ordered without depending on the JavaScript call stack", () => {
  const state = tree(new Map());
  let parent = state.rootPath;
  for (let depth = 0; depth < 12000; depth += 1) {
    const child = node(`/w/level-${depth}`, "directory", depth);
    state.childrenByDirectory.set(parent, [child]);
    state.expandedPaths.add(child.path);
    parent = child.path;
  }
  const result = flattenWorkspaceFileTreeRows(state);
  assert.equal(result.length, 12000);
  assert.equal(result[11999]?.depth, 11999);
});

test("search keeps ancestor directories, matching directory descendants and row references", () => {
  const rows = [
    row("/w/src", "directory", 0),
    row("/w/src/match", "file", 1),
    row("/w/other", "file", 0),
  ];
  const statusByPath = new Map<string, WorkspaceFileGitStatus>();
  assert.equal(
    filterWorkspaceFileTreeRows({ rows, searchQuery: "  ", changedOnly: false, statusByPath }),
    rows,
  );
  const matching = filterWorkspaceFileTreeRows({
    rows,
    searchQuery: " MATCH ",
    changedOnly: false,
    statusByPath,
  });
  assert.deepEqual(matching, rows.slice(0, 2));
  assert.equal(matching[0], rows[0]);
  assert.deepEqual(
    filterWorkspaceFileTreeRows({ rows, searchQuery: "SRC", changedOnly: false, statusByPath }),
    rows.slice(0, 2),
  );
});

test("changedOnly runs before search and directory ignored descendants remain eligible", () => {
  const rows = [
    row("/w/src", "directory", 0),
    row("/w/src/ignored", "file", 1),
    row("/w/src/changed", "file", 1),
  ];
  const statusByPath = new Map<string, WorkspaceFileGitStatus>([
    ["/w/src/ignored", "ignored"],
    ["/w/src/changed", "modified"],
  ]);
  assert.deepEqual(
    filterWorkspaceFileTreeRows({ rows, searchQuery: "src", changedOnly: true, statusByPath }),
    [rows[0], rows[2]],
  );
  assert.deepEqual(
    filterWorkspaceFileTreeRows({ rows, searchQuery: "ignored", changedOnly: true, statusByPath }),
    [],
  );
  statusByPath.delete("/w/src/changed");
  assert.deepEqual(
    filterWorkspaceFileTreeRows({ rows, searchQuery: "", changedOnly: true, statusByPath }),
    [rows[0]],
  );
});

test("search projection and reveal preserve relative labels and the target's raw path", () => {
  const entries = [
    {
      name: "Same.java",
      path: "/w/src/Same.java",
      relativePath: "src/Same.java",
      type: "file" as const,
    },
  ];
  assert.deepEqual(createWorkspaceFileTreeRowsFromSearchEntries(entries), [
    {
      path: entries[0]!.path,
      name: "src/Same.java",
      type: "file",
      depth: 0,
      expanded: false,
      loaded: false,
      loading: false,
      error: null,
    },
  ]);
  assert.deepEqual(
    getWorkspaceFileSearchDirectoryRevealPaths({ workspacePath: "/w", directoryPath: "/w/a/b/" }),
    ["/w/a", "/w/a/b/"],
  );
  assert.deepEqual(
    getWorkspaceFileSearchDirectoryRevealPaths({ workspacePath: "/w", directoryPath: "/outside" }),
    [],
  );
});

test("refresh requests keep root/loaded/expanded order with raw-string deduplication", () => {
  assert.deepEqual(
    getWorkspaceFileTreeRefreshDirectoryPaths({
      workspacePath: "C:/w",
      loadedDirectoryPaths: new Set(["C:/w/a", "C:/else", "C:/w"]),
      expandedPaths: new Set(["C:/w/a", "C:\\w\\a", "C:/w/b"]),
    }),
    ["C:/w", "C:/w/a", "C:\\w\\a", "C:/w/b"],
  );
});
