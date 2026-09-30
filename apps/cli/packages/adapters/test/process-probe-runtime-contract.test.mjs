// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkApi } from "./process-probe-contract/api.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const suites = ["shared", "platform-parsers", "parser-matrix", "linux", "factory", "callers"];
const EXPECTED_CASES = 50;

for (const mode of ["source", "dist"]) {
  test(`process probe frozen runtime contract: ${mode}`, { timeout: 60000 }, async (context) => {
    const target = join(root, mode === "source" ? "src" : "dist", "device");
    await checkApi(target, mode);
    const env = {
      KNORVIA_PROCESS_PROBE_CONTRACT_ROOT: target,
      KNORVIA_PROCESS_PROBE_CONTRACT_MODE: mode,
    };
    for (const key of ["SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "TEMP", "TMP", "TMPDIR"])
      if (process.env[key]) env[key] = process.env[key];
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          "--test",
          "--test-concurrency=1",
          "--test-timeout=10000",
          "--test-reporter=tap",
          ...suites.map((name) => join(root, "test/process-probe-contract", `${name}.test.mjs`)),
        ],
        {
          cwd: root,
          env,
          shell: false,
          windowsHide: true,
          signal: context.signal,
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
    assert.equal(
      Number(/\n# tests (\d+)\s/.exec(result.output)?.[1]),
      EXPECTED_CASES,
      result.output,
    );
    assert.match(result.output, new RegExp(`\\n# pass ${EXPECTED_CASES}\\s`));
    assert.match(result.output, /\n# fail 0\s/);
    context.diagnostic(
      `${mode}: ${EXPECTED_CASES}/${EXPECTED_CASES}; 53 fixed parser inputs; native fs/exec and target timers sealed`,
    );
  });
}
