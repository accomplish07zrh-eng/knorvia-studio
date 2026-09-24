import assert from "node:assert/strict";
import test from "node:test";
import { success, failure, group, harness } from "./studio-orchestration-support.js";
import { executeStudioGroup } from "../src/studio-runtime/app/groupExecutor.js";
import type { StudioStepResult } from "../src/studio-runtime/workflowTypes.js";

test("continuous group work completes after seven rounds and twenty-eight tasks without continue", async () => {
  const tasks = Array.from({ length: 4 }, (_, i) => ({
    id: `task-${i}`,
    member: "codex",
    instruction: `Deliver item ${i}`,
  }));
  let reviews = 0;
  const h = harness(async (step) => {
    if (step.id.includes("plan")) return success(JSON.stringify({ tasks }));
    if (step.id.includes("review")) {
      reviews++;
      return success(
        JSON.stringify(
          reviews === 7
            ? { status: "complete", summary: "All twenty-eight deliverables verified." }
            : { status: "revise", summary: `Finish batch ${reviews + 1}`, tasks },
        ),
      );
    }
    // Long elapsed time must not turn into a hidden total task deadline.
    h.port.now = () => 99_999_999;
    return success(`Delivered ${step.id}`);
  });
  const result = await executeStudioGroup(group, "Deliver all items", true, "", h.port);
  assert.equal(result.status, "succeeded");
  assert.equal(h.port.checkpoint.completedRounds, 7);
  assert.equal(h.calls.filter((step) => step.id.includes(":task:")).length, 28);
  assert.equal(new Set(h.calls.map((step) => step.id)).size, h.calls.length);
  const count = h.calls.length;
  await executeStudioGroup(group, "Deliver all items", true, "", h.port);
  assert.equal(h.calls.length, count);
});

test("stop cancels all in-flight members, drains late results and never dispatches dependent work", async () => {
  const pending = new Map<string, (result: StudioStepResult) => void>();
  const aborted: string[] = [];
  const h = harness(async (step) => {
    if (step.id.includes("plan"))
      return success(
        JSON.stringify({
          tasks: [
            { id: "a", member: "codex", instruction: "Start A" },
            { id: "b", member: "claude-code", instruction: "Start B" },
            { id: "c", member: "codex", instruction: "Only after both", dependsOn: ["a", "b"] },
          ],
        }),
      );
    return new Promise((resolve) => {
      pending.set(step.id, resolve);
      step.signal?.addEventListener("abort", () => aborted.push(step.id), { once: true });
    });
  });
  let settled = false;
  const work = executeStudioGroup(group, "go", true, "", h.port).then((result) => {
    settled = true;
    return result;
  });
  for (let i = 0; i < 30 && pending.size < 2; i++) await Promise.resolve();
  assert.equal(pending.size, 2);
  h.controller.abort(new Error("User stopped"));
  assert.equal(aborted.length, 2);
  await Promise.resolve();
  assert.equal(settled, false, "must wait for adapter cancellation acknowledgement");
  const resolvers = [...pending.values()];
  resolvers[0]!({ status: "cancelled", text: "", resultKnown: true });
  await Promise.resolve();
  assert.equal(settled, false, "every branch must drain before return");
  resolvers[1]!(success("late success after stop"));
  assert.equal((await work).status, "cancelled");
  await Promise.resolve();
  assert.equal(h.calls.length, 3, "only plan plus the two started members");
  assert.equal(h.port.checkpoint.completedRounds, 0);
  assert.equal((await executeStudioGroup(group, "go", true, "", h.port)).status, "cancelled");
  assert.equal(h.calls.length, 3, "stale continuation cannot wake the stopped signal");
});

test("stop while receiving a revised host plan cannot begin another round", async () => {
  const tasks = [{ id: "a", member: "codex", instruction: "Work" }];
  const h = harness(async (step) => {
    if (step.id.includes("plan")) return success(JSON.stringify({ tasks }));
    if (step.id.includes("review")) {
      h.controller.abort();
      return success(JSON.stringify({ status: "revise", summary: "More work", tasks }));
    }
    return success("work");
  });
  assert.equal((await executeStudioGroup(group, "go", true, "", h.port)).status, "cancelled");
  assert.equal(h.calls.filter((step) => step.id.includes(":task:")).length, 1);
});

test("host review receives runtime-observed workspace evidence and must not rely on member prose", async () => {
  const h = harness(async (step) => {
    if (step.id.includes("plan"))
      return success('{"tasks":[{"id":"a","member":"codex","instruction":"Write report"}]}');
    if (step.id.includes("review")) {
      assert.match(step.prompt, /runtime-observed evidence/);
      assert.match(step.prompt, /success prose alone is not proof/);
      assert.match(step.prompt, /"workspacePath":"\/isolated\/codex"/);
      assert.match(step.prompt, /"changesSummary":"added report\.md"/);
      return success('{"status":"complete","summary":"Report file inspected."}');
    }
    return {
      ...success("Done"),
      workspacePath: "/isolated/codex",
      changesSummary: "added report.md",
    };
  });
  assert.equal((await executeStudioGroup(group, "go", true, "", h.port)).status, "succeeded");
});

test("non-retryable member failure ends the task without automatic replanning", async () => {
  const h = harness(async (step) => {
    if (step.id.includes("plan"))
      return success('{"tasks":[{"id":"a","member":"codex","instruction":"Work"}]}');
    return { ...failure("Login required"), retryable: false };
  });
  const result = await executeStudioGroup(group, "go", true, "", h.port);
  assert.equal(result.status, "failed");
  assert.equal(result.error, "Login required");
  assert.equal(h.calls.length, 2);
});
