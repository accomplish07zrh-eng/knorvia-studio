import assert from "node:assert/strict";
import test from "node:test";
import { success, failure, workflow, harness } from "./studio-orchestration-support.js";
import { validateStudioWorkflow } from "../src/studio-runtime/domain/workflowGraph.js";
import { executeStudioWorkflow } from "../src/studio-runtime/app/workflowExecutor.js";
import { workflowContext, workflowText } from "../src/studio-runtime/app/workflowSteps.js";

test("join context and prompt substitution stay bounded", () => {
  const context = workflowContext(["x".repeat(60_000), "y".repeat(60_000), "z".repeat(60_000)]);
  assert.ok(context.length < 65_000);
  assert.match(context, /Additional upstream output omitted/);
  assert.throws(() => workflowText("{{input}}".repeat(500), "x".repeat(10_000), "", new Map()));
  const graph = workflow(
    ["start", "agent", "end"],
    [
      [0, 1],
      [1, 2],
    ],
  );
  graph.nodes[1]!.data.prompt = "Read {{missing}}";
  assert.ok(validateStudioWorkflow(graph).some((issue) => issue.includes("non-ancestor")));
});

test("workflow validates edges, condition references and graph limits before effects", async () => {
  const graph = workflow(
    ["start", "agent", "end"],
    [
      [0, 1],
      [1, 2],
    ],
  );
  assert.deepEqual(validateStudioWorkflow(graph), []);
  graph.edges.push({ id: "loop", source: "n1", target: "n1" });
  assert.ok(validateStudioWorkflow(graph).length);
  const h = harness();
  assert.equal((await executeStudioWorkflow(graph, "hi", h.port)).status, "failed");
  assert.equal(h.calls.length, 0);
});

test("sequential flow carries output and resumes without repeating completed calls or approvals", async () => {
  const graph = workflow(
    ["start", "agent", "approval", "agent", "end"],
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  );
  graph.nodes[3]!.data.prompt = "Use {{n1}} and {{input}}";
  const h = harness(async (step) => success(step.prompt));
  assert.equal((await executeStudioWorkflow(graph, "seed", h.port)).status, "succeeded");
  assert.equal(h.calls.length, 2);
  assert.match(h.calls[1]!.prompt, /Task 1/);
  assert.match(h.calls[1]!.prompt, /seed/);
  assert.equal(h.questions.size, 1);
  assert.equal((await executeStudioWorkflow(graph, "seed", h.port)).status, "succeeded");
  assert.equal(h.calls.length, 2);
  assert.equal(h.questions.size, 1);
});

test("creation nodes pass an upstream image path into the next image edit without repeating completed work", async () => {
  const graph = workflow(
    ["start", "creation", "creation", "end"],
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  );
  graph.nodes[1]!.data.creationModelId = "image-model";
  graph.nodes[2]!.data.creationModelId = "image-model";
  graph.nodes[2]!.data.creationReferencePath = "{{n1}}";
  const h = harness();
  const submitted: Array<{ nodeId: string; referencePath?: string }> = [];
  h.port.createMedia = async (request) => {
    submitted.push({ nodeId: request.nodeId, referencePath: request.referencePath });
    return success(`C:/creation/${request.nodeId}.png`);
  };
  assert.deepEqual(validateStudioWorkflow(graph), []);
  assert.equal((await executeStudioWorkflow(graph, "draw", h.port)).status, "succeeded");
  assert.deepEqual(submitted, [
    { nodeId: "n1", referencePath: undefined },
    { nodeId: "n2", referencePath: "C:/creation/n1.png" },
  ]);
  assert.equal((await executeStudioWorkflow(graph, "draw", h.port)).status, "succeeded");
  assert.equal(submitted.length, 2);
});

test("conditional skip propagation allows inactive branch to join without hanging", async () => {
  const graph = workflow(
    ["start", "condition", "agent", "agent", "join", "end"],
    [
      [0, 1],
      [1, 2, "yes"],
      [1, 3, "no"],
      [2, 4],
      [3, 4],
      [4, 5],
    ],
  );
  const h = harness();
  assert.equal((await executeStudioWorkflow(graph, "yes", h.port)).status, "succeeded");
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0]!.id, /n2/);
});

test("parallel nodes start concurrently and all join waits for both", async () => {
  const graph = workflow(
    ["start", "parallel", "agent", "agent", "join", "agent", "end"],
    [
      [0, 1],
      [1, 2],
      [1, 3],
      [2, 4],
      [3, 4],
      [4, 5],
      [5, 6],
    ],
  );
  let release!: () => void;
  const both = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = 0;
  const h = harness(async (step) => {
    if (step.id.includes("n2") || step.id.includes("n3")) {
      started++;
      if (started === 2) release();
      await both;
    }
    return success(step.id);
  });
  assert.equal((await executeStudioWorkflow(graph, "yes", h.port)).status, "succeeded");
  assert.equal(started, 2);
  assert.equal(h.calls.length, 3);
  assert.equal(Object.keys(h.port.checkpoint.steps).length, 3);
});

test("any join cancels only losing branches and awaits their cancellation", async () => {
  const graph = workflow(
    ["start", "parallel", "agent", "agent", "join", "end"],
    [
      [0, 1],
      [1, 2],
      [1, 3],
      [2, 4],
      [3, 4],
      [4, 5],
    ],
  );
  graph.nodes[4]!.data.joinPolicy = "any";
  let cancelled = false;
  const h = harness(async (step) => {
    if (step.id.includes("n2")) return success("winner");
    return new Promise((resolve) => {
      const abort = () => {
        cancelled = true;
        resolve({ status: "cancelled", text: "", resultKnown: true });
      };
      if (step.signal?.aborted) abort();
      else step.signal?.addEventListener("abort", abort, { once: true });
    });
  });
  const result = await executeStudioWorkflow(graph, "go", h.port);
  assert.equal(result.status, "succeeded");
  assert.equal(cancelled, true);
});

test("known failure retries finitely, interrupted and cancelled calls do not retry", async () => {
  const graph = workflow(
    ["start", "agent", "end"],
    [
      [0, 1],
      [1, 2],
    ],
  );
  graph.nodes[1]!.data.retryCount = 2;
  let count = 0;
  const h = harness(async () => (++count < 3 ? failure("transient") : success("ok")));
  assert.equal((await executeStudioWorkflow(graph, "go", h.port)).status, "succeeded");
  assert.equal(h.calls.length, 3);
  for (const status of ["interrupted", "cancelled"] as const) {
    const stop = harness(async () => ({ status, text: "", resultKnown: status === "cancelled" }));
    assert.equal((await executeStudioWorkflow(graph, "go", stop.port)).status, status);
    assert.equal(stop.calls.length, 1);
  }
});

test("unknown any branch outcome is not hidden by a successful branch", async () => {
  const graph = workflow(
    ["start", "parallel", "agent", "agent", "join", "end"],
    [
      [0, 1],
      [1, 2],
      [1, 3],
      [2, 4],
      [3, 4],
      [4, 5],
    ],
  );
  graph.nodes[4]!.data.joinPolicy = "any";
  const h = harness(async (step) =>
    step.id.includes("n2")
      ? success("yes")
      : { status: "interrupted", text: "", resultKnown: false },
  );
  assert.equal((await executeStudioWorkflow(graph, "go", h.port)).status, "interrupted");
});
