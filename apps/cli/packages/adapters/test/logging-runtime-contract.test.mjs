// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkLoggingApi } from "./logging-runtime-contract/check-api.mjs";

const testRoot = fileURLToPath(new URL("./logging-runtime-contract/", import.meta.url));
const adapterRoot = fileURLToPath(new URL("../", import.meta.url));
const modeOverride = process.env.KNORVIA_LOGGING_CONTRACT_TEST_MODE;
const EXPECTED_CASES = 51;

for (const mode of modeOverride ? [modeOverride] : ["source", "dist"]) {
  assert.ok(mode === "source" || mode === "dist", "Invalid logging target mode");
  test(`logging runtime contract: ${mode}`, { timeout: 90_000 }, async (context) => {
    checkLoggingApi(mode, adapterRoot);
    const dataRoot = await mkdtemp(join(tmpdir(), "knorvia-logging-group-"));
    context.after(() => rm(dataRoot, { recursive: true, force: true }));
    const environment = {
      KNORVIA_ENV: "test",
      KNORVIA_DATA_BASE_DIR: dataRoot,
      KNORVIA_LOGGING_CONTRACT_MODE: mode,
      KNORVIA_LOGGING_CONTRACT_ROOT: join(
        adapterRoot,
        mode === "source" ? "src" : "dist",
        "logging",
      ),
    };
    for (const key of ["SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "TEMP", "TMP", "TMPDIR"]) {
      if (process.env[key]) environment[key] = process.env[key];
    }
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--experimental-test-module-mocks",
          "--import",
          "tsx",
          "--test",
          "--test-concurrency=1",
          "--test-timeout=60_000",
          "--test-reporter=tap",
          ...["serialization", "retention", "logger-output", "logger-factory", "edges"].map(
            (name) => join(testRoot, `${name}.test.mjs`),
          ),
        ],
        {
          cwd: adapterRoot,
          env: environment,
          signal: context.signal,
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      for (const port of [child.stdout, child.stderr])
        port.on("data", (chunk) => {
          output += chunk.toString();
        });
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal, output }));
    });
    assert.equal(result.signal, null, result.output);
    assert.equal(result.code, 0, result.output);
    const count = Number(/\n# tests (\d+)\s/.exec(result.output)?.[1]);
    assert.equal(count, EXPECTED_CASES, result.output);
    assert.match(result.output, new RegExp(`\\n# pass ${EXPECTED_CASES}\\s`));
    assert.match(result.output, /\n# fail 0\s/);
    context.diagnostic(`${mode}: ${EXPECTED_CASES}/${EXPECTED_CASES} frozen logging cases`);
  });
}
