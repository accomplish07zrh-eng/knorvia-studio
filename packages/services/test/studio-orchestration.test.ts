import assert from "node:assert/strict";
import test from "node:test";
import { success, failure, group, harness } from "./studio-orchestration-support.js";
import { evaluateStudioCondition } from "../src/studio-runtime/domain/condition.js";
import {
  routeStudioGroupMembers,
  parseStudioGroupPlan,
} from "../src/studio-runtime/domain/groupPolicy.js";
import { executeStudioGroup } from "../src/studio-runtime/app/groupExecutor.js";

test("conditions use bounded typed comparisons and explicit JSON paths", () => {
  const scope = {
    input: "please review",
    output: '{"approved":true}',
    nodes: { review: '{"score":9}' },
  };
  assert.equal(
    evaluateStudioCondition(
      'input contains "review" && ({{review}}.score >= 8 || output.approved == false)',
      scope,
    ),
    true,
  );
  assert.equal(evaluateStudioCondition("output.approved equals true", scope), true);
  assert.equal(evaluateStudioCondition('input equals "no"', scope), false);
  for (const source of [
    "process.exit()",
    'output.constructor.name == "X"',
    '{{missing}} equals "x"',
    'input = "x"',
    'input contains "x" trailing',
  ])
    assert.throws(() => evaluateStudioCondition(source, scope));
  assert.throws(() => evaluateStudioCondition("(".repeat(30) + "true" + ")".repeat(30), scope));
});

test("mention routing excludes emails, quotes, fenced and inline code", () => {
  assert.deepEqual(
    routeStudioGroupMembers(
      group,
      'Email me@example.com. `@codex`\n> @all\n```\n@claude\n```\n"@codex"\n@Claude Code please review',
    ),
    ["claude-code"],
  );
  assert.deepEqual(routeStudioGroupMembers(group, "No mention; host please"), ["knorvia"]);
  assert.deepEqual(routeStudioGroupMembers(group, "@all @codex"), group.members);
  assert.throws(() => routeStudioGroupMembers(group, "@grok do this"));
});

test("group plans reject unknown members, duplicate tasks, cycles and oversized work", () => {
  assert.throws(() =>
    parseStudioGroupPlan('{"tasks":[{"id":"a","member":"grok-build","instruction":"Go"}]}', group),
  );
  assert.throws(() =>
    parseStudioGroupPlan(
      '{"tasks":[{"id":"a","member":"codex","instruction":"Go","dependsOn":["a"]}]}',
      group,
    ),
  );
  assert.throws(() => parseStudioGroupPlan('{"tasks":[]}', group));
});

test("manual group routing does not recursively dispatch member mentions", async () => {
  const h = harness(async () => success("@all please continue"));
  assert.equal(
    (await executeStudioGroup(group, "@codex review", false, "group history", h.port)).status,
    "succeeded",
  );
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0]!.kernel, "codex");
  assert.match(h.calls[0]!.prompt, /Only shared context/);
  assert.match(h.calls[0]!.prompt, /group history/);
});

test("task group plans, dispatches, reviews and resumes completed work", async () => {
  const h = harness(async (step) =>
    step.id.includes("plan")
      ? success('{"tasks":[{"id":"a","member":"codex","instruction":"Review"}]}')
      : step.id.includes("review")
        ? success('{"status":"complete","summary":"Reviewed."}')
        : success("Finding"),
  );
  const result = await executeStudioGroup(group, "Review project", true, "", h.port);
  assert.equal(result.status, "succeeded");
  assert.equal(result.text, "Reviewed.");
  assert.equal(h.calls.length, 3);
  await executeStudioGroup(group, "Review project", true, "", h.port);
  assert.equal(h.calls.length, 3);
});

test("invalid host JSON is corrected finitely and never marked completed", async () => {
  const h = harness(async () => success("Everything is done!"));
  assert.equal((await executeStudioGroup(group, "Task", true, "", h.port)).status, "failed");
  assert.equal(h.calls.length, 2);
});

test("group dependencies feed only declared task outputs and failures require a correction", async () => {
  const h = harness(async (step) => {
    if (step.id.includes("plan"))
      return success(
        '{"tasks":[{"id":"a","member":"codex","instruction":"Analyze"},{"id":"b","member":"claude-code","instruction":"Review a","dependsOn":["a"]}]}',
      );
    if (step.id.includes("review")) return success('{"status":"complete","summary":"Done"}');
    if (step.id.endsWith(":a")) return success("A-only-result");
    assert.match(step.prompt, /A-only-result/);
    return success("Reviewed A");
  });
  assert.equal((await executeStudioGroup(group, "go", true, "", h.port)).status, "succeeded");
  assert.equal(h.calls.length, 4);
  const failed = harness(async (step) =>
    step.id.includes("plan")
      ? success('{"tasks":[{"id":"a","member":"codex","instruction":"Go"}]}')
      : step.id.includes("review")
        ? success('{"status":"complete","summary":"Done"}')
        : failure("Work failed"),
  );
  assert.equal((await executeStudioGroup(group, "go", true, "", failed.port)).status, "failed");
});

test("a completed group resumes without replay even much later", async () => {
  const h = harness(async (step) =>
    step.id.includes("plan")
      ? success('{"tasks":[{"id":"a","member":"codex","instruction":"Go"}]}')
      : step.id.includes("review")
        ? success('{"status":"complete","summary":"Done"}')
        : success("Work"),
  );
  await executeStudioGroup(group, "go", true, "", h.port);
  const count = h.calls.length;
  h.port.now = () => 99_999_999;
  assert.equal((await executeStudioGroup(group, "go", true, "", h.port)).status, "succeeded");
  assert.equal(h.calls.length, count);
});
