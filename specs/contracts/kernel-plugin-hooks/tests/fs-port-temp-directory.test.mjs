// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// FileSystemPort 新增两个方法的契约测试：
//   createTempDirectory（mkdtemp 语义）
//   removeDirectory（递归 + 幂等）
//
// 这两个方法是 kernel-plugin-hooks 的 B1.2 / B1.5 的硬依赖：
//   · 在系统临时目录下创建唯一目录
//   · cleanup() 递归删除且可重复调用不抛错
//
// 走公开入口：`@knorvia/adapters` 的 createNodeFileSystemAdapter。
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

async function loadAdapter() {
  return await import("../../../../apps/cli/packages/adapters/src/fs/index.ts");
}

test("createTempDirectory：创建唯一目录，位于系统临时目录下", async () => {
  const { createNodeFileSystemAdapter } = await loadAdapter();
  const fsPort = createNodeFileSystemAdapter();

  const { path } = await fsPort.createTempDirectory({ prefix: "knorvia-hook-" });

  assert.equal(typeof path, "string");
  assert.ok(path.length > 0, "应返回路径");
  assert.ok(path.startsWith(tmpdir()), `应在系统临时目录下，实际：${path}`);
  assert.ok(existsSync(path), "目录应真实存在");

  // 清理
  await fsPort.removeDirectory({ path });
});

test("createTempDirectory：两次调用得到不同目录（唯一性）", async () => {
  const { createNodeFileSystemAdapter } = await loadAdapter();
  const fsPort = createNodeFileSystemAdapter();

  const first = await fsPort.createTempDirectory({ prefix: "knorvia-hook-" });
  const second = await fsPort.createTempDirectory({ prefix: "knorvia-hook-" });

  assert.notEqual(first.path, second.path, "两次调用必须是不同目录");

  await fsPort.removeDirectory({ path: first.path });
  await fsPort.removeDirectory({ path: second.path });
});

test("removeDirectory：递归删除含文件的目录", async () => {
  const { createNodeFileSystemAdapter } = await loadAdapter();
  const fsPort = createNodeFileSystemAdapter();

  const { path } = await fsPort.createTempDirectory({ prefix: "knorvia-hook-" });
  await writeFile(join(path, "transcript.jsonl"), "line\n", "utf8");
  assert.ok(existsSync(path));

  await fsPort.removeDirectory({ path });
  assert.equal(existsSync(path), false, "目录应被递归删除");
});

test("removeDirectory：幂等——重复调用不抛错", async () => {
  const { createNodeFileSystemAdapter } = await loadAdapter();
  const fsPort = createNodeFileSystemAdapter();

  const { path } = await fsPort.createTempDirectory({ prefix: "knorvia-hook-" });
  await fsPort.removeDirectory({ path });

  // 第二次删除：不应抛错（B1.5 要求 cleanup 可重复调用）
  let threw = false;
  try {
    await fsPort.removeDirectory({ path });
  } catch {
    threw = true;
  }
  assert.equal(threw, false, "重复删除不应抛错");
});

test("removeDirectory：目录本不存在时不抛错（missingOk 默认 true）", async () => {
  const { createNodeFileSystemAdapter } = await loadAdapter();
  const fsPort = createNodeFileSystemAdapter();

  let threw = false;
  try {
    await fsPort.removeDirectory({ path: join(tmpdir(), "knorvia-hook-never-existed-xyz") });
  } catch {
    threw = true;
  }
  assert.equal(threw, false, "不存在的目录不应抛错");
});

test("removeDirectory：missingOk=false 时不存在应报错", async () => {
  const { createNodeFileSystemAdapter } = await loadAdapter();
  const fsPort = createNodeFileSystemAdapter();

  let threw = false;
  try {
    await fsPort.removeDirectory({
      path: join(tmpdir(), "knorvia-hook-never-existed-abc"),
      missingOk: false,
    });
  } catch {
    threw = true;
  }
  assert.equal(threw, true, "missingOk=false 时应报错");
});
