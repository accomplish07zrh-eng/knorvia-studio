// SPDX-License-Identifier: Apache-2.0
// Interaction/reveal/viewport contracts; source-port execution is not browser acceptance.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FileTreePanelInteractionOwner,
  type FileTreePanelPorts,
} from "../src/workspace-file-tree/fileTreePanelInteractionOwner.js";
import { observeFileTreeViewport } from "../src/workspace-file-tree/fileTreeViewportLease.js";
import type {
  WorkspaceFileGitStatus,
  WorkspaceFileTreeRow,
} from "../src/workspace-file-tree/model.js";
import type { FileTreeDirectoryLoadResult } from "../src/workspace-file-tree/fileTreeDataOwner.js";

const row = (path: string, expanded = false, compactedPaths?: string[]): WorkspaceFileTreeRow => ({
  path,
  type: "directory",
  expanded,
  name: path,
  depth: 1,
  compactedPaths,
  loaded: false,
  loading: false,
  error: null,
});
const flush = () =>
  new Promise<void>((resolve) => {
    queueMicrotask(() => queueMicrotask(resolve));
  });
function fixture() {
  let expanded = new Set<string>();
  const gitStatus = new Map<string, WorkspaceFileGitStatus>();
  const journal: unknown[] = [];
  const ports: FileTreePanelPorts = {
    workspacePath: "/w",
    loadDirectory: async (path, depth) => {
      journal.push(["load", path, depth]);
      return "loaded";
    },
    setExpanded: (update) => {
      expanded = update(expanded);
    },
    gitStatus,
    preview: (source) => {
      journal.push(["preview", source]);
    },
    refreshDirectories: async () => {
      journal.push("refresh-tree");
    },
    refreshSearch: () => {
      journal.push("refresh-index");
    },
    fileManager: async () => ({ success: false }),
    clipboardAvailable: () => true,
    copyPath: async () => {},
    notify: (id, suffix) => {
      journal.push(["notify", id, suffix]);
    },
    log: (level, message, details) => {
      journal.push([level, message, details]);
    },
  };
  const owner = new FileTreePanelInteractionOwner(() => ports),
    stop = owner.activate();
  return { owner, ports, gitStatus, stop, journal, expanded: () => expanded };
}

test("explicit preview reveal expands in order, loads ordinal depth and auto-scrolls exactly once when visible", async () => {
  const h = fixture(),
    scrolled: number[] = [];
  h.owner.revealPreview("/w/ignored", " /w/a/b ");
  assert.equal(h.owner.read().selected, "/w/a/b");
  await flush();
  assert.deepEqual(h.journal, [
    ["load", "/w/a", 1],
    ["load", "/w/a/b", 2],
  ]);
  assert.deepEqual([...h.expanded()], ["/w/a", "/w/a/b"]);
  h.owner.revealVisiblePreview([], undefined, "/w/a/b", (index) => scrolled.push(index));
  h.owner.revealVisiblePreview([row("/w/a"), row("/w/a/b")], undefined, "/w/a/b", (index) =>
    scrolled.push(index),
  );
  h.owner.revealVisiblePreview([row("/w/a/b")], undefined, "/w/a/b", (index) =>
    scrolled.push(index),
  );
  assert.deepEqual(scrolled, [1]);
  h.stop();
});

test("preview request replacement and scope cleanup prevent subsequent directory calls without aborting the issued one", async () => {
  const h = fixture();
  let complete!: (result: FileTreeDirectoryLoadResult) => void;
  h.ports.loadDirectory = (path, depth) => {
    h.journal.push(["load", path, depth]);
    return new Promise<FileTreeDirectoryLoadResult>((resolve) => {
      complete = resolve;
    });
  };
  const cancel = h.owner.revealPreview(undefined, "/w/a/b")!;
  cancel();
  complete("loaded");
  await flush();
  assert.deepEqual(h.journal, [["load", "/w/a", 1]]);
  h.owner.revealPreview(undefined, "/w/a/b");
  h.stop();
  complete("stale");
  await flush();
  assert.equal(h.journal.length, 2);
});

test("directory load status stays at the data owner while reveal awaits each call in order", async () => {
  const h = fixture();
  const results: FileTreeDirectoryLoadResult[] = ["failed", "stale", "loaded"];
  h.ports.loadDirectory = async (path, depth) => {
    h.journal.push(["load", path, depth]);
    return results.shift()!;
  };
  h.owner.revealPreview(undefined, "/w/a/b/c");
  await flush();
  assert.deepEqual(h.journal, [
    ["load", "/w/a", 1],
    ["load", "/w/a/b", 2],
    ["load", "/w/a/b/c", 3],
  ]);
  assert.equal(h.owner.read().selected, "/w/a/b/c");
  h.stop();
});

