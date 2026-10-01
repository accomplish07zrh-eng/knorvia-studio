// Owned synthetic graphs; fixed API facts and previous fixture infrastructure are reused.
import assert from "node:assert/strict";
import {
  CreateWorkflowCausalityGraphSchema,
  toolResultDisplayPayloadSchema,
} from "@knorvia/contracts";
import { load, sha, errorShape } from "./workflow-run-summary-fixture.js";
export { sha };
export const analysis = await load("tool/handlers/workflow-analysis-display");
const results = await load("tool/executor/result-display");
const step = (id: string, lane: string) => ({
  id,
  lane,
  kind: "ask",
  label: id,
  loc: { line: 1, column: 1 },
});
const card = (id: string, lane: string, steps: string[]) => ({
  id,
  lane,
  steps,
  phase: "unphased",
});
export const names = [
  "closure",
  "step-lane-limit",
  "card-limit",
  "handoff-limit",
  "clipped-identities",
];
function inputOf(name: string): any {
  const input: any = {
    ok: true,
    diagnostics: [],
    causality: {
      steps: [step("s", "a")],
      lanes: [{ id: "a" }],
      regions: [],
      edges: [],
      sink: { fedBy: ["s"] },
    },
    handoff: { participants: [card("p", "a", ["s"])], handoffs: [] },
  };
  if (name === "closure") {
    input.causality.steps = [
      {
        ...step("s0", "a"),
        lanes: ["a", "b", "missing", "b"],
        source: "original-site",
        phase: "first",
      },
      step("s1", "missing"),
      { ...step("s2", "b"), phase: "last" },
    ];
    input.causality.lanes = [{ id: "unused" }, { id: "b" }, { id: "a" }];
    input.causality.sink.fedBy = ["s1", "s0", "missing", "s2"];
    input.handoff.participants = [
      {
        ...card("p0", "a", ["s0", "s1", "missing", "s0"]),
        phase: "first",
        member: { index: 0, of: 2 },
      },
      card("p1", "b", ["s2"]),
      card("empty", "a", ["s1"]),
      card("unlisted", "missing", ["s0"]),
    ];
    input.handoff.handoffs = [
      {
        from: "p0",
        to: "p1",
        back: true,
        types: ["", "one", "two", "three", "four", "five", "six", "seven", "tail"],
      },
      { from: "p0", to: "empty" },
    ];
    input.flow = {
      nodes: [],
      edges: [],
      phases: [
        { id: "first", alongside: ["last", "last", "first", "missing"] },
        { id: "last" },
        { id: "marker" },
      ],
      phaseEdges: [
        { from: "entry", to: "first", kind: "next" },
        { from: "first", to: "last", kind: "next" },
        { from: "last", to: "sink", kind: "next" },
        { from: "marker", to: "sink", kind: "next" },
        { from: "abort", to: "last", kind: "next" },
        { from: "missing", to: "first", kind: "next" },
      ],
    };
  } else if (name === "step-lane-limit") {
    input.causality.lanes = Array.from({ length: 33 }, (_, i) => ({ id: `l${i}` }));
    input.causality.steps = Array.from({ length: 65 }, (_, i) => step(`s${i}`, `l${i % 33}`));
    input.causality.steps[0].lanes = ["l0", "l32"];
    input.causality.sink.fedBy = input.causality.steps.map((s: any) => s.id);
    input.handoff.participants = [card("p", "l0", input.causality.sink.fedBy)];
  } else if (name === "card-limit") {
    input.handoff.participants = Array.from({ length: 65 }, (_, i) => card(`p${i}`, "a", ["s"]));
    input.handoff.handoffs = [
      { from: "p0", to: "p63" },
      { from: "p0", to: "p64" },
    ];
  } else if (name === "handoff-limit") {
    input.handoff.participants = [card("p0", "a", ["s"]), card("p1", "a", ["s"])];
    input.handoff.handoffs = Array.from({ length: 257 }, () => ({ from: "p0", to: "p1" }));
  } else {
    const phase = "f".repeat(65),
      participant = "p".repeat(65);
    input.causality.steps[0].phase = phase;
    input.causality.lanes[0] = { id: "a", name: "", namePattern: { head: "", tail: "Synthetic" } };
    input.handoff.participants = [
      { ...card(participant, "a", ["s"]), phase },
      card("other", "a", ["s"]),
    ];
    input.handoff.handoffs = [
      { from: participant, to: "other" },
      { from: participant.slice(0, 64), to: "other" },
    ];
    input.flow = {
      nodes: [],
      edges: [],
      phases: [{ id: phase, name: "n".repeat(127) + "😀" }],
      phaseEdges: [],
    };
  }
  return input;
}
export function observation(name: string) {
  const input = inputOf(name),
    before = structuredClone(input);
  const graph = analysis.boundGraphOfAnalysis(input);
  const create = analysis.displayOfAnalysis(input);
  const amend = analysis.displayOfAnalysis(input, "AmendWorkflow");
  const routed = results.createToolResultDisplay("CreateWorkflow", {
    ok: true,
    diagnostics: [],
    response: "",
    causalityGraph: graph,
  });
  assert.deepEqual(input, before);
  assert.deepEqual(analysis.boundGraphOfAnalysis(input), graph);
  return {
    graph,
    graphValid: CreateWorkflowCausalityGraphSchema.safeParse(graph).success,
    create,
    amend,
    routed,
    displayValid: toolResultDisplayPayloadSchema.safeParse(create).success,
  };
}
export function lateFailure(kind: string, operation: string) {
  const input = inputOf(kind),
    failure = new Error(`Synthetic ${kind} projection failure`),
    tape: string[] = [];
  const target =
    kind === "card-limit" ? input.handoff.participants[64] : input.handoff.handoffs[256];
  Object.defineProperty(target, kind === "card-limit" ? "member" : "types", {
    get() {
      tape.push("tail-field");
      throw failure;
    },
  });
  try {
    const output =
      operation === "graph"
        ? analysis.boundGraphOfAnalysis(input)
        : analysis.displayOfAnalysis(input);
    return { output, tape };
  } catch (error) {
    return { error: errorShape(error), sameFailure: error === failure, tape };
  }
}
