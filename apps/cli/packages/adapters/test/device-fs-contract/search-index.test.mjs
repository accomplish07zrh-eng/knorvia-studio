// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
test(
  "multiline search locates 10000 match lines without rescanning every prefix",
  { timeout: 15000 },
  async (context) => {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", fileURLToPath(new URL("./search-index-probe.mjs", import.meta.url))],
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
      child.stdout.on("data", (c) => {
        output += c;
      });
      child.stderr.on("data", (c) => {
        errors += c;
      });
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal, output, errors }));
    });
    assert.equal(result.signal, null, result.errors);
    assert.equal(result.code, 0, result.errors);
    const value = JSON.parse(result.output);
    assert.equal(value.numMatches, 10000);
    assert.equal(value.entries, 10000);
    assert.equal(value.first.lineNumber, 1);
    assert.equal(value.last.lineNumber, 10000);
    assert.equal(value.first.text, "hit");
    assert.equal(value.last.text, "hit");
    assert.ok(
      value.probes <= value.length + 2 * value.numMatches,
      `${value.probes} character/line lookups exceeded linear construction plus match budget`,
    );
    context.diagnostic(`multiline indexed search probes: ${value.probes}`);
  },
);
