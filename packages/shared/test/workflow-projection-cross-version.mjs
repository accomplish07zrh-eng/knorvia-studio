// Optional bounded review with an externally retained baseline; Apache obligations remain.
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";

const position = process.argv.indexOf("--baseline");
assert.ok(position >= 0 && process.argv[position + 1], "Supply --baseline <old-shared-dist>");
const oldRoot = new URL(
  "protocol-v4/",
  pathToFileURL(`${process.argv[position + 1].replace(/[\\/]$/, "")}/`),
);
const newRoot = new URL("../dist/protocol-v4/", import.meta.url);
const files = [
  "workflow-runs-concurrency.js",
  "workflow-runs-phases.js",
  "workflow-runs-node-progress.js",
];
async function load(root) {
  return Object.assign(
    {},
    ...(await Promise.all(
      [...files, "workflow-runs-reducer.js"].map((name) => import(new URL(name, root))),
    )),
  );
}
const [oldApi, newApi] = await Promise.all([load(oldRoot), load(newRoot)]);
const json = (value) =>
  value === undefined ? { undefined: true } : JSON.parse(JSON.stringify(value));
let count = 0,
  seed = 0x776f726b;
function pick(items) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return items[seed % items.length];
}
function compare(call, label) {
  assert.deepEqual(json(call(newApi)), json(call(oldApi)), label);
  count++;
}
const node = {
  siteId: "fixture-site",
  ordinal: 1,
  phase: "executing",
  instructionsHead: "synthetic task",
  turn: 9,
  toolCalls: 40,
  lastTool: { name: "FixtureTool" },
};
const numbers = [
  undefined,
  null,
  0,
  -0,
  -1,
  1,
  2.5,
  8,
  1024,
  1025,
  NaN,
  Infinity,
  Number.MAX_SAFE_INTEGER + 1,
];
const text = [undefined, "", " ", "first", "x".repeat(257), "😀".repeat(130), 1];
function run(extra = {}) {
  return {
    runId: "fixture-run",
    status: "running",
    usage: { spentTokens: 0, nodesUsed: 0 },
    actors: [],
    nodes: [node],
    lastEventSequence: 0,
    ...extra,
  };
}
for (let sample = 0; sample < 800; sample++) {
  const base = run({
    concurrency: { key: "old-key", cap: 2, ceiling: 16, limit: 3, cooldownMs: 100 },
    phases: [
      { name: "first", rounds: pick(numbers) },
      { name: "second", rounds: 2 },
    ],
  });
  const bucket = {
    next: pick(numbers),
    previous: pick(numbers),
    key: pick(text),
    cooldownMs: pick(numbers),
    reason: pick(["idle_reset", "limited", undefined]),
  };
  compare((api) => {
    const result = api.reduceConcurrencyChanged(base, bucket);
    return { result, bytes: JSON.stringify(result), sameRun: result === base };
  }, `bucket-${sample}`);
  const start = { caps: { maxConcurrency: pick(numbers) }, concurrencyCeiling: pick(numbers) };
  compare((api) => {
    const result = api.reduceRunStartedConcurrency(base, start);
    return { result, bytes: JSON.stringify(result), sameRun: result === base };
  }, `start-${sample}`);
  const phase = { name: pick(text), ordinal: pick(numbers) };
  compare((api) => {
    const result = api.reducePhaseEntered(base, phase);
    return { result, samePhases: result.phases === base.phases };
  }, `phase-${sample}`);
  const launch = {
    phaseNames: [pick(text), pick(text), pick(text)],
    phaseAlongside: [
      [pick(numbers), pick(numbers)],
      [pick(numbers)],
      [pick(numbers), pick(numbers)],
    ],
  };
  compare((api) => api.reduceRunLaunched(base, launch), `launch-${sample}`);
  const eventType = pick(["node-queued", "node-settled", "node-waiting", "node-executing"]);
  const payload = {
    cached: pick([true, false, undefined]),
    instructionsHead: pick(text),
    turn: pick(numbers),
    toolCalls: pick(numbers),
    lastTool: { name: pick(text), target: pick(text) },
  };
  compare((api) => api.carryNodeProgress(eventType, payload, node), `carry-${sample}`);
  compare(
    (api) => api.reduceNodeProgress(base, { siteId: "fixture-site", ordinal: 1 }, payload),
    `progress-${sample}`,
  );
}

