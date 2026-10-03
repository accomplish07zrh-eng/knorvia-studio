import assert from "node:assert/strict";
import test from "node:test";
import { defaultWorkspaceFileSearchFilter as filter } from "../src/file/workspaceFileMentionFilter.js";

test("synthetic ignore activation and hidden traversal retain permission decisions", () => {
  const directory = {
    name: "NODE_MODULES",
    path: "/synthetic/NODE_MODULES",
    relativePath: "NODE_MODULES",
    type: "directory" as const,
  };
  assert.deepEqual(filter.evaluate(directory), { include: false, traverse: false });
  assert.deepEqual(filter.evaluate(directory, { ignoreRulesActive: true }), {
    include: true,
    traverse: true,
  });
  assert.deepEqual(directory, {
    name: "NODE_MODULES",
    path: "/synthetic/NODE_MODULES",
    relativePath: "NODE_MODULES",
    type: "directory",
  });
  assert.deepEqual(filter.evaluate({ ...directory, name: ".github", relativePath: ".github" }), {
    include: false,
    traverse: true,
  });
  assert.deepEqual(
    filter.evaluate({ ...directory, name: "workflows", relativePath: ".github/workflows" }),
    { include: false, traverse: true },
  );
  assert.deepEqual(
    filter.evaluate({ ...directory, name: "cmake-build-debug", relativePath: "cmake-build-debug" }),
    { include: false, traverse: false },
  );
  const file = { ...directory, type: "file" as const };
  for (const name of [".ENV", ".env.local", "module.SO", "LCOV.INFO"]) {
    assert.deepEqual(filter.evaluate({ ...file, name }, { ignoreRulesActive: true }), {
      include: false,
      traverse: false,
    });
  }
  assert.deepEqual(
    filter.evaluate({ ...file, name: "workflow.yml", relativePath: ".github/workflow.yml" }),
    { include: true, traverse: false },
  );
  assert.deepEqual(filter.evaluate({ ...file, name: "env.example", relativePath: "env.example" }), {
    include: true,
    traverse: false,
  });
});
