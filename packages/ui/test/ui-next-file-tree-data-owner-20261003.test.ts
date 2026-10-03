// SPDX-License-Identifier: Apache-2.0
// Pending lifecycle contracts; not run and not React/DOM or actual host acceptance.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { FileEntry, GitRefreshResult } from "@knorvia/shared";
import { WorkspaceFileTreeDataOwner } from "../src/workspace-file-tree/fileTreeDataOwner.js";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const file = (path: string): FileEntry => ({ path, name: path.split("/").at(-1)!, type: "file" });
const directory = (path: string, isSymbolicLink = false): FileEntry => ({
  ...file(path),
  type: "directory",
  isSymbolicLink,
});
const gitResult = (): GitRefreshResult => ({
  summary: {
    workspacePath: "/w",
    repoRoot: "/w",
    workspaceInRepoPath: "",
    autoRefreshWatchPaths: [],
    branchName: "main",
    trackingBranchName: null,
    headRefType: "branch",
    ahead: 0,
    behind: 0,
    isDirty: false,
    isGitAvailable: true,
    isRepository: true,
  },
  identity: null,
  unstagedChanges: [],
  stagedChanges: [],
  branchComparison: null,
});
const settle = async () => {
  for (let count = 0; count < 8; count += 1) await Promise.resolve();
};

function harness(enableWorkspaceFeatures = false, onWatchRefresh?: () => void) {
  const reads: Array<{
    path: string;
    includeHidden?: boolean;
    reply: ReturnType<typeof deferred<FileEntry[]>>;
  }> = [];
  const ignored: Array<{ paths: string[]; reply: ReturnType<typeof deferred<string[]>> }> = [];
  const gitReads: Array<ReturnType<typeof deferred<GitRefreshResult>>> = [];
  const warnings: string[] = [];
  const owner = new WorkspaceFileTreeDataOwner({
    workspacePath: "/w",
    enableWorkspaceFeatures,
    fileService: {
      readdir: ({ path, includeHidden }) => {
        const reply = deferred<FileEntry[]>();
        reads.push({ path, includeHidden, reply });
        return reply.promise;
      },
    },
    gitService: {
      refresh: () => {
        const reply = deferred<GitRefreshResult>();
        gitReads.push(reply);
        return reply.promise;
      },
      getIgnoredPaths: ({ paths }) => {
        const reply = deferred<string[]>();
        ignored.push({ paths, reply });
        return reply.promise;
      },
    },
    warn: (message) => {
      warnings.push(message);
    },
    onWatchRefresh,
  });
  return { owner, reads, ignored, gitReads, warnings };
}

test("non-force admission shares the loading fact, while only a newer force request publishes", async () => {
  const { owner, reads } = harness();
  const stop = owner.start();
  assert.equal(await owner.loadDirectory("/w", 0), "loaded");
  assert.equal(reads.length, 1);
  assert.equal(reads[0]!.includeHidden, true);
  const forced = owner.loadDirectory("/w", 4, { force: true });
  reads[0]!.reply.resolve([file("/w/stale")]);
  await settle();
  assert.equal(owner.read().childrenByDirectory.size, 0);
  assert.equal(owner.read().loadingDirectoryPaths.has("/w"), true);
  reads[1]!.reply.resolve([file("/w/current")]);
  assert.equal(await forced, "loaded");
  assert.deepEqual(owner.read().childrenByDirectory.get("/w"), [
    { ...file("/w/current"), depth: 4, isSymbolicLink: false },
  ]);
  assert.equal(owner.read().loadingDirectoryPaths.has("/w"), false);
  assert.equal(owner.loadedDirectoryPathsRef.current, owner.read().loadedDirectoryPaths);
  stop();
});

