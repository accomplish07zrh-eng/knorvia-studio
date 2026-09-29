// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { bindTarget } from "../src/harness/target-binder.js";
import { createSandbox, writeText } from "./support/fixtures.js";

test("BOUND-01: closed binder rejects unknown packages and relative escapes, then receipts a real companion", async (context) => {
  const sandbox = createSandbox(context);
  const fakeTarget = join(sandbox.plugins, "fake-target");
  const artifactRoot = join(sandbox.root, "binder-artifacts");
  const priorBinding = process.env.KNORVIA_PLUGIN_DISCOVERY_BINDING;
  const priorRoot = process.env.KNORVIA_PLUGIN_DISCOVERY_CANDIDATE_ROOT;
  const priorArtifacts = process.env.KNORVIA_PLUGIN_DISCOVERY_ARTIFACT_DIR;
  process.env.KNORVIA_PLUGIN_DISCOVERY_BINDING = "candidate";
  process.env.KNORVIA_PLUGIN_DISCOVERY_CANDIDATE_ROOT = fakeTarget;
  process.env.KNORVIA_PLUGIN_DISCOVERY_ARTIFACT_DIR = artifactRoot;
  context.after(() => {
    if (priorBinding === undefined) delete process.env.KNORVIA_PLUGIN_DISCOVERY_BINDING;
    else process.env.KNORVIA_PLUGIN_DISCOVERY_BINDING = priorBinding;
    if (priorRoot === undefined) delete process.env.KNORVIA_PLUGIN_DISCOVERY_CANDIDATE_ROOT;
    else process.env.KNORVIA_PLUGIN_DISCOVERY_CANDIDATE_ROOT = priorRoot;
    if (priorArtifacts === undefined) delete process.env.KNORVIA_PLUGIN_DISCOVERY_ARTIFACT_DIR;
    else process.env.KNORVIA_PLUGIN_DISCOVERY_ARTIFACT_DIR = priorArtifacts;
  });

  writeText(
    join(fakeTarget, "index.ts"),
    'import "undeclared-package"; export const marker = 1;\n',
  );
  await assert.rejects(bindTarget("index"), /Closed loader rejected undeclared import/u);

  writeText(join(sandbox.plugins, "escape.ts"), "export const escaped = true;\n");
  writeText(join(fakeTarget, "index.ts"), 'export { escaped } from "../escape.js";\n');
  await assert.rejects(bindTarget("index"), /escapes selected root/u);

  writeText(join(fakeTarget, "companion.ts"), "export const companion = 42;\n");
  writeText(join(fakeTarget, "index.ts"), 'export { companion } from "./companion.js";\n');
  const bound = await bindTarget("index");
  assert.equal(bound.exports.companion, 42);
  assert.match(await readFile(bound.receiptPath, "utf8"), /companion\.ts/u);
});
