// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testRoot, "../../../../..");
const runner = path.join(testRoot, "auth-runtime-contract/run-group.mjs");
const CHILD_TIMEOUT_MS = 260_000;

for (const mode of ["source", "dist"] as const) {
  test(
    `auth runtime contract: ${mode}`,
    { timeout: 270_000, concurrency: false },
    async (context) => {
      const tempRoot = await realpath(tmpdir());
      const evidenceRoot = await mkdtemp(path.join(tempRoot, `knorvia-auth-${mode}-`));
      const result = await new Promise<{
        code: number | null;
        signal: NodeJS.Signals | null;
        timedOut: boolean;
      }>((resolve, reject) => {
        const environment: NodeJS.ProcessEnv = {};
        for (const key of ["SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "TEMP", "TMP", "TMPDIR"]) {
          if (process.env[key]) environment[key] = process.env[key];
        }
        const child = spawn(process.execPath, [runner, mode, repositoryRoot, evidenceRoot], {
          cwd: repositoryRoot,
          env: environment,
          windowsHide: true,
          shell: false,
          stdio: "inherit",
        });
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill();
        }, CHILD_TIMEOUT_MS);
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("close", (code, signal) => {
          clearTimeout(timer);
          resolve({ code, signal, timedOut });
        });
      });
      assert.equal(result.timedOut, false, `Auth group timed out; evidence: ${evidenceRoot}`);
      assert.equal(result.signal, null, `Auth group ended by signal; evidence: ${evidenceRoot}`);
      assert.equal(result.code, 0, `Auth group failed; evidence: ${evidenceRoot}`);
      const report = JSON.parse(await readFile(path.join(evidenceRoot, "summary.json"), "utf8"));
      assert.equal(report.cases, 30);
      assert.equal(report.passed, 30);
      assert.equal(report.failed, 0);
      context.diagnostic(`${mode}: 30/30 auth cases, strict declarations and owned graph checked`);
      const relative = path.relative(tempRoot, await realpath(evidenceRoot));
      assert.ok(
        relative &&
          relative !== ".." &&
          !relative.startsWith(`..${path.sep}`) &&
          !path.isAbsolute(relative),
      );
      await rm(evidenceRoot, { recursive: true, force: true });
    },
  );
}
