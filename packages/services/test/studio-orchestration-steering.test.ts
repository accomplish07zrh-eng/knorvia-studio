import assert from "node:assert/strict";
import test from "node:test";
import { success, group, harness } from "./studio-orchestration-support.js";
import { executeStudioGroup } from "../src/studio-runtime/app/groupExecutor.js";
import type { StudioAgentStep } from "../src/studio-runtime/app/ports.js";
import type { StudioStepResult } from "../src/studio-runtime/workflowTypes.js";

const tasks = (id: string) => [{ id, member: "codex", instruction: `Deliver ${id}` }];
const plan = (id: string) => success(JSON.stringify({ tasks: tasks(id) }));
const correction = (id: string, summary = "Use YAML and preserve the original goal") =>
  success(JSON.stringify({ tasks: tasks(id), steeringSummary: summary }));
const complete = () => success('{"status":"complete","summary":"Deliverables verified."}');
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function steeringHarness(run: (step: StudioAgentStep) => Promise<StudioStepResult>) {
  const h = harness(run);
  const pending: Array<{ id: string; text: string }> = [];
  const acknowledgements: string[][] = [];
  h.port.steering = () => [...pending];
  h.port.ackSteering = async (ids) => {
    acknowledgements.push([...ids]);
    for (let i = pending.length - 1; i >= 0; i--)
      if (ids.includes(pending[i]!.id)) pending.splice(i, 1);
  };
  return { ...h, pending, acknowledgements };
}
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

test("steering drains active writers without abort and replaces only undispatched work", async () => {
  const a = deferred<StudioStepResult>();
  const b = deferred<StudioStepResult>();
  const started = deferred<void>();
  let writers = 0;
  const h = steeringHarness(async (step) => {
    if (step.id.includes(":plan:"))
      return success(
        JSON.stringify({
          tasks: [
            { id: "a", member: "codex", instruction: "Write A" },
            { id: "b", member: "claude-code", instruction: "Write B" },
            { id: "old-tail", member: "codex", instruction: "Old plan", dependsOn: ["a", "b"] },
          ],
        }),
      );
    if (step.id.endsWith(":a") || step.id.endsWith(":b")) {
      if (++writers === 2) started.resolve();
      return step.id.endsWith(":a") ? a.promise : b.promise;
    }
    if (step.id.includes(":steering:")) {
      assert.match(step.prompt, /Original delivery goal/);
      assert.match(step.prompt, /Use YAML instead/);
      assert.match(step.prompt, /A written/);
      assert.match(step.prompt, /B written/);
      assert.match(step.prompt, /old-tail/);
      return correction("corrected");
    }
    return step.id.includes(":review:") ? complete() : success("YAML delivered");
  });
  const ack = h.port.ackSteering!;
  h.port.ackSteering = async (ids) => {
    const saved = h.port.checkpoint.plan as { phase: string; tasks: Array<{ id: string }> };
    assert.equal(saved.phase, "tasks");
    assert.equal(saved.tasks[0]!.id, "corrected", "persist corrected plan before consumption");
    await ack(ids);
  };
  const work = executeStudioGroup(group, "Original delivery goal", true, "", h.port);
  await started.promise;
  h.pending.push({ id: "m1", text: "Use YAML instead" });
  a.resolve(success("A written"));
  await flush();
  assert.equal(
    h.calls.some((step) => step.id.includes(":steering:")),
    false,
  );
  assert.equal(h.calls.filter((step) => step.id.includes(":task:")).length, 2);
  assert.equal(
    h.calls.some((step) => step.signal?.aborted),
    false,
  );
  b.resolve(success("B written"));
  assert.equal((await work).status, "succeeded");
  assert.equal(
    h.calls.some((step) => step.id.endsWith(":old-tail")),
    false,
  );
  assert.deepEqual(h.acknowledgements, [["m1"]]);
  assert.match(h.calls.find((step) => step.id.endsWith(":corrected"))!.prompt, /Use YAML/);
});

