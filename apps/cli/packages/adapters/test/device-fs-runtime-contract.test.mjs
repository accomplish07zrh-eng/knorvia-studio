// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { checkTextApi } from "./device-fs-contract/api.mjs";

const adapterRoot = fileURLToPath(new URL("../", import.meta.url));
const EXPECTED_CASES = 191;
const suites = ["metadata", "range", "consumers", "skipped-line"];
for (const mode of ["source", "dist"]) {
  test(`device/fs text slice frozen contract: ${mode}`, { timeout: 60000 }, async (context) => {
    const root = join(adapterRoot, mode === "source" ? "src" : "dist");
    await checkTextApi(root, mode);
    const env = { KNORVIA_DEVICE_FS_CONTRACT_ROOT: root, KNORVIA_DEVICE_FS_CONTRACT_MODE: mode };
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
          "--test-timeout=15000",
          "--test-reporter=tap",
          ...suites.map((name) => join(adapterRoot, "test/device-fs-contract", name + ".test.mjs")),
        ],
        {
          cwd: adapterRoot,
          env,
          shell: false,
          windowsHide: true,
          signal: context.signal,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      for (const stream of [child.stdout, child.stderr])
        stream.on("data", (chunk) => {
          output += chunk;
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
      `${mode}: ${EXPECTED_CASES}/${EXPECTED_CASES}; 186 frozen boundaries, four real consumer cases, one retained-heap regression`,
    );
  });
}
