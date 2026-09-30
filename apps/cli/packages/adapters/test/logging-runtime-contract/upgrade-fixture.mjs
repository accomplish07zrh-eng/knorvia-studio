// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// The caller supplies an explicitly preserved prior runtime; permanent CI never embeds it.
export async function checkUpgradeRollback(previousRoot, currentRoot, mode) {
  assert.ok(mode === "source" || mode === "dist");
  const subdir = mode === "source" ? "src" : "dist";
  const extension = mode === "source" ? "ts" : "js";
  const load = (root) =>
    import(pathToFileURL(join(root, subdir, "logging", `index.${extension}`)).href);
  const previous = await load(previousRoot);
  const current = await load(currentRoot);
  const root = await mkdtemp(join(tmpdir(), "knorvia-logging-upgrade-"));
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  try {
    const sentinels = new Map([
      ["settings.json", Buffer.from('{"fixture":true}\n')],
      ["session.db", Buffer.from([0, 1, 2, 255])],
    ]);
    for (const [name, bytes] of sentinels) await writeFile(join(root, name), bytes);
    const oldLogger = previous
      .createNodeLoggerFactory({ logDir: root, env: {} })
      .createLogger("upgrade");
    oldLogger.info("before", { sessionId: "fixture", status: "completed" });
    const logName = (await readdir(root)).find((name) => name.endsWith(".jsonl"));
    assert.ok(logName);
    const logPath = join(root, logName);
    const oldBytes = await readFile(logPath);
    current
      .createNodeLoggerFactory({ logDir: root, env: {} })
      .createLogger("upgrade")
      .info("upgrade", { sessionId: "fixture", status: "completed" });
    const upgraded = await readFile(logPath);
    assert.deepEqual(upgraded.subarray(0, oldBytes.length), oldBytes);
    // Restore the same prior runtime and keep the exact upgraded directory.
    previous
      .createNodeLoggerFactory({ logDir: root, env: {} })
      .createLogger("upgrade")
      .info("rollback", { sessionId: "fixture", status: "completed" });
    const rolledBack = await readFile(logPath);
    assert.deepEqual(rolledBack.subarray(0, upgraded.length), upgraded);
    const records = rolledBack.toString("utf8").trimEnd().split("\n").map(JSON.parse);
    assert.deepEqual(
      records.map((record) => record.message),
      ["before", "upgrade", "rollback"],
    );
    assert.ok(
      records.every((record) => record.sessionId === "fixture" && record.status === "completed"),
    );
    for (const [name, bytes] of sentinels)
      assert.equal(digest(await readFile(join(root, name))), digest(bytes));
    return {
      mode,
      oldWrites: 2,
      currentWrites: 1,
      records: records.length,
      oldPrefixPreserved: true,
      upgradedPrefixPreserved: true,
      unrelatedSentinelsPreserved: true,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
