// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ownedEnvironment } from "../harness/owned-env.mjs";
import { failNextWrite, resetPersistenceState } from "../harness/seam-controls.mjs";
import {
  authModule,
  caseTemp,
  ensureCaseTemp,
  identityCipher,
  readJson,
  writeJson,
} from "../harness/test-context.mjs";

const WORKER = new URL("../harness/store-worker.mjs", import.meta.url);

function launchWorker(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(WORKER), ...args], {
      cwd: process.cwd(),
      env: ownedEnvironment(process.env, process.env.KNORVIA_TEST_TEMP_ROOT, {
        KNORVIA_TEST_WRITE_DELAY_MS: "12",
      }),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, stderr, stdout }));
  });
}

async function waitForFiles(paths) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const present = await Promise.all(
      paths.map((file) =>
        access(file).then(
          () => true,
          () => false,
        ),
      ),
    );
    if (present.every(Boolean)) return;
    await delay(5);
  }
  throw new Error(`workers did not reach barrier: ${paths.join(", ")}`);
}

test(
  "A-STO-10 cross-process lock prevents loss and releases after every failure",
  { timeout: 30000 },
  async (t) => {
    await ensureCaseTemp();
    const moduleUrl = process.env.KNORVIA_TEST_AUTH_MODULE_URL;
    const filePath = caseTemp("concurrency", "credentials.json");
    const startPath = caseTemp("concurrency", "start.signal");
    const readyA = caseTemp("concurrency", "worker-a.ready");
    const readyB = caseTemp("concurrency", "worker-b.ready");
    await writeJson(filePath, { seed: "worker:seed-value" });
    const rounds = 12;
    let workers;
    try {
      workers = [
        launchWorker([moduleUrl, filePath, "alpha", String(rounds), readyA, startPath]),
        launchWorker([moduleUrl, filePath, "beta", String(rounds), readyB, startPath]),
      ];
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "EACCES") {
        t.skip(`infrastructure cannot create Node worker processes: ${error.code}`);
        return;
      }
      throw error;
    }
    await waitForFiles([readyA, readyB]);
    await writeFile(startPath, "go", "utf8");
    let results;
    try {
      results = await Promise.all(workers);
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "EACCES") {
        t.skip(`infrastructure cannot create Node worker processes: ${error.code}`);
        return;
      }
      throw error;
    }
    for (const result of results) {
      process.stdout.write(`${JSON.stringify({ workerResult: result })}\n`);
      assert.equal(result.code, 0, result.stderr || result.stdout);
      assert.equal(result.signal, null);
      const summary = JSON.parse(result.stdout.trim());
      assert.equal(summary.assertions, rounds);
    }
    const durable = await readJson(filePath);
    assert.equal(durable.seed, "worker:seed-value");
    for (const prefix of ["alpha", "beta"]) {
      for (let index = 0; index < rounds; index += 1) {
        assert.equal(durable[`${prefix}-${index}`], `worker:${prefix}-value-${index}`);
      }
    }

    const { createSharedKnorviaCredentialStore } = await authModule();
    const store = createSharedKnorviaCredentialStore({
      filePath,
      cipher: identityCipher(),
      env: {},
    });
    await writeJson(filePath, { bad: "not-owned" });
    await assert.rejects(store.deleteIfValue("bad", "value"), /owned cipher rejected/);
    await access(`${filePath}.knorvia-test-lock`).then(
      () => assert.fail("lock remained after decrypt failure"),
      (error) => assert.equal(error.code, "ENOENT"),
    );
    await store.save("after-decrypt-failure", "ok");

    resetPersistenceState();
    failNextWrite();
    await assert.rejects(store.save("write-failure", "value"), /owned atomic write failure/);
    await access(`${filePath}.knorvia-test-lock`).then(
      () => assert.fail("lock remained after write failure"),
      (error) => assert.equal(error.code, "ENOENT"),
    );
    await store.save("after-write-failure", "ok");
    const names = await readdir(path.dirname(filePath));
    assert.equal(
      names.some((name) => name.endsWith(".tmp")),
      false,
    );
  },
);
