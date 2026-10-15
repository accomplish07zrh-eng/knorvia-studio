// SPDX-License-Identifier: Apache-2.0
// shared-03 契约测试：workspaceFile 三件（behavior B27–B29，金样①）。
import assert from "node:assert/strict";
import test from "node:test";

import { loadModule } from "./entry.mjs";
import { fileEntriesRoundtrip as golden } from "./fixtures.mjs";

const codec = await loadModule("workspaceFileEntriesCodec");
const search = await loadModule("workspaceFileSearch");
const restore = await loadModule("workspaceSessionRestore");

test("B27 语义常量与打包字节（金样 packed 逐字节）", () => {
  assert.equal(codec.WORKSPACE_FILE_ENTRIES_CHUNK_SIZE, 4000000);
  assert.equal(golden.chunkSize, 4000000);
  for (const c of golden.cases) {
    assert.equal(codec.packWorkspaceFileEntries(c.entries), c.packed, `pack(${c.root}) 逐字节`);
  }
});

test("B27 往返不变量（含 \\\\t\\\\n 转义与空数组）", () => {
  for (const c of golden.cases) {
    assert.deepEqual(
      codec.unpackWorkspaceFileEntries(codec.packWorkspaceFileEntries(c.entries), c.root),
      c.entries,
      `roundtrip(${c.root})`,
    );
    assert.deepEqual(codec.unpackWorkspaceFileEntries(c.packed, c.root), c.roundtrip);
  }
  assert.deepEqual(codec.unpackWorkspaceFileEntries("", "/ws"), [], "空串 → 空数组");
  // type 归一：除 'directory' 外一律 file
  const packed = "weird\tsub/x";
  const [entry] = codec.unpackWorkspaceFileEntries(packed, "/ws");
  assert.equal(entry.type, "file");
  assert.equal(entry.name, "x");
  assert.equal(entry.path, "/ws/sub/x");
});

test("B27 分隔符随根形态（Windows 根反斜杠）", () => {
  const [entry] = codec.unpackWorkspaceFileEntries("file\tsub/x", "C:\\ws");
  assert.equal(entry.path, "C:\\ws\\sub\\x");
});

test("B28 打分序：前缀 < 子串 < 模糊；空 query 规则", () => {
  assert.equal(search.scoreWorkspaceFileFuzzyMatch("abc", ""), 0);
  assert.equal(search.scoreWorkspaceFileFuzzyMatch("", "a"), null);
  const prefix = search.scoreWorkspaceFileFuzzyMatch("abc.ts", "abc");
  const substring = search.scoreWorkspaceFileFuzzyMatch("xabc.ts", "abc");
  const fuzzy = search.scoreWorkspaceFileFuzzyMatch("a-x-b-c.ts", "abc");
  assert.ok(prefix !== null && substring !== null && fuzzy !== null);
  assert.ok(prefix < 100, "前缀命中 <100");
  assert.ok(substring >= 100 && substring < 200, "子串命中 100+");
  assert.ok(fuzzy >= 200, "模糊 200+");
  assert.equal(search.scoreWorkspaceFileFuzzyMatch("xyz", "q"), null);
});

test("B28 过滤：requireQuery 与 limit 有序池", () => {
  const candidates = search.mapWorkspaceFileEntriesToSearchCandidates([
    { name: "a.ts", path: "/ws/a.ts", relativePath: "a.ts", type: "file" },
    { name: "b.ts", path: "/ws/b.ts", relativePath: "b.ts", type: "file" },
    { name: "dir", path: "/ws/dir", relativePath: "dir", type: "directory" },
  ]);
  assert.equal(candidates[0].lowercaseRelativePath, "a.ts");
  assert.deepEqual(
    search.filterWorkspaceFileSearchCandidates(candidates, "  ", { requireQuery: true }),
    [],
  );
  const all = search.filterWorkspaceFileSearchCandidates(candidates, "");
  assert.equal(all.length, 3);
  assert.equal(all[0].type, "file", "空 query 列表文件优先、目录在后");
  const hit = search.filterWorkspaceFileSearchCandidates(candidates, "a.t", { limit: 1 });
  assert.equal(hit.length, 1);
  assert.equal(search.hasWorkspaceFileSearchQuery(" x "), true);
  assert.equal(search.hasWorkspaceFileSearchQuery(" "), false);
  assert.equal(search.WORKSPACE_FILE_SEARCH_DISPLAY_CAP, 1000);
});

test("B29 启动索引：本地优先与回绕", () => {
  const sessions = [{ kind: "remote" }, { kind: "local" }, { kind: "local" }, { kind: "remote" }];
  assert.equal(restore.resolveStartupLocalWorkspaceSessionIndex([], 0), null);
  assert.equal(
    restore.resolveStartupLocalWorkspaceSessionIndex(sessions, 3),
    1,
    "回绕后从 0 起首个本地项",
  );
  assert.equal(restore.resolveStartupLocalWorkspaceSessionIndex(sessions, 0), 1);
  const remoteOnly = [{ kind: "remote" }, { kind: "remote" }];
  assert.equal(restore.resolveStartupLocalWorkspaceSessionIndex(remoteOnly, 1), null);
  assert.equal(restore.resolveStartupLocalWorkspaceSessionIndex(sessions, undefined), 1);
});
