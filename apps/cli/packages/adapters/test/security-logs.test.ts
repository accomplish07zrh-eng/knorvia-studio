import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LogLevel } from "@knorvia/contracts";
import { DefaultLogRedactor, NodeFileLogger } from "../src/logging/index.js";

test("CLI JSONL logger does not persist a credential from message, context or error", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-cli-log-security-"));
  try {
    const logger = new NodeFileLogger({
      category: "security-test",
      getMinLevel: () => LogLevel.Debug,
      logDir: root,
      redactor: new DefaultLogRedactor(),
    });
    logger.error(
      "request failed: Authorization=Bearer fake-secret-value",
      new Error("apiKey=sk-abcdefghijklmnopqrstuvwxyz123456"),
      { accessToken: "opaque-token-value", detail: "ghp_abcdefghijklmnopqrstuvwxyz123456" },
    );
    const names = await readdir(root);
    assert.equal(names.length, 1);
    const persisted = await readFile(join(root, names[0]!), "utf8");
    for (const marker of ["fake-secret-value", "sk-abcdefghijklmnopqrstuvwxyz", "opaque-token-value", "ghp_abcdef"]) {
      assert.equal(persisted.includes(marker), false);
    }
    assert.match(persisted, /request failed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