let oldState, newState;
for (let sequence = 1; sequence <= 400; sequence++) {
  const eventType = pick([
    "run-started",
    "run-launched",
    "phase-entered",
    "concurrency-changed",
    "node-queued",
    "node-progress",
    "node-waiting",
    "node-settled",
  ]);
  const payload = {
    caps: { maxConcurrency: pick([1, 3, 16]) },
    concurrencyCeiling: 16,
    phaseNames: ["first", "second"],
    phaseAlongside: [[1], [0]],
    name: pick(["first", "second"]),
    ordinal: pick([1, 2, 3]),
    previous: 16,
    next: pick([1, 2, 4]),
    cooldownMs: 100,
    instance: { siteId: "fixture-site", ordinal: 1 },
    instructionsHead: "synthetic task",
    turn: pick([1, 2, 3]),
    toolCalls: pick([0, 1, 4]),
    cached: pick([true, false]),
  };
  const envelope = { runId: "fixture-run", sequence, eventType, payload };
  oldState = oldApi.reduceWorkflowRunsState(oldState, envelope) ?? oldState;
  newState = newApi.reduceWorkflowRunsState(newState, envelope) ?? newState;
  assert.equal(JSON.stringify(newState), JSON.stringify(oldState), `trace-${sequence}`);
}

async function browser(root) {
  const bundled = await build({
    stdin: {
      contents: files
        .map((file) => `export * from ${JSON.stringify(fileURLToPath(new URL(file, root)))};`)
        .join("\n"),
      resolveDir: fileURLToPath(root),
      loader: "js",
    },
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "workflowHelpers",
    write: false,
  });
  const context = {};
  runInNewContext(bundled.outputFiles[0].text, context);
  assert.equal(
    runInNewContext("typeof Buffer + ':' + typeof process", context),
    "undefined:undefined",
  );
  return context.workflowHelpers;
}
const [oldBrowser, newBrowser] = await Promise.all([browser(oldRoot), browser(newRoot)]);
const checks = [
  (api) => api.reduceConcurrencyChanged(run(), { next: 3, previous: 16, cooldownMs: 0 }),
  (api) =>
    api.reduceRunStartedConcurrency(run(), { caps: { maxConcurrency: 1 }, concurrencyCeiling: 16 }),
  (api) =>
    api.reduceRunLaunched(run(), {
      phaseNames: ["first", "second"],
      phaseAlongside: [
        [1, 1],
        [-0, 0],
      ],
    }),
  (api) =>
    api.reducePhaseEntered(run({ phases: [{ name: "first", rounds: NaN }] }), {
      name: "first",
      ordinal: 2,
    }),
  (api) => api.carryNodeProgress("node-settled", { cached: true }, node),
  (api) =>
    api.reduceNodeProgress(
      run(),
      { siteId: "fixture-site", ordinal: 1 },
      { turn: 1, lastTool: { name: "😀".repeat(33), target: "x".repeat(121) } },
    ),
];
for (const [index, call] of checks.entries()) {
  assert.deepEqual(json(call(newBrowser)), json(call(oldBrowser)), `browser-${index}`);
  assert.deepEqual(json(call(newBrowser)), json(call(newApi)), `browser-node-${index}`);
}
console.log(
  JSON.stringify({
    helperComparisons: count,
    publicReducerEvents: 400,
    browserBoundaryCases: checks.length,
    nodeGlobalsAbsent: true,
  }),
);
