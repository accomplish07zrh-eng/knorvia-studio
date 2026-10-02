import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dynamic, sha } from "./causality-reduction-fixture.js";
export { sha };

const emitted = process.env.KNORVIA_WORKFLOW_RUN_SUMMARY_TEST_EMITTED === "1";
const root = new URL("../../dynamic-workflow/", import.meta.url);
const read = (url: URL) => readFile(url, "utf8");
export async function loadBaseline(readArchive = read) {
  const bytes = await readArchive(
    new URL("./may-set-lane-expansion-baseline.json", import.meta.url),
  );
  assert.equal(sha(bytes), "211a58a6d6737900ca4f6331992e8e8ce2e27e8739880a076d8e360c5d6a704b");
  const archive = JSON.parse(bytes);
  assert.equal(sha(archive.compiled), archive.emittedSha256);
  assert.equal(sha(archive.declaration), archive.declarationSha256);
  return archive;
}
export const archive = await loadBaseline();
const pins = JSON.parse(
  await read(new URL("./may-set-lane-expansion-current.json", import.meta.url)),
);
export async function loadCurrent(readArtifact = read) {
  for (const [p, hash] of [
    ["src/analysis/causality-graph-lanes.ts", pins.sourceSha256],
    ["dist/analysis/causality-graph-lanes.js", pins.emittedSha256],
    ["dist/analysis/causality-graph-lanes.d.ts", pins.declarationSha256],
  ])
    assert.equal(sha(await readArtifact(new URL(p, root))), hash, p);
  assert.equal(pins.declarationSha256, archive.declarationSha256);
  return dynamic("analysis/causality-graph-lanes");
}
export const current = await loadCurrent();

async function historical(name: string, code: string, overrides: Record<string, string> = {}) {
  const mapped = code.replace(/from "([^"]+)"/gu, (_match, p: string) => {
    const target =
      overrides[p] ??
      (p.startsWith(".")
        ? new URL(
            p.replace(/\.js$/u, emitted ? ".js" : ".ts"),
            new URL(`${emitted ? "dist" : "src"}/analysis/${name}.${emitted ? "js" : "ts"}`, root),
          ).href
        : import.meta.resolve(p));
    return `from ${JSON.stringify(target)}`;
  });
  return `data:text/javascript;base64,${Buffer.from(mapped).toString("base64")}`;
}
const oldUrl = await historical("causality-graph-lanes", archive.compiled);
export const baseline = await import(oldUrl);
async function oldConsumer(name: string, overrides: Record<string, string>) {
  const code = await read(new URL(`dist/analysis/${name}.js`, root));
  assert.equal(sha(code), archive.consumers[name], name);
  return historical(name, code, overrides);
}
const oldGraph = await oldConsumer("causality-graph", { "./causality-graph-lanes.js": oldUrl });
export const oldAnalyze = await import(
  await oldConsumer("analyze", { "./causality-graph.js": oldGraph })
);
export const analyze = await dynamic("analysis/analyze");
const projections = await dynamic("projections");

function step(id: string, lanes?: string[], extra: Record<string, unknown> = {}) {
  return {
    id,
    kind: "ask",
    label: id,
    lane: lanes?.[0] ?? "a",
    loc: { line: 1, column: 1 },
    region: "root",
    certainty: "always",
    ...(lanes === undefined ? {} : { lanes }),
    ...extra,
  };
}
function edge(from: string, to: string, kind = "seq", extra: Record<string, unknown> = {}) {
  return { from, to, kind, certainty: "always", ...extra };
}
function graph(steps: any[], edges: any[] = [], sink?: any): any {
  return {
    steps,
    edges,
    lanes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    regions: [{ id: "root", kind: "root" }],
    ...(sink === undefined ? {} : { sink }),
    extra: "owned extra",
  };
}
export const cases = [
  {
    name: "no-op-admission",
    make: () =>
      graph(
        [undefined, [], ["a"], ["a", "b", "c", "d", "e"], ["a", "workspace"], ["unknown", "b"]].map(
          (lanes, index) => step(String(index), lanes),
        ),
      ),
  },
  {
    name: "ordered-products",
    make: () =>
      graph(
        [
          step("x", ["a", "b"], { source: "old", extra: { owned: true } }),
          step("y", ["b", "c"]),
          step("u", undefined, { lane: "b" }),
          step("z", undefined, { certainty: "maybe" }),
        ],
        [
          edge("x", "y", "fifo"),
          edge("x", "y", "seq"),
          edge("y", "x", "data", { exact: true }),
          edge("x", "u", "control"),
          edge("x", "x", "carry", { carryOf: "seq" }),
          edge("u", "z"),
          edge("x", "missing"),
          edge("missing", "x", "fifo"),
        ],
        { fedBy: ["y", "x", "missing", "x"], extra: "sink extra" },
      ),
  },
  {
    name: "cap-four",
    make: () => graph([step("x", ["d", "c", "b", "a"])], [edge("x", "x", "carry")]),
  },
  {
    name: "duplicate-lanes",
    make: () => graph([step("x", ["a", "a"])], [edge("x", "x", "fifo")], { fedBy: ["x"] }),
  },
  {
    name: "last-eligible-duplicate",
    make: () =>
      graph([step("x", ["a", "b"]), step("x", ["c", "d"], { label: "last" })], [edge("x", "x")]),
  },
  {
    name: "ineligible-does-not-erase",
    make: () =>
      graph(
        [
          step("x", ["a", "b"]),
          step("x", ["workspace"], { label: "later" }),
          step("u", undefined, { lane: "a" }),
          step("u", undefined, { lane: "b" }),
        ],
        [edge("x", "u", "fifo")],
      ),
  },
];

