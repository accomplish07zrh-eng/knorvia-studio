// SPDX-License-Identifier: Apache-2.0
// kernel-dsh-00 B16：会话日志只落 <DSH_HOME>/sessions，不写 Knorvia 旧库或数据根其他位置。
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, sep } from "node:path";
import test from "node:test";
import { loadKernel } from "./entry.mjs";
import { withBoot } from "./_kernel.mjs";
import { makeTempDir, removeTempDir } from "./_process.mjs";

async function collectFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) files.push(join(entry.parentPath, entry.name));
  }
  return files;
}

test("B16 会话日志只写 <DSH_HOME>/sessions，不写旧库", async () => {
  const kernel = await loadKernel();
  const root = await makeTempDir("kernel-dsh-session-");
  try {
    await withBoot(kernel, { root }, async ({ host, workspace, dataRoot, dshHome }) => {
      const persistence = host.context.get("sessionPersistence");
      assert.ok(persistence, "sessionPersistence 服务应存在");
      assert.equal(persistence.config.root, join(dshHome, "sessions"));

      const sessionId = "kernel-dsh-session-contract";
      const handle = await persistence.create({
        version: 4,
        id: sessionId,
        createdAt: Date.now(),
        cwd: workspace,
        isSeeded: false,
      });
      await handle.append([{ type: "turn/start", seq: 0, time: Date.now(), data: { turn: 1 } }]);
      await handle.flush();
      await handle.close();
      await persistence.flush();

      const stored = await persistence.list();
      assert.ok(
        stored.some((snapshot) => snapshot.header.id === sessionId),
        JSON.stringify(stored.map((snapshot) => snapshot.header.id)),
      );

      const sessionsRoot = join(dshHome, "sessions");
      const files = await collectFiles(sessionsRoot);
      assert.ok(files.length > 0, "会话必须落盘");
      for (const file of files) {
        assert.ok(file.startsWith(`${sessionsRoot}${sep}`), file);
      }
      const logFiles = files.filter((file) => file.endsWith(".jsonl"));
      assert.ok(logFiles.length > 0, JSON.stringify(files));
      const contents = await readFile(logFiles[0], "utf8");
      assert.ok(contents.includes(sessionId));

      assert.equal(existsSync(join(dataRoot, "cli", "db", "db.sqlite")), false);
      assert.deepEqual((await readdir(dataRoot)).sort(), ["dsh"]);
    });
  } finally {
    await removeTempDir(root);
  }
});
