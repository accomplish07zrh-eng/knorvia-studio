// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 临时目录端口的契约测试：验证 Hook 执行器依赖的两个语义。
//
// 测试对象是 **adapters 的 node 实现**（`createNodeTempDirectoryPort`）——
// 而本包只依赖接口，所以测试里也演示了「内存替身」的写法（hook-runner 的测试会用）。
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

async function loadAdapter() {
  return await import("../../../../apps/cli/packages/adapters/src/fs/temp-directory.ts");
}

test("createTempDirectory：创建唯一目录，位于系统临时目录下", async () => {
  const { createNodeTempDirectoryPort } = await loadAdapter();
  const port = createNodeTempDirectoryPort();

  const { path } = await port.createTempDirectory({ prefix: "knorvia-hook-" });

  assert.ok(path.startsWith(tmpdir()), `应在系统临时目录下，实际：${path}`);
  assert.ok(existsSync(path), "目录应真实存在");

  await port.removeDirectory({ path });
});

test("createTempDirectory：两次调用得到不同目录（唯一性）", async () => {
  const { createNodeTempDirectoryPort } = await loadAdapter();
  const port = createNodeTempDirectoryPort();

  const first = await port.createTempDirectory({ prefix: "knorvia-hook-" });
  const second = await port.createTempDirectory({ prefix: "knorvia-hook-" });

  assert.notEqual(first.path, second.path, "两次调用必须是不同目录");

  await port.removeDirectory({ path: first.path });
  await port.removeDirectory({ path: second.path });
});

test("createTempDirectory：可指定父目录", async () => {
  const { createNodeTempDirectoryPort } = await loadAdapter();
  const port = createNodeTempDirectoryPort();

  const parent = await port.createTempDirectory({ prefix: "knorvia-hook-parent-" });
  const child = await port.createTempDirectory({
    prefix: "knorvia-hook-",
    parentDirectory: parent.path,
  });

  assert.ok(child.path.startsWith(parent.path), `子目录应在父目录下，实际：${child.path}`);

  await port.removeDirectory({ path: parent.path });
});

test("removeDirectory：递归删除含文件的目录", async () => {
  const { createNodeTempDirectoryPort } = await loadAdapter();
  const port = createNodeTempDirectoryPort();

  const { path } = await port.createTempDirectory({ prefix: "knorvia-hook-" });
  await writeFile(join(path, "transcript.jsonl"), "line\n", "utf8");

  await port.removeDirectory({ path });
  assert.equal(existsSync(path), false, "目录应被递归删除");
});

test("removeDirectory：幂等——重复调用不抛错", async () => {
  const { createNodeTempDirectoryPort } = await loadAdapter();
  const port = createNodeTempDirectoryPort();

  const { path } = await port.createTempDirectory({ prefix: "knorvia-hook-" });
  await port.removeDirectory({ path });

  let threw = false;
  try {
    await port.removeDirectory({ path });
  } catch {
    threw = true;
  }
  assert.equal(threw, false, "重复删除不应抛错（B1.5 要求）");
});

test("removeDirectory：missingOk=false 时不存在应报错", async () => {
  const { createNodeTempDirectoryPort } = await loadAdapter();
  const port = createNodeTempDirectoryPort();

  let threw = false;
  try {
    await port.removeDirectory({
      path: join(tmpdir(), "knorvia-hook-definitely-missing-abc"),
      missingOk: false,
    });
  } catch {
    threw = true;
  }
  assert.equal(threw, true, "missingOk=false 时应报错");
});

test("内存替身可用：本包只依赖接口，不依赖 node 实现", async () => {
  // 演示 hook-runner 测试会用的替身写法：不碰真实文件系统。
  const created = [];
  const removed = [];
  const fake = {
    async createTempDirectory({ prefix }) {
      const path = `/virtual/${prefix}${created.length}`;
      created.push(path);
      return { path };
    },
    async removeDirectory({ path }) {
      removed.push(path);
      return { removed: true };
    },
  };

  const first = await fake.createTempDirectory({ prefix: "knorvia-hook-" });
  await fake.removeDirectory({ path: first.path });

  assert.equal(created.length, 1);
  assert.equal(removed.length, 1);
  assert.equal(removed[0], first.path);
});
