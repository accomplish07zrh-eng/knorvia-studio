// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { authModule, caseTemp, ensureCaseTemp } from "../harness/test-context.mjs";

test(
  "A-STO-12 synchronous load suppresses every failure and preserves nonblank whitespace",
  { timeout: 7000 },
  async () => {
    await ensureCaseTemp();
    const { loadSharedKnorviaCredentialSync: loadSync } = await authModule();
    const filePath = caseTemp("sync", "credentials.json");
    const cipher = {
      decrypt(value) {
        if (value === "throw") throw new Error("owned sync decrypt failure");
        return value.startsWith("owned:") ? value.slice("owned:".length) : value;
      },
      encrypt(value) {
        return `owned:${value}`;
      },
    };
    const options = { filePath, cipher, env: {} };
    assert.equal(loadSync("key", options), undefined);
    await mkdir(path.dirname(filePath), { recursive: true });
    for (const content of ["{bad json", "[]", '{"key":42}', '{"other":"owned:value"}']) {
      await writeFile(filePath, content, "utf8");
      assert.equal(loadSync("key", options), undefined);
    }
    await writeFile(filePath, '{"key":"throw"}', "utf8");
    assert.equal(loadSync("key", options), undefined);
    await writeFile(filePath, '{"key":"owned:   "}', "utf8");
    assert.equal(loadSync("key", options), undefined);
    await writeFile(filePath, '{"key":"owned:  value  "}', "utf8");
    assert.equal(loadSync(" key ", options), "  value  ");
    assert.equal(loadSync(" ", options), undefined);

    const directoryPath = caseTemp("sync", "directory");
    await mkdir(directoryPath, { recursive: true });
    assert.equal(loadSync("key", { filePath: directoryPath, cipher, env: {} }), undefined);
  },
);