test("accepted watch batches refresh the search index once and closed scopes cannot refresh it", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let indexRefreshes = 0;
  const { owner, reads } = harness(false, () => {
    indexRefreshes += 1;
  });
  const stop = owner.start();
  reads[0]!.reply.resolve([]);
  await settle();
  assert.equal(indexRefreshes, 0);
  owner.enqueueWatchRefresh("/outside");
  owner.enqueueWatchRefresh("/w");
  owner.enqueueWatchRefresh("/w");
  context.mock.timers.tick(300);
  assert.equal(reads.length, 2);
  assert.equal(indexRefreshes, 0);
  reads[1]!.reply.resolve([file("/w/new-file")]);
  await settle();
  assert.equal(indexRefreshes, 1);
  owner.enqueueWatchRefresh("/w");
  context.mock.timers.tick(300);
  stop();
  const stopReplay = owner.start();
  reads[2]!.reply.resolve([file("/w/late-old-scope")]);
  reads[3]!.reply.resolve([]);
  await settle();
  assert.equal(indexRefreshes, 1);
  owner.enqueueWatchRefresh("/w");
  context.mock.timers.tick(300);
  reads[4]!.reply.resolve([file("/w/current-scope")]);
  await settle();
  assert.equal(indexRefreshes, 2);
  stopReplay();
});

test("ordinary single-directory chains prefetch silently and symlink directories do not recurse", async () => {
  const { owner, reads } = harness();
  const stop = owner.start();
  reads[0]!.reply.resolve([directory("/w/child")]);
  await settle();
  assert.equal(reads[1]!.path, "/w/child");
  assert.equal(owner.read().loadingDirectoryPaths.has("/w/child"), false);
  reads[1]!.reply.resolve([file("/w/child/leaf")]);
  await settle();
  assert.equal(owner.read().childrenByDirectory.get("/w/child")![0]!.depth, 1);
  const forced = owner.loadDirectory("/w", 0, { force: true });
  reads[2]!.reply.resolve([directory("/w/link", true)]);
  await forced;
  assert.equal(reads.length, 3);
  assert.equal(owner.read().childrenByDirectory.get("/w")![0]!.isSymbolicLink, true);
  stop();
});

test("scope cleanup rejects late directory/Git/ignored results and supports effect replay", async () => {
  const { owner, reads, ignored, gitReads } = harness(true);
  const stop = owner.start();
  reads[0]!.reply.resolve([file("/w/old")]);
  await settle();
  stop();
  const stopReplay = owner.start();
  ignored[0]!.reply.resolve(["/w/old"]);
  gitReads[0]!.resolve(gitResult());
  await settle();
  assert.equal(owner.read().ignoredPathSet.size, 0);
  assert.equal(owner.read().gitStatusAvailable, false);
  assert.equal(owner.read().childrenByDirectory.size, 0);
  stopReplay();
  const beforeLate = owner.read();
  reads[1]!.reply.resolve([file("/w/after-unmount")]);
  gitReads[1]!.resolve(gitResult());
  await settle();
  assert.equal(owner.read(), beforeLate);
  assert.equal(ignored.length, 1);
});

test("manual refresh rejects reentry and retains loaded child data on a current read failure", async () => {
  const { owner, reads } = harness();
  const stop = owner.start();
  reads[0]!.reply.resolve([directory("/w/child"), file("/w/other")]);
  await settle();
  owner.setExpandedPaths((paths) => new Set([...paths, "/w/child"]));
  const child = owner.loadDirectory("/w/child", 1);
  reads[1]!.reply.resolve([file("/w/child/retained")]);
  await child;
  const retained = owner.read().childrenByDirectory.get("/w/child");
  const refresh = owner.refreshLoadedDirectories();
  await owner.refreshLoadedDirectories();
  assert.equal(reads.length, 4);
  assert.equal(owner.read().refreshingLoadedDirectories, true);
  reads[2]!.reply.resolve([]);
  const failure = new Error("temporary permission failure");
  reads[3]!.reply.reject(failure);
  await refresh;
  assert.equal(owner.read().childrenByDirectory.get("/w/child"), retained);
  assert.equal(owner.read().expandedPaths.has("/w/child"), true);
  assert.equal(owner.read().loadedDirectoryPaths.has("/w/child"), true);
  assert.equal(owner.read().errorByDirectory.get("/w/child"), failure);
  assert.equal(owner.read().refreshingLoadedDirectories, false);
  stop();
});

