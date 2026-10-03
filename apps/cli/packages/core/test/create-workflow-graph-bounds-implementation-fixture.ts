// Synthetic caller gaps; the archive retains old implementation as comparison evidence.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  clock,
  emitted,
  errorShape,
  executorFixture,
  load,
  normalized,
  sha,
} from "./workflow-run-summary-fixture.js";
export { clock };
export const current = await load("tool/handlers/workflow-analysis-display");
const archive = JSON.parse(
  await readFile(
    new URL("./create-workflow-graph-bounds-implementation-baseline.json", import.meta.url),
    "utf8",
  ),
);
const emittedRoot = new URL("../dist/tool/handlers/", import.meta.url);
const code = await readFile(new URL("create-workflow-graph-bounds.js", emittedRoot), "utf8");
const start = code.indexOf("export function boundCausalityGraph("),
  end = code.indexOf("// Bug 预防：actor 名");
assert.ok(start > 0 && end > start);
assert.equal(sha(code.slice(0, start)), archive.emittedHeaderSha256);
assert.equal(sha(code.slice(end)), archive.emittedTailSha256);
assert.equal(sha(archive.owner), archive.ownerSha256);
const baselineCode = code.slice(0, start) + archive.owner + code.slice(end);
assert.equal(sha(baselineCode), archive.emittedSha256);
assert.equal(
  sha(await readFile(new URL("create-workflow-graph-bounds.d.ts", emittedRoot), "utf8")),
  archive.declarationSha256,
);
function moduleUrl(text: string, overrides: Record<string, string> = {}) {
  const mapped = text.replace(/from "([^"]+)"/gu, (_match, specifier: string) => {
    const target =
      overrides[specifier] ??
      (specifier.startsWith(".")
        ? new URL(
            specifier.replace(/\.js$/u, emitted ? ".js" : ".ts"),
            new URL(`../${emitted ? "dist" : "src"}/tool/handlers/`, import.meta.url),
          ).href
        : import.meta.resolve(specifier));
    return `from ${JSON.stringify(target)}`;
  });
  return `data:text/javascript;base64,${Buffer.from(mapped).toString("base64")}`;
}
const oldBoundsUrl = moduleUrl(baselineCode);
const callerCode = await readFile(new URL("workflow-analysis-display.js", emittedRoot), "utf8");
assert.equal(sha(callerCode), archive.consumerSha256);
export const baseline = await import(
  moduleUrl(callerCode, {
    "./create-workflow-graph-bounds.js": oldBoundsUrl,
  })
);
const { createWorkflowToolEntry: entry } = await load("tool/handlers/create-workflow");
export function graphInput(label = "Synthetic bounded graph"): any {
  return {
    ok: true,
    diagnostics: [],
    causality: {
      steps: [
        { id: "s", kind: "ask", label, lane: "a", phase: "first", loc: { line: 1, column: 1 } },
      ],
      lanes: [{ id: "a" }],
      edges: [],
      regions: [],
      sink: { fedBy: ["s"] },
    },
    flow: { nodes: [], edges: [], phases: [{ id: "first" }], phaseEdges: [] },
    handoff: {
      participants: [
        { id: "p", phase: "first", lane: "a", steps: ["s"], member: { index: 0, of: 1 } },
      ],
      handoffs: [],
    },
  };
}
export function gap(selected: any, kind: "phase-overflow" | "lazy-count" | "eager-count") {
  const input = graphInput(),
    tape: string[] = [],
    failure = new Error("Synthetic omitted-field read");
  if (kind === "phase-overflow") {
    input.flow.phases = Array.from({ length: 33 }, (_, i) => ({ id: `phase${i}` }));
    Object.defineProperty(input.flow.phases[32], "name", {
      get() {
        tape.push("omitted-phase-name");
        throw failure;
      },
    });
  } else {
    if (kind === "lazy-count")
      input.causality.steps = Array.from({ length: 65 }, () => input.causality.steps[0]);
    const cards = input.handoff.participants;
    let reads = 0;
    Object.defineProperty(input.handoff, "participants", {
      get() {
        tape.push("participants");
        if (++reads === 2) throw failure;
        return cards;
      },
    });
  }
  try {
    const graph = selected.boundGraphOfAnalysis(input);
    return { graph, tape, success: true };
  } catch (error) {
    return { error: errorShape(error), sameFailure: error === failure, tape, success: false };
  }
}
export async function consumer(selected: any, mode = "normal", label?: string) {
  let f: any,
    calls = 0;
  const input = graphInput(label);
  const synthetic = {
    ...entry,
    resolveInput: undefined,
    prepareApproval: () => ({ gate: "ask", display: selected.displayOfAnalysis(input) }),
    handler: async () => {
      calls++;
      return {
        ok: true,
        diagnostics: [],
        response: "Synthetic graph projection",
        causalityGraph: selected.boundGraphOfAnalysis(input),
      };
    },
    formatModelContent(output: unknown) {
      if (mode === "model-begin")
        queueMicrotask(() => f.d.controller.abort("Synthetic completion abort"));
      const model = entry.formatModelContent(output);
      if (mode === "model-end")
        queueMicrotask(() => f.d.controller.abort("Synthetic completion abort"));
      return model;
    },
  };
  f = executorFixture(
    {
      input: { script: "// Synthetic projection fixture" },
      ...(mode === "early" ? { port: "early" } : {}),
    },
    synthetic,
  );
  const result = normalized(f, await f.execute());
  assert.equal(f.d.calls.length, 0);
  assert.equal(calls, mode === "early" ? 0 : 1);
  return { ...result, producerCalls: calls };
}
