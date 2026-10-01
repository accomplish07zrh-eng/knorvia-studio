import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { emitted, sha } from "./workflow-run-summary-fixture.js";
import {
  analysis,
  bounds,
  current,
  oldBounds,
  oldAnalysis,
  archive,
  project,
} from "./create-workflow-graph-fold-fixture.js";
import {
  currentGraphUrl,
  historicalAnalysisBytes,
  historicalBoundsBytes,
  loadCurrentGraph,
} from "./create-workflow-graph-loader-fixture.js";

test("graph loader keeps exact historical bytes and imports the current supported namespace", async () => {
  assert.equal(sha(historicalBoundsBytes()), archive.boundsSha256);
  assert.equal(sha(historicalAnalysisBytes()), archive.analysisSha256);
  for (const [role, namespace] of [
    ["fold", current],
    ["bounds", bounds],
    ["analysis", analysis],
  ] as const) {
    const url = currentGraphUrl(role);
    assert.ok(url.pathname.endsWith(`.${emitted ? "js" : "ts"}`));
    assert.ok(url.pathname.includes(emitted ? "/dist/" : "/src/"));
    assert.equal(namespace, await import(url.href));
    assert.equal(namespace, await loadCurrentGraph(role));
  }
  assert.notEqual(bounds.boundCausalityGraph, oldBounds.boundCausalityGraph);
  assert.notEqual(analysis.boundGraphOfAnalysis, oldAnalysis.boundGraphOfAnalysis);
  assert.deepEqual(project("cycle", analysis), project("cycle", oldAnalysis));
});
test("current graph callers fail closed for missing and corrupted closure artifacts", async () => {
  for (const module of [
    "create-workflow-graph-fold",
    "create-workflow-graph-bounds",
    "workflow-analysis-display",
  ]) {
    const failure = Object.assign(new Error("Synthetic missing graph artifact"), {
      code: "ENOENT",
    });
    let misses = 0;
    await assert.rejects(
      loadCurrentGraph("analysis", async (url) => {
        if (url.pathname.endsWith(`/dist/tool/handlers/${module}.js`)) {
          misses++;
          throw failure;
        }
        return readFile(url, "utf8");
      }),
      (error) => error === failure,
    );
    assert.equal(misses, 1);
    await assert.rejects(
      loadCurrentGraph("analysis", async (url) => {
        const bytes = await readFile(url, "utf8");
        return url.pathname.endsWith(`/dist/tool/handlers/${module}.js`)
          ? bytes + "\n// Synthetic corruption\n"
          : bytes;
      }),
      { name: "AssertionError" },
    );
  }
  // The historical oracle is stored separately and does not need current artifact reads.
  assert.equal(sha(historicalBoundsBytes()), archive.boundsSha256);
});
test("a valid historical bounds artifact cannot satisfy the strict current caller pin", async () => {
  let replacements = 0;
  await assert.rejects(
    loadCurrentGraph("analysis", async (url) => {
      if (url.pathname.endsWith("/dist/tool/handlers/create-workflow-graph-bounds.js")) {
        replacements++;
        return historicalBoundsBytes();
      }
      return readFile(url, "utf8");
    }),
    { name: "AssertionError" },
  );
  assert.equal(replacements, 1);
});
