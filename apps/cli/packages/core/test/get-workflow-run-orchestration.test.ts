import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { archive } from "./workflow-run-summary-fixture.js";
import {
  baseline,
  entry,
  rowCases,
  observe,
  sha,
} from "./get-workflow-run-orchestration-fixture.js";
const gold = JSON.parse(
  await readFile(
    new URL("./get-workflow-run-orchestration-contract.json", import.meta.url),
    "utf8",
  ),
);
test("GetWorkflowRun orchestration frozen nested admission/read/native-method contracts", async () => {
  assert.equal(archive.consumer.sourceSha256, gold.baselineSourceSha256);
  assert.equal(archive.consumer.compiledSha256, gold.baselineEmittedSha256);
  for (const [i, kind] of rowCases.entries()) {
    const old = await observe(kind, baseline);
    assert.equal(sha(JSON.stringify(old)), gold.direct[i], `baseline:${kind}`);
    assert.deepEqual(await observe(kind), old, `current:${kind}`);
    assert.equal(old.calls, 1);
    assert.equal(old.clocks, 1);
  }
});
test("GetWorkflowRun orchestration immediate full call-runner valid/malformed field consumers", async () => {
  for (const [i, kind] of gold.executorCases.entries()) {
    const old = await observe(kind, baseline, true);
    assert.equal(sha(JSON.stringify(old)), gold.executor[i], `baseline:${kind}`);
    assert.deepEqual(await observe(kind, entry, true), old, `current:${kind}`);
    assert.equal(old.calls, 1);
  }
});