test("a correction arriving while the host plans remains pending for the next revision", async () => {
  let revisions = 0;
  const h = steeringHarness(async (step) => {
    if (step.id.includes(":plan:")) {
      h.pending.push({ id: "m1", text: "Use YAML" });
      return plan("original");
    }
    if (step.id.includes(":steering:")) {
      if (++revisions === 1) {
        assert.doesNotMatch(step.prompt, /Also add schema/);
        h.pending.push({ id: "m2", text: "Also add schema" });
        return correction("first-correction");
      }
      assert.match(step.prompt, /Use YAML/);
      assert.match(step.prompt, /Also add schema/);
      return correction("second-correction", "Use YAML and include schema");
    }
    return step.id.includes(":review:") ? complete() : success("done");
  });
  assert.equal(
    (await executeStudioGroup(group, "Original goal", true, "", h.port)).status,
    "succeeded",
  );
  assert.equal(
    h.calls.some((step) => step.id.endsWith(":original") || step.id.endsWith(":first-correction")),
    false,
  );
  assert.deepEqual(h.acknowledgements, [["m1"], ["m2"]]);
  assert.equal(h.pending.length, 0);
});

test("stop wins over pending steering and waits for the active writer to settle", async () => {
  const writer = deferred<StudioStepResult>();
  const started = deferred<void>();
  const h = steeringHarness(async (step) => {
    if (step.id.includes(":plan:")) return plan("writer");
    started.resolve();
    return writer.promise;
  });
  const work = executeStudioGroup(group, "Deliver", true, "", h.port);
  await started.promise;
  h.pending.push({ id: "m1", text: "Changed direction" });
  h.controller.abort(new Error("User stopped"));
  writer.resolve({ status: "cancelled", resultKnown: true, text: "" });
  assert.equal((await work).status, "cancelled");
  assert.deepEqual(h.acknowledgements, []);
  assert.equal(
    h.calls.some((step) => step.id.includes(":steering:")),
    false,
  );
  assert.equal((await executeStudioGroup(group, "Deliver", true, "", h.port)).status, "cancelled");
  assert.equal(h.calls.length, 2);
});

test("stop during revised-plan persistence does not acknowledge or dispatch the correction", async () => {
  const h = steeringHarness(async (step) => {
    if (step.id.includes(":plan:")) {
      h.pending.push({ id: "m1", text: "New instruction" });
      return plan("old");
    }
    return correction("new");
  });
  const save = h.port.saveCheckpoint;
  h.port.saveCheckpoint = async (update) => {
    await save(update);
    const saved = update.plan as { phase?: string; tasks?: Array<{ id: string }> } | undefined;
    if (saved?.phase === "tasks" && saved.tasks?.[0]?.id === "new") h.controller.abort();
  };
  assert.equal((await executeStudioGroup(group, "Deliver", true, "", h.port)).status, "cancelled");
  assert.deepEqual(h.acknowledgements, []);
  assert.equal(
    h.calls.some((step) => step.id.includes(":task:")),
    false,
  );
});

test("recovery after a saved plan retries only its acknowledgement, not host consumption", async () => {
  const h = steeringHarness(async (step) => {
    if (step.id.includes(":plan:")) {
      h.pending.push({ id: "m1", text: "Use YAML" });
      return plan("old");
    }
    if (step.id.includes(":steering:")) return correction("new");
    return step.id.includes(":review:") ? complete() : success("done");
  });
  const ack = h.port.ackSteering!;
  h.port.ackSteering = async () => {
    throw new Error("crash before ack commit");
  };
  assert.equal((await executeStudioGroup(group, "Deliver", true, "", h.port)).status, "failed");
  assert.equal(h.pending.length, 1);
  h.port.ackSteering = ack;
  assert.equal((await executeStudioGroup(group, "Deliver", true, "", h.port)).status, "succeeded");
  assert.equal(h.calls.filter((step) => step.id.includes(":steering:")).length, 1);
  assert.equal(h.calls.filter((step) => step.id.endsWith(":new")).length, 1);
  assert.deepEqual(h.acknowledgements, [["m1"]]);
});

