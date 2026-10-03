// Synthetic graph contracts; archived implementation/prose remains inherited material.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CreateWorkflowCausalityGraphSchema } from "@knorvia/contracts";
import {
  emitted,
  load,
  sha,
  errorShape,
  executorFixture,
  normalized,
  clock,
  handlers,
  createToolRegistry,
} from "./workflow-run-summary-fixture.js";
export { emitted, sha, handlers, createToolRegistry, clock };
import {
  historicalAnalysisBytes,
  historicalBoundsBytes,
  loadCurrentGraph,
} from "./create-workflow-graph-loader-fixture.js";
export const archive = JSON.parse(
  await readFile(new URL("./create-workflow-graph-fold-baseline.json", import.meta.url), "utf8"),
);
assert.equal(sha(archive.compiled), archive.compiledSha256);
function moduleUrl(compiled: string, name: string, overrides: Record<string, string> = {}) {
  const mapped = compiled.replace(/from "([^"]+)"/gu, (_match, specifier) => {
    const resolved =
      overrides[specifier] ??
      (specifier.startsWith(".")
        ? new URL(
            specifier.replace(/\.js$/u, emitted ? ".js" : ".ts"),
            new URL(
              `../${emitted ? "dist" : "src"}/tool/handlers/${name}.${emitted ? "js" : "ts"}`,
              import.meta.url,
            ),
          ).href
        : import.meta.resolve(specifier));
    return `from ${JSON.stringify(resolved)}`;
  });
  return `data:text/javascript;base64,${Buffer.from(mapped).toString("base64")}`;
}
// 原 fold oracle 依赖原 reducer；live reducer 迁移会改变 NaN 见证并污染旧 golden。
const reducerArchive = JSON.parse(
  await readFile(new URL("./causality-reduction-baseline.json", import.meta.url), "utf8"),
);
assert.equal(
  reducerArchive.sourceSha256,
  "dc04aa06052c32a41bab2864b29ffd6bfc75edaf1ebd92d9b6aff0737af9c586",
);
assert.equal(sha(reducerArchive.compiled), reducerArchive.emittedSha256);
assert.equal(
  reducerArchive.emittedSha256,
  "b935726d4a000be940c997e23262f2f6c0936131a57ecd87e019d72a96e12564",
);
const originalReducerUrl = `data:text/javascript;base64,${Buffer.from(reducerArchive.compiled).toString("base64")}`;
const oldUrl = moduleUrl(archive.compiled, "create-workflow-graph-fold", {
  "@knorvia/dynamic-workflow/projections": originalReducerUrl,
});
export const old = await import(oldUrl);
export const current = await loadCurrentGraph("fold");
const boundsJs = historicalBoundsBytes();
assert.equal(sha(boundsJs), archive.boundsSha256);
const oldBoundsUrl = moduleUrl(boundsJs, "create-workflow-graph-bounds", {
  "./create-workflow-graph-fold.js": oldUrl,
});
export const oldBounds = await import(oldBoundsUrl);
export const bounds = await loadCurrentGraph("bounds");
const analysisJs = historicalAnalysisBytes();
assert.equal(sha(analysisJs), archive.analysisSha256);
export const oldAnalysis = await import(
  moduleUrl(analysisJs, "workflow-analysis-display", {
    "./create-workflow-graph-bounds.js": oldBoundsUrl,
  })
);
export const analysis = await loadCurrentGraph("analysis");
export const { createWorkflowToolEntry: entry } = await load("tool/handlers/create-workflow");
export const declaration = await readFile(
  new URL("../dist/tool/handlers/create-workflow-graph-fold.d.ts", import.meta.url),
  "utf8",
);
const edge = (from: any, to: any, back: any = false, extra: any = {}) => ({
  from,
  to,
  back,
  ...extra,
});
export const cases: any[] = [
  [],
  [edge("a", "a")],
  [edge("a", "b")],
  [edge("a", "b"), edge("b", "c"), edge("a", "c")],
  [edge("a", "b"), edge("b", "a"), edge("root", "a"), edge("root", "b")],
  [edge("b", "a"), edge("a", "b"), edge("b", "x"), edge("a", "y"), edge("x", "y")],
  [
    edge("z", "a"),
    edge("a", "b"),
    edge("b", "a"),
    edge("a", "x"),
    edge("x", "y"),
    edge("y", "x"),
    edge("z", "y"),
  ],
  [edge("a", "b"), edge("b", "a", true), edge("a", "c"), edge("b", "c")],
  [edge("a", "b", true), edge("a", "b"), edge("a", "b", true)],
  [edge("a", "b", true), edge("b", "c"), edge("a", "c", true)],
  [edge("a", "b", true), edge("b", "a", true), edge("x", "y", true)],
  [edge("a b", "c"), edge("a", "b c", true)],
  [
    edge("a", "b", false, { extra: { synthetic: true }, [Symbol.for("synthetic-edge")]: 7 }),
    edge("a", "b"),
  ],
  [edge("a", "b", 0), edge("b", "a", "carry")],
  [edge(undefined, "b"), edge("b", undefined)],
  [edge(null, "b"), edge("b", null)],
  [edge(NaN, "b"), edge("b", NaN)],
  [edge("一", "二"), edge("二", "一"), edge("start", "二")],
  { kind: "null" },
  { kind: "sparse" },
  { kind: "iterator-throw" },
  { kind: "getter-throw" },
  { kind: "coercion-throw" },
  { kind: "watched" },
];
export function observe(c: any, selected = current) {
  const tape: any[] = [],
    failure = new Error("Synthetic graph failure");
  let raw: any = c;
  if (!Array.isArray(c)) {
    if (c.kind === "null") raw = null;
    else if (c.kind === "sparse") raw = Array(1);
    else if (c.kind === "iterator-throw")
      raw = {
        [Symbol.iterator]() {
          tape.push("iterator");
          throw failure;
        },
      };
    else if (c.kind === "getter-throw")
      raw = [
        {
          get from() {
            tape.push("from");
            throw failure;
          },
          to: "b",
          back: false,
        },
      ];
    else if (c.kind === "coercion-throw")
      raw = [
        edge(
          {
            [Symbol.toPrimitive](hint: string) {
              tape.push(hint);
              throw failure;
            },
          },
          "b",
        ),
      ];
    else
      raw = [edge("b", "a"), edge("a", "b"), edge("root", "b"), edge("root", "a")].map(
        (value, index) =>
          new Proxy(value, {
            get(target, key, receiver) {
              tape.push([index, String(key)]);
              return Reflect.get(target, key, receiver);
            },
            ownKeys(target) {
              tape.push([index, "keys"]);
              return Reflect.ownKeys(target);
            },
            getOwnPropertyDescriptor(target, key) {
              tape.push([index, "descriptor", String(key)]);
              return Reflect.getOwnPropertyDescriptor(target, key);
            },
          }),
      );
  }
  try {
    const output = selected.foldPhaseEdges(raw);
    return {
      output,
      tape,
      keys: output.map((item: any) => Reflect.ownKeys(item).map(String)),
      inputAliases: output.map((item: any) => Array.isArray(raw) && raw.includes(item)),
    };
  } catch (error) {
    return { error: errorShape(error), sameFailure: error === failure, tape };
  }
}
export const consumerCases = [
  "cycle",
  "dag",
  "carry",
  "phase-limit",
  "edge-limit",
  "absent",
  "text",
];
export function graphFixture(kind: string) {
  const ids =
    kind === "phase-limit"
      ? Array.from({ length: 33 }, (_, i) => `p${i}`)
      : kind === "edge-limit"
        ? Array.from({ length: 13 }, (_, i) => `p${i}`)
        : ["root", "a", "b", "end"];
  const raw =
    kind === "edge-limit"
      ? ids.flatMap((from) => ids.filter((to) => from !== to).map((to) => edge(from, to)))
      : [
          edge(ids[1], ids[2]),
          ...(kind === "dag" ? [] : [edge(ids[2], ids[1], kind === "carry")]),
          edge(ids[0], ids[1]),
          edge(ids[0], ids[2]),
          edge(ids[2], ids[3]),
          edge(ids[0], ids[3]),
        ];
  const causality = {
    steps: [0, 1].map((i) => ({
      id: `s${i}`,
      kind: "ask",
      label: `Synthetic ${i}`,
      lane: "workspace",
      loc: { line: i + 1, column: 1 },
      phase: ids[i],
    })),
    lanes: [{ id: "workspace", name: "Synthetic lane" }],
    regions: [],
    edges: [],
    sink: { fedBy: ["s1"] },
  };
  const flow = {
    nodes: [],
    edges: [],
    ...(kind === "absent"
      ? {}
      : {
          phases: ids.map((id, i) => ({
            id,
            name: kind === "text" ? "😀".repeat(65) : `Synthetic ${id}`,
            alongside: i === 2 ? [ids[1], ids[1], id, "missing"] : [],
          })),
          phaseEdges: [
            ...raw.map((e) => ({ from: e.from, to: e.to, kind: e.back ? "loop" : "next" })),
            { from: ids[3], to: "sink", kind: "next" },
            { from: "entry", to: ids[0], kind: "next" },
            { from: "missing", to: ids[0], kind: "next" },
          ],
        }),
  };
  const handoff = {
    participants: [{ id: "card", lane: "workspace", phase: ids[0], steps: ["s0"] }],
    handoffs: [],
  };
  return { diagnostics: [], ok: true, causality, flow, handoff };
}
export function project(kind: string, selected = analysis) {
  const input = graphFixture(kind);
  const graph = selected.boundGraphOfAnalysis(input);
  return {
    graph,
    valid: CreateWorkflowCausalityGraphSchema.safeParse(graph).success,
    create: selected.displayOfAnalysis(input),
    amend: selected.displayOfAnalysis(input, "AmendWorkflow"),
    wrongName: selected.displayOfAnalysis(input, "createworkflow"),
  };
}
export async function consumer(selected = analysis, edgeKind = "normal", kind = "cycle") {
  let f: any,
    calls = 0;
  const synthetic = {
    ...entry,
    resolveInput: undefined,
    prepareApproval: () => ({
      gate: "ask",
      display: selected.displayOfAnalysis(graphFixture(kind)),
    }),
    handler: () => {
      calls++;
      return {
        ok: true,
        diagnostics: [],
        response: "Synthetic analyzed graph",
        causalityGraph: selected.boundGraphOfAnalysis(graphFixture(kind)),
      };
    },
    formatModelContent: (output: unknown) => {
      if (edgeKind === "model-begin")
        queueMicrotask(() => f.d.controller.abort("Synthetic completion abort"));
      const model = entry.formatModelContent(output);
      if (edgeKind === "model-end")
        queueMicrotask(() => f.d.controller.abort("Synthetic completion abort"));
      return model;
    },
  };
  f = executorFixture(
    {
      input: { script: "// Synthetic graph projection fixture" },
      ...(edgeKind === "early" ? { port: "early" } : {}),
    },
    synthetic,
  );
  const output = normalized(f, await f.execute());
  assert.equal(f.d.calls.length, 0);
  assert.equal(calls, edgeKind === "early" ? 0 : 1);
  return { ...output, producerCalls: calls };
}

export function inheritedFlag(selected = current) {
  const original = Object.getOwnPropertyDescriptor(Array.prototype, "1");
  try {
    Object.defineProperty(Array.prototype, "1", {
      value: true,
      configurable: true,
      writable: true,
    });
    return selected.foldPhaseEdges([
      { from: "a", to: "b", back: false },
      { from: "b", to: "a", back: false },
      { from: "root", to: "a", back: false },
      { from: "root", to: "b", back: false },
    ]);
  } finally {
    if (original) Object.defineProperty(Array.prototype, "1", original);
    else Reflect.deleteProperty(Array.prototype, "1");
  }
}
