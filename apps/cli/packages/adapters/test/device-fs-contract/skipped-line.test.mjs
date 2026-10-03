// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("range scanner retains no skipped 64MiB line", { timeout: 15000 }, async (context) => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--expose-gc",
        "--import",
        "tsx",
        fileURLToPath(new URL("./skipped-line-probe.mjs", import.meta.url)),
      ],
      {
        env: process.env,
        signal: context.signal,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "",
      errors = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      errors += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, output, errors }));
  });
  assert.equal(result.signal, null, result.errors);
  assert.equal(result.code, 0, result.errors);
  const { extraHeap, ...value } = JSON.parse(result.output);
  assert.deepEqual(value, {
    content: "",
    lineCount: 0,
    totalLines: 1,
    bytesRead: 67108864,
    sizeBytes: 67108864,
    lineEndings: "LF",
  });
  assert.ok(extraHeap < 32 * 1024 * 1024, `Skipped line used ${extraHeap} extra heap bytes`);
  context.diagnostic(`Controlled skipped line extra heap: ${extraHeap} bytes`);
});