test("search directory action clears query, keeps physical depths and centers after returning to visible tree rows", async () => {
  const h = fixture(),
    scrolled: number[] = [];
  h.owner.search("query");
  h.owner.directory(row("/w/a/b"));
  assert.equal(h.owner.read().query, "");
  assert.equal(h.owner.read().selected, "/w/a/b");
  await flush();
  assert.deepEqual(h.journal, [
    ["load", "/w/a", 1],
    ["load", "/w/a/b", 2],
  ]);
  h.owner.revealVisibleSearch([row("/w/a/b")], true, (index) => scrolled.push(index));
  h.owner.revealVisibleSearch([row("/w/a/b")], false, (index) => scrolled.push(index));
  assert.deepEqual(scrolled, [0]);
  h.owner.toggle(row("/w/a/b", true, ["/w/a", "/w/a/b"]));
  assert.deepEqual([...h.expanded()], []);
  h.stop();
});

test("keyboard admission preserves prevention rules and deleted files never reach preview", () => {
  const h = fixture();
  let prevented = 0;
  const event = (key: string) => ({
    key,
    preventDefault: () => {
      prevented += 1;
    },
  });
  const file = {
    path: "/w/deleted.txt",
    type: "file",
    name: "deleted.txt",
    depth: 1,
  } as WorkspaceFileTreeRow;
  h.gitStatus.set(file.path, "deleted");
  h.owner.keyDown(event("Enter"), file);
  h.owner.keyDown(event("ArrowRight"), file);
  h.owner.keyDown(event("ArrowLeft"), row("/w/a"));
  h.owner.keyDown(event("ArrowRight"), row("/w/a", true));
  assert.equal(prevented, 2);
  assert.deepEqual(h.journal, []);
  h.stop();
});

test("refresh ordering and nonblocking error notifications retain their original boundaries", () => {
  const h = fixture();
  h.owner.search("query");
  h.owner.refresh();
  assert.deepEqual(h.journal, ["refresh-tree", "refresh-index"]);
  h.owner.noticeRootError(true, new Error("same"));
  h.owner.noticeRootError(true, new Error("same"));
  h.owner.noticeRootError(true, null);
  h.owner.noticeRootError(true, new Error("same"));
  assert.equal(
    h.journal.filter((event) => Array.isArray(event) && event[0] === "notify").length,
    2,
  );
  h.stop();
});

test("viewport paints native offsets, coalesces resize frames, and cleanup cancels publication", () => {
  const listeners = new Map<string, () => void>(),
    frames = new Map<number, () => void>(),
    journal: unknown[] = [];
  let id = 0,
    resize!: () => void;
  const node = {
    scrollTop: 0,
    clientHeight: 100,
    scrollHeight: 200,
    addEventListener: (type: string, callback: () => void) => {
      listeners.set(type, callback);
    },
    removeEventListener: () => {},
  } as unknown as HTMLElement;
  const cleanup = observeFileTreeViewport({
    scroll: node,
    content: null,
    window: {
      addEventListener: (type: string, callback: () => void) => listeners.set(type, callback),
      removeEventListener: () => {},
    } as unknown as Window,
    offset: (value) => {
      journal.push(value);
    },
    publish: (metrics) => {
      journal.push(metrics);
    },
    resizeObserver: (callback) => {
      resize = callback;
      return {
        observe: () => {},
        disconnect: () => {
          journal.push("disconnect");
        },
      } as unknown as ResizeObserver;
    },
    frame: (callback) => {
      frames.set(++id, callback);
      return id;
    },
    cancelFrame: (frame) => {
      journal.push(["cancel", frame]);
    },
  });
  assert.deepEqual(journal, ["0px", { overflow: true, bottomMask: true }]);
  node.scrollTop = 100;
  listeners.get("scroll")!();
  assert.deepEqual(journal.slice(-2), ["100px", { overflow: true, bottomMask: false }]);
  resize();
  listeners.get("resize")!();
  assert.equal(frames.size, 1);
  cleanup();
  const count = journal.length;
  frames.get(1)!();
  listeners.get("scroll")!();
  assert.equal(journal.length, count);
});