function freeze(value: any) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
}
export function observe(selected: any, input: any) {
  const before = JSON.stringify(input);
  freeze(input);
  const output = selected.expandMaySetLanes(input);
  assert.equal(JSON.stringify(input), before);
  const reference = (values: any[]) =>
    values.map((value, index) => (values.indexOf(value) === index ? -1 : values.indexOf(value)));
  return {
    output,
    keys: Object.keys(output),
    sameGraph: output === input,
    sameLanes: output.lanes === input.lanes,
    sameRegions: output.regions === input.regions,
    originalSteps: output.steps.map((value: any) => input.steps.indexOf(value)),
    originalEdges: output.edges.map((value: any) => input.edges.indexOf(value)),
    stepAliases: reference(output.steps),
    stepKeys: output.steps.map((value: any) => Object.keys(value)),
    edgeKeys: output.edges.map((value: any) => Object.keys(value)),
    extraAliases: output.steps.map((value: any) =>
      input.steps.findIndex(
        (original: any) => original.extra !== undefined && value.extra === original.extra,
      ),
    ),
    sameSink: output.sink === input.sink,
  };
}

export function readPhases(selected: any, empty = false, throwAt?: string) {
  const input = graph(empty ? [] : [step("x", ["a", "b"])], [], { fedBy: ["x"] });
  const calls: string[] = [],
    failure = new Error("Owned graph read failure");
  const port = Object.fromEntries(Object.keys(input).map((key) => [key, input[key]]));
  for (const key of ["steps", "edges", "sink", "lanes", "regions"])
    Object.defineProperty(port, key, {
      get() {
        calls.push(key);
        if (key === throwAt) throw failure;
        return input[key];
      },
    });
  try {
    const output = selected.expandMaySetLanes(port);
    return { calls, sameGraph: output === port };
  } catch (error) {
    assert.equal(error, failure);
    return { calls, error: failure.message, sameError: true };
  }
}

export const scripts = [
  'const a = agent("Owned alpha"); const b = agent("Owned beta"); const condition = true as boolean; const chosen = condition ? a : b; return await chosen.ask("Owned ask");',
  'const a = agent("Owned alpha"); const b = agent("Owned beta"); const condition = true as boolean; const chosen = condition ? a : b; let value = "Owned seed"; for (let i=0;i<2;i++) { value = await chosen.ask(value); } return value;',
  'const a = agent("Owned alpha"); const b = agent("Owned beta"); const condition = true as boolean; const chosen = condition ? a : b; phase("Owned first"); const x = await chosen.ask("Owned first ask"); phase("Owned second"); return await chosen.ask(x);',
];
export function consumer(selected: any, script: string) {
  const result = selected.analyzeWorkflowScript(script);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.ok(
    result.causality.steps.some((s: any) => s.source !== undefined),
    "actual consumer must reach lane expansion",
  );
  const browserCore = projections.decodeAnalysisCore(projections.encodeAnalysisCore(result.core));
  const browserGraph = projections.projectCausalityGraph(
    browserCore,
    projections.projectSiteGraph(browserCore),
  );
  assert.deepEqual(browserGraph, result.causality);
  return {
    causality: result.causality,
    handoff: result.handoff,
    core: projections.serializeCore(result.core),
    mermaid: projections.causalityGraphToMermaid(result.causality),
    handoffMermaid: projections.handoffGraphToMermaid(result.handoff),
  };
}