test("a manual deadline records the same error and revokes a late successful directory result", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const { owner, reads, warnings } = harness();
  const stop = owner.start();
  reads[0]!.reply.resolve([file("/w/retained")]);
  await settle();
  const retained = owner.read().childrenByDirectory.get("/w");
  const refresh = owner.refreshLoadedDirectories();
  context.mock.timers.tick(15_000);
  await refresh;
  assert.equal(
    owner.read().errorByDirectory.get("/w")?.message,
    "workspace file tree refresh /w timed out after 15000ms",
  );
  assert.equal(warnings.includes("[WorkspaceFileTree] 手动刷新目录超时或失败"), true);
  reads[1]!.reply.resolve([file("/w/late")]);
  await settle();
  assert.equal(owner.read().childrenByDirectory.get("/w"), retained);
  stop();
});

test("watch failure prunes only its subtree and re-reads the parent after debounce", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const { owner, reads } = harness();
  const stop = owner.start();
  reads[0]!.reply.resolve([directory("/w/child"), file("/w/other")]);
  await settle();
  owner.setExpandedPaths(new Set(["/w/child"]));
  const loaded = owner.loadDirectory("/w/child", 1);
  reads[1]!.reply.resolve([file("/w/child/old")]);
  await loaded;
  owner.enqueueWatchRefresh("/outside");
  owner.enqueueWatchRefresh("/w/child");
  context.mock.timers.tick(299);
  assert.equal(reads.length, 2);
  context.mock.timers.tick(1);
  assert.equal(reads[2]!.path, "/w/child");
  reads[2]!.reply.reject(new Error("removed"));
  await settle();
  assert.equal(owner.read().childrenByDirectory.has("/w/child"), false);
  assert.equal(owner.read().errorByDirectory.has("/w/child"), false);
  assert.equal(owner.read().expandedPaths.has("/w/child"), false);
  assert.equal(reads[3]!.path, "/w");
  reads[3]!.reply.resolve([file("/w/other")]);
  await settle();
  stop();
});

test("bulk watch fallback reads the current expanded set and cleanup clears its timer", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const { owner, reads } = harness();
  const stop = owner.start();
  reads[0]!.reply.resolve([]);
  await settle();
  owner.setExpandedPaths(new Set(["/w/current-expanded"]));
  for (let index = 0; index < 51; index += 1) owner.enqueueWatchRefresh(`/w/changed-${index}`);
  context.mock.timers.tick(300);
  assert.deepEqual(
    reads.slice(1).map(({ path }) => path),
    ["/w", "/w/current-expanded"],
  );
  reads[1]!.reply.resolve([]);
  reads[2]!.reply.resolve([]);
  await settle();
  owner.enqueueWatchRefresh("/w");
  stop();
  context.mock.timers.tick(300);
  assert.equal(reads.length, 3);
});

test("Git failure clears availability, while a manual Git timeout retains the previous snapshot", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const { owner, reads, ignored, gitReads } = harness(true);
  const stop = owner.start();
  reads[0]!.reply.resolve([]);
  gitReads[0]!.resolve(gitResult());
  await settle();
  ignored[0]!.reply.resolve([]);
  const retained = owner.read().gitStatusByPath;
  const refresh = owner.refreshLoadedDirectories();
  reads[1]!.reply.resolve([]);
  await settle();
  assert.equal(gitReads.length, 2);
  context.mock.timers.tick(8_000);
  await refresh;
  assert.equal(owner.read().gitStatusAvailable, true);
  assert.equal(owner.read().gitStatusByPath, retained);
  gitReads[1]!.reject(new Error("late timeout failure"));
  await settle();
  assert.equal(owner.read().gitStatusAvailable, true);
  const failure = owner.loadGitStatus();
  gitReads[2]!.reject(new Error("current failure"));
  await failure;
  assert.equal(owner.read().gitStatusAvailable, false);
  assert.equal(owner.read().gitStatusByPath.size, 0);
  stop();
});