test("recovery freezes the same host input when a newer message arrives after a crash", async () => {
  let plans = 0;
  const h = steeringHarness(async (step) => {
    if (step.id.includes(":plan:")) {
      h.pending.push({ id: "m1", text: "Use YAML" });
      return plan("old");
    }
    if (step.id.includes(":steering:")) {
      plans++;
      return correction(plans === 1 ? "first" : "second");
    }
    return step.id.includes(":review:") ? complete() : success("done");
  });
  const save = h.port.saveCheckpoint;
  let crash = true;
  h.port.saveCheckpoint = async (update) => {
    const saved = update.plan as { phase?: string; tasks?: Array<{ id: string }> } | undefined;
    if (crash && saved?.phase === "tasks" && saved.tasks?.[0]?.id === "first") {
      crash = false;
      throw new Error("crash after host receipt, before plan commit");
    }
    await save(update);
  };
  assert.equal((await executeStudioGroup(group, "Deliver", true, "", h.port)).status, "failed");
  h.pending.push({ id: "m2", text: "Also include schema" });
  assert.equal((await executeStudioGroup(group, "Deliver", true, "", h.port)).status, "succeeded");
  assert.equal(plans, 2, "stored host receipt is reused for the frozen first batch");
  assert.deepEqual(h.acknowledgements, [["m1"], ["m2"]]);
  assert.equal(
    h.calls.some((step) => step.id.endsWith(":first")),
    false,
  );
});

test("steering accepted during completion checkpoint persistence is handled before returning", async () => {
  const h = steeringHarness(async (step) => {
    if (step.id.includes(":plan:")) return plan("original");
    if (step.id.includes(":steering:")) return correction("new");
    return step.id.includes(":review:") ? complete() : success("done");
  });
  const save = h.port.saveCheckpoint;
  let injected = false;
  h.port.saveCheckpoint = async (update) => {
    await save(update);
    if (!injected && (update.plan as { phase?: string } | undefined)?.phase === "complete") {
      injected = true;
      h.pending.push({ id: "m1", text: "One more required deliverable" });
    }
  };
  assert.equal((await executeStudioGroup(group, "Deliver", true, "", h.port)).status, "succeeded");
  assert.equal(
    h.calls.some((step) => step.id.endsWith(":new")),
    true,
  );
  assert.deepEqual(h.acknowledgements, [["m1"]]);
});

test("long steering queues are processed in batches without growing checkpoint history", async () => {
  let revisions = 0;
  const h = steeringHarness(async (step) => {
    if (step.id.includes(":plan:")) {
      for (let i = 0; i < 80; i++) h.pending.push({ id: `m${i}`, text: `Requirement ${i}` });
      return plan("old");
    }
    if (step.id.includes(":steering:")) return correction(`new-${++revisions}`);
    return step.id.includes(":review:") ? complete() : success("done");
  });
  assert.equal((await executeStudioGroup(group, "Deliver", true, "", h.port)).status, "succeeded");
  assert.ok(revisions > 1);
  assert.equal(h.acknowledgements.flat().length, 80);
  assert.equal(new Set(h.acknowledgements.flat()).size, 80);
  assert.ok(JSON.stringify(h.port.checkpoint.plan).length < 1500);
  assert.equal(h.calls.filter((step) => step.id.includes(":task:")).length, 1);
});

test("one member's unstarted queue stays outside the kernel until steering is checked", async () => {
  const writer = deferred<StudioStepResult>();
  const started = deferred<void>();
  const h = steeringHarness(async (step) => {
    if (step.id.includes(":plan:"))
      return success(JSON.stringify({ tasks: [...tasks("writer"), ...tasks("old-next")] }));
    if (step.id.endsWith(":writer")) {
      started.resolve();
      return writer.promise;
    }
    if (step.id.includes(":steering:")) return correction("new");
    return step.id.includes(":review:") ? complete() : success("done");
  });
  const work = executeStudioGroup(group, "Deliver", true, "", h.port);
  await started.promise;
  h.pending.push({ id: "m1", text: "Replace the next task" });
  writer.resolve(success("written"));
  assert.equal((await work).status, "succeeded");
  assert.equal(
    h.calls.some((step) => step.id.endsWith(":old-next")),
    false,
  );
});
