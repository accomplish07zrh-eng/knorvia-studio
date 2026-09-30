// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { authModule, caseTemp, ensureCaseTemp, publicFacts } from "../harness/test-context.mjs";

function suffix(base, facts) {
  return path.join(base, ...facts.store.suffix);
}

test(
  "A-STO-01 path resolution freezes precedence, tilde rules, and Knorvia namespace",
  { timeout: 5000 },
  async () => {
    await ensureCaseTemp();
    const { resolveSharedKnorviaCredentialsPath: resolve } = await authModule();
    const facts = await publicFacts();
    const cwd = process.cwd();
    const home = process.env.KNORVIA_TEST_FAKE_HOME;
    const explicitBase = caseTemp("explicit-base");
    const envBase = caseTemp("env-base");
    const explicitFile = caseTemp("explicit", "credentials.fixture.json");
    assert.equal(
      resolve({ filePath: explicitFile, baseDir: "ignored" }),
      path.resolve(explicitFile),
    );
    assert.equal(
      resolve({ filePath: "relative/credentials.json" }),
      path.resolve(cwd, "relative/credentials.json"),
    );
    assert.equal(resolve({ filePath: "~" }), path.resolve(home));
    assert.equal(
      resolve({ filePath: "~/nested/credentials.json" }),
      path.resolve(home, "nested/credentials.json"),
    );
    assert.equal(
      resolve({ filePath: "~other/credentials.json" }),
      path.resolve(cwd, "~other/credentials.json"),
    );
    assert.equal(
      resolve({ baseDir: explicitBase, env: { KNORVIA_DATA_BASE_DIR: envBase } }),
      suffix(explicitBase, facts),
    );
    assert.equal(resolve({ env: { KNORVIA_DATA_BASE_DIR: envBase } }), suffix(envBase, facts));
    assert.equal(resolve({ env: {} }), suffix(home, facts));
    assert.equal(resolve({ filePath: "", baseDir: explicitBase }), suffix(explicitBase, facts));
    assert.equal(
      resolve({ baseDir: "", env: { KNORVIA_DATA_BASE_DIR: envBase } }),
      suffix(cwd, facts),
    );
    assert.equal(resolve({ env: { KNORVIA_DATA_BASE_DIR: "" } }), suffix(cwd, facts));
    assert.equal(
      resolve({ baseDir: "relative-base", env: {} }),
      suffix(path.resolve(cwd, "relative-base"), facts),
    );
    assert.equal(resolve({ baseDir: "~", env: {} }), suffix(home, facts));
    assert.equal(resolve({ baseDir: "~/base", env: {} }), suffix(path.join(home, "base"), facts));

    const originalDataBase = process.env.KNORVIA_DATA_BASE_DIR;
    process.env.KNORVIA_DATA_BASE_DIR = caseTemp("must-not-merge");
    try {
      assert.equal(resolve({ env: {} }), suffix(home, facts));
    } finally {
      if (originalDataBase === undefined) delete process.env.KNORVIA_DATA_BASE_DIR;
      else process.env.KNORVIA_DATA_BASE_DIR = originalDataBase;
    }
    assert.equal(
      resolve({ env: { ZCODE_DATA_BASE_DIR: caseTemp("forbidden-zcode") } }),
      suffix(home, facts),
    );
    assert.equal(resolve({ env: {} }).includes(".zcode"), false);
  },
);

test(
  "A-STO-02 constructed store exposes resolved path and honors injected dependencies",
  { timeout: 5000 },
  async () => {
    await ensureCaseTemp();
    const { createSharedKnorviaCredentialStore } = await authModule();
    const baseDir = caseTemp("store-base");
    const cipherCalls = [];
    const cipher = {
      decrypt(value) {
        cipherCalls.push(["decrypt", value]);
        return value.slice("custom:".length);
      },
      encrypt(value) {
        cipherCalls.push(["encrypt", value]);
        return `custom:${value}`;
      },
    };
    const store = createSharedKnorviaCredentialStore({
      cipher,
      env: { KNORVIA_DATA_BASE_DIR: caseTemp("ignored-env") },
      baseDir,
    });
    assert.equal(store.filePath, path.join(baseDir, ".knorvia-studio", "v2", "credentials.json"));
    await store.save(" fixture ", "value");
    assert.deepEqual(cipherCalls, [["encrypt", "value"]]);
    const durable = JSON.parse(await readFile(store.filePath, "utf8"));
    assert.deepEqual(durable, { fixture: "custom:value" });
    assert.equal(await store.load("fixture"), "value");
    assert.deepEqual(cipherCalls.at(-1), ["decrypt", "custom:value"]);
  },
);
