// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// M0-10：合同契约测试发现与收集的契约测试。
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { collectStudioTests, discoverContractTestDirectories } from "./contract-test-discovery.mjs";

async function withRepo(files, run) {
  const root = mkdtempSync(join(tmpdir(), "knorvia-contract-tests-"));
  try {
    for (const [path, contents] of Object.entries(files)) {
      const target = join(root, path);
      mkdirSync(join(target, ".."), { recursive: true });
      if (contents !== null) writeFileSync(target, contents);
    }
    return await run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const contractTest = "import { test } from 'node:test';\ntest('contract', () => {});\n";

test("no contracts means an empty discovery and a normal test run", async () => {
  await withRepo({ "packages/shared/test/existing.test.mjs": contractTest }, async (root) => {
    const contractDirectories = await discoverContractTestDirectories(root);
    assert.deepEqual(contractDirectories, []);
    const { tests, directories } = await collectStudioTests({
      repoRoot: root,
      explicitTests: ["scripts/example.test.mjs"],
      testDirectories: ["packages/shared/test"],
      contractDirectories,
    });
    assert.deepEqual(tests, ["scripts/example.test.mjs", "packages/shared/test/existing.test.mjs"]);
    assert.deepEqual(directories, ["packages/shared/test"]);
  });
});

test("contract test directories are discovered in stable order", async () => {
  await withRepo(
    {
      "specs/contracts/core-tool-01/tests/behavior.test.ts": contractTest,
      "specs/contracts/core-hooks/tests/interface.test.mjs": contractTest,
      "specs/contracts/contracts-01/tests/deep/nested.test.mjs": contractTest,
      "specs/contracts/notes/README.md": "# notes\n",
      "specs/contracts/empty/tests/.gitkeep": "",
    },
    async (root) => {
      const directories = await discoverContractTestDirectories(root);
      assert.deepEqual(directories, [
        "specs/contracts/core-hooks/tests",
        "specs/contracts/core-tool-01/tests",
      ]);
      const collected = await collectStudioTests({
        repoRoot: root,
        explicitTests: [],
        testDirectories: [],
        contractDirectories: directories,
      });
      assert.deepEqual(collected.tests, [
        "specs/contracts/core-hooks/tests/interface.test.mjs",
        "specs/contracts/core-tool-01/tests/behavior.test.ts",
      ]);
      assert.deepEqual(collected.directories, directories);
    },
  );
});

test("an empty contract directory is skipped instead of failing the runner", async () => {
  await withRepo({ "specs/contracts/pending/tests/notes.txt": "todo\n" }, async (root) => {
    const directories = await discoverContractTestDirectories(root);
    assert.deepEqual(directories, []);
    const collected = await collectStudioTests({
      repoRoot: root,
      explicitTests: [],
      testDirectories: [],
      contractDirectories: directories,
    });
    assert.deepEqual(collected.tests, []);
  });
});

test("an empty non-contract directory stays a configuration error", async () => {
  await withRepo({ "packages/shared/test/.gitkeep": "" }, async (root) => {
    await assert.rejects(
      () =>
        collectStudioTests({
          repoRoot: root,
          explicitTests: [],
          testDirectories: ["packages/shared/test"],
          contractDirectories: [],
        }),
      /No offline studio tests found/,
    );
  });
});
