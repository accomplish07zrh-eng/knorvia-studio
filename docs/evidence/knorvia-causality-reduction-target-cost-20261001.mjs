import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  baseline,
  current,
} from "../../apps/cli/packages/core/test/causality-reduction-fixture.ts";
import { loadTargetBaseline } from "../../apps/cli/packages/core/test/causality-reduction-target-fixture.ts";

const archive = await loadTargetBaseline();
const before = await import(
  `data:text/javascript;base64,${Buffer.from(archive.compiled).toString("base64")}`
);
const implementations = { original: baseline, before, after: current };
const n = 100;
const chain = () =>
  Array.from({ length: n - 1 }, (_, i) => ({ from: String(i), to: String(i + 1), kind: "seq" }));
const recipes = {
  chain,
  "chain+skip": () => [
    ...chain(),
    ...Array.from({ length: n - 2 }, (_, i) => ({
      from: String(i),
      to: String(i + 2),
      kind: "seq",
    })),
  ],
  "dense-DAG": () => {
    const edges = [];
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) edges.push({ from: String(i), to: String(j), kind: "seq" });
    return edges;
  },
  "chain+return-carries": () => [
    ...chain(),
    ...Array.from({ length: n }, (_, i) => ({
      from: String(i),
      to: "0",
      kind: "carry",
      carryOf: "seq",
    })),
  ],
};
const results = [];
for (const [recipe, make] of Object.entries(recipes)) {
  const timings = Object.fromEntries(Object.keys(implementations).map((name) => [name, []]));
  let expectedIndices, expectedEdges;
  for (let round = -1; round < 5; round++) {
    const entries = Object.entries(implementations);
    if (round >= 0 && round % 2) entries.reverse();
    for (const [name, selected] of entries) {
      const input = make();
      const started = performance.now();
      const output = selected.reduceOrdering(input);
      const duration = performance.now() - started;
      const indices = output.map((edge, index) => {
        const position = input.indexOf(edge);
        assert.ok(position >= 0, `${recipe}/${name}/${index}: original reference`);
        assert.strictEqual(edge, input[position]);
        return position;
      });
      for (let i = 1; i < indices.length; i++)
        assert.ok(indices[i - 1] < indices[i], `${recipe}/${name}: input order`);
      expectedIndices ??= indices;
      expectedEdges ??= output;
      assert.deepEqual(indices, expectedIndices, `${recipe}/${name}: ordered identities`);
      assert.deepEqual(output, expectedEdges, `${recipe}/${name}: ordered values`);
      if (round >= 0) timings[name].push(duration);
    }
  }
  const mediansMs = Object.fromEntries(
    Object.entries(timings).map(([name, values]) => [name, [...values].sort((a, b) => a - b)[2]]),
  );
  results.push({
    recipe,
    inputEdges: make().length,
    outputEdges: expectedIndices.length,
    mediansMs,
    samplesMs: timings,
  });
}
const report = {
  n,
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  warmupsPerImplementationRecipe: 1,
  measuredCallsPerImplementationRecipe: 5,
  clock: "performance.now; graph construction and identity/value assertions outside timing",
  baselineCommit: archive.commit,
  beforeSourceSha256: archive.sourceSha256,
  beforeEmittedSha256: archive.emittedSha256,
  mode: process.env.KNORVIA_WORKFLOW_RUN_SUMMARY_TEST_EMITTED === "1" ? "actual-emitted" : "source",
  identityOrderValueChecks: "all 72 outputs; fresh ordinary edge objects for every call",
  interpretation:
    "Environment-dependent diagnostic with no pass/fail timing threshold; display caps are after reduction",
  results,
};
await writeFile(
  new URL("./knorvia-causality-reduction-target-cost-20261001.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    n,
    mode: report.mode,
    results: results.map(({ recipe, mediansMs }) => ({ recipe, mediansMs })),
  }),
);
