import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("desktop main writes sanitized log lines to disk", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-main-log-security-"));
  const beforeEnv = process.env.KNORVIA_ENV;
  const beforeDir = process.env.KNORVIA_E2E_RUNTIME_LOG_DIR;
  process.env.KNORVIA_ENV = "test";
  process.env.KNORVIA_E2E_RUNTIME_LOG_DIR = root;
  try {
    const { logger } = await import("../src/main/logger.js");
    logger.error("Authorization: Bearer fake-main-token", {
      sshPassword: "fake-main-password",
      nested: new Error("apiKey=sk-abcdefghijklmnopqrstuvwxyz123456"),
    });
    const names = await readdir(root);
    assert.equal(names.length, 1);
    const log = await readFile(join(root, names[0]!), "utf8");
    assert.match(log, /\[main\]/);
    for (const marker of ["fake-main-token", "fake-main-password", "sk-abcdefghijklmnopqrstuvwxyz"]) {
      assert.equal(log.includes(marker), false);
    }
  } finally {
    if (beforeEnv === undefined) delete process.env.KNORVIA_ENV;
    else process.env.KNORVIA_ENV = beforeEnv;
    if (beforeDir === undefined) delete process.env.KNORVIA_E2E_RUNTIME_LOG_DIR;
    else process.env.KNORVIA_E2E_RUNTIME_LOG_DIR = beforeDir;
    await rm(root, { recursive: true, force: true });
  }
});
