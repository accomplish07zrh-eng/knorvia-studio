import assert from "node:assert/strict";
import test from "node:test";
import { success, failure, group, workflow, harness } from "./studio-orchestration-support.js";
import { executeStudioGroup } from "../src/studio-runtime/app/groupExecutor.js";
import { executeStudioWorkflow } from "../src/studio-runtime/app/workflowExecutor.js";

test("cancellation at admission has no agent or approval side effect", async () => {
  const h = harness();
  h.controller.abort();
  assert.equal((await executeStudioGroup(group, "@all hi", false, "", h.port)).status, "cancelled");
  assert.equal(
    (
      await executeStudioWorkflow(
        workflow(
          ["start", "agent", "end"],
          [
            [0, 1],
            [1, 2],
          ],
        ),
        "hi",
        h.port,
      )
    ).status,
    "cancelled",
  );
  assert.equal(h.calls.length, 0);
});

test("human gate resumes with the same ID and never resends the earlier completed agent", async () => {
  const graph = workflow(
    ["start", "agent", "approval", "agent", "end"],
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  );
  const h = harness();
  let first = true;
  const ids: string[] = [];
  h.port.confirm = async (id) => {
    ids.push(id);
    if (first) {
      first = false;
      throw new Error("process went away while waiting");
    }
    return true;
  };
  assert.equal((await executeStudioWorkflow(graph, "go", h.port)).status, "interrupted");
  assert.equal(h.calls.length, 1);
  assert.equal((await executeStudioWorkflow(graph, "go", h.port)).status, "succeeded");
  assert.equal(h.calls.length, 2);
  assert.equal(ids[0], ids[1]);
});

test("cancel during agent exception remains unknown, and authentication failures never retry", async () => {
  const graph = workflow(
    ["start", "agent", "end"],
    [
      [0, 1],
      [1, 2],
    ],
  );
  graph.nodes[1]!.data.retryCount = 5;
  const h = harness(async () => {
    h.controller.abort();
    throw new Error("transport disappeared after write");
  });
  const result = await executeStudioWorkflow(graph, "go", h.port);
  assert.equal(result.status, "interrupted");
  assert.equal(result.resultKnown, false);
  assert.equal(h.calls.length, 1);
  const auth = harness(async () => ({ ...failure("Not authenticated"), retryable: false }));
  assert.equal((await executeStudioWorkflow(graph, "go", auth.port)).status, "failed");
  assert.equal(auth.calls.length, 1);
});

test("any join cancels an outstanding approval and does not send its child agent", async () => {
  const graph = workflow(
    ["start", "parallel", "agent", "approval", "agent", "join", "end"],
    [
      [0, 1],
      [1, 2],
      [1, 3],
      [3, 4],
      [2, 5],
      [4, 5],
      [5, 6],
    ],
  );
  graph.nodes[5]!.data.joinPolicy = "any";
  const h = harness();
  let cancelled = false;
  h.port.confirm = async (_id, _title, signal) =>
    new Promise((_resolve, reject) => {
      const stop = () => {
        cancelled = true;
        reject(new Error("cancelled"));
      };
      if (signal?.aborted) stop();
      else signal?.addEventListener("abort", stop, { once: true });
    });
  assert.equal((await executeStudioWorkflow(graph, "go", h.port)).status, "succeeded");
  assert.equal(cancelled, true);
  assert.equal(h.calls.length, 1);
});

test("any join leaves branches with other consumers alive", async () => {
  const graph = workflow(
    ["start", "parallel", "agent", "parallel", "agent", "agent", "join", "end", "end"],
    [
      [0, 1],
      [1, 2],
      [1, 3],
      [3, 4],
      [3, 5],
      [2, 6],
      [4, 6],
      [6, 7],
      [5, 8],
    ],
  );
  graph.nodes[6]!.data.joinPolicy = "any";
  const h = harness(async (step) => success(step.id));
  assert.equal((await executeStudioWorkflow(graph, "go", h.port)).status, "succeeded");
  assert.ok(h.calls.some((step) => step.id.includes("n5")));
});

test("any join waits for cancellation acknowledgement before running downstream effects", async () => {
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
  graph.nodes[4]!.data.joinPolicy = "any";
  const h = harness(async (step) => {
    if (step.id.includes("n2")) return success("winner");
    if (step.id.includes("n3"))
      return new Promise((resolve) => {
        const abort = () => {
          queueMicrotask(() =>
            resolve({
              status: "interrupted",
              resultKnown: false,
              text: "",
              error: "Unable to prove cancellation",
            }),
          );
        };
        if (step.signal?.aborted) abort();
        else step.signal?.addEventListener("abort", abort, { once: true });
      });
    return success("downstream write");
  });
  assert.equal((await executeStudioWorkflow(graph, "go", h.port)).status, "interrupted");
  assert.equal(
    h.calls.some((step) => step.id.includes("n5")),
    false,
  );
});

test("unknown recovery never calls the kernel again until owner explicitly rearms that step", async () => {
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
  let retried = false;
  const h = harness(async (step) =>
    step.id.includes("n2") || retried
      ? success("done")
      : { status: "interrupted", resultKnown: false, text: "" },
  );
  assert.equal((await executeStudioWorkflow(graph, "go", h.port)).status, "interrupted");
  const count = h.calls.length;
  assert.equal((await executeStudioWorkflow(graph, "go", h.port)).status, "interrupted");
  assert.equal(h.calls.length, count);
  retried = true;
  delete h.port.checkpoint.steps["workflow:n3:attempt:0"];
  assert.equal((await executeStudioWorkflow(graph, "go", h.port)).status, "succeeded");
  assert.equal(h.calls.length, count + 1);
});

test("denied approval prevents every downstream call", async () => {
  const graph = workflow(
    ["start", "approval", "agent", "end"],
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  );
  const h = harness();
  h.port.confirm = async () => false;
  assert.equal((await executeStudioWorkflow(graph, "go", h.port)).status, "failed");
  assert.equal(h.calls.length, 0);
});
