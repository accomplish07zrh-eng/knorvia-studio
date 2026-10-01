// Actual executor and policy readers, with synthetic ports and approvals only.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AutomationCreateLimitError, CoreErrorType, SessionEventType } from "@knorvia/contracts";
import { gate } from "./tool-invocation-fixture.js";
import {
  entries,
  executions,
  executorFixture,
  loopPolicy,
  observeExecution,
  PermissionService,
  resolveRuntimePermissionCapability,
  servicePolicy,
  valid,
  timeout,
} from "./cron-fixture.js";
const frozen = JSON.parse(await readFile(new URL("./cron-contract.json", import.meta.url), "utf8"));
test("actual executor freezes all operation/turn combinations, traces, hooks and model content", async () => {
  for (const [index, c] of executions.entries())
    assert.deepEqual(await observeExecution(c), frozen.executions[index].observed);
  for (const operation of Object.keys(entries) as (keyof typeof entries)[]) {
    const f = executorFixture(operation);
    assert.equal(
      (await f.execute({ offPeakTurn: true, traceContext: { traceId: "example-cron-trace" } }))
        .success,
      true,
    );
    assert.equal(f.observed.contexts[0].traceId, "example-cron-trace");
    assert.equal(f.observed.contexts[0].sessionId, "fixture-session");
    assert.equal(f.direct.calls.length, 1);
  }
});
test("actual permission/approval metadata preserves mode and hard/project denial matrix", () => {
  for (const [operation, entry] of Object.entries(entries))
    for (const mode of ["build", "plan", "auto", "yolo"])
      for (const denial of ["none", "hard", "project"]) {
        const service = new PermissionService({
          allowedTools: new Set(),
          disallowedTools: new Set(denial === "hard" ? [entry.metadata.name] : []),
          autoApproveHighRisk: false,
          allowMediumRiskInAutoMode: false,
        });
        const decision = service.checkPermission(
          {
            mode,
            toolName: entry.metadata.name,
            input: valid[operation as keyof typeof valid],
            riskLevel: operation === "list" ? "low" : "medium",
          },
          resolveRuntimePermissionCapability(entry, valid[operation as keyof typeof valid], {
            workingDirectory: ".",
            workspaceRoot: ".",
            runtimeScope: "main",
          }),
          denial === "project"
            ? { version: 1, deny: [{ toolName: entry.metadata.name }] }
            : undefined,
        );
        const expected =
          mode === "yolo"
            ? "allow"
            : mode === "auto" || denial !== "none" || (mode === "plan" && operation !== "list")
              ? "deny"
              : operation === "list"
                ? "allow"
                : "ask";
        assert.equal(decision.decision, expected, `${operation}/${mode}/${denial}`);
      }
});
test("executor schema precedes automation guard; hooks/policy/broker refusal have no effects", async () => {
  for (const operation of Object.keys(entries) as (keyof typeof entries)[])
    for (const variant of ["schema", "hook", "policy", "user"]) {
      const f = executorFixture(operation);
      if (variant === "schema") f.call.input = { extra: true };
      if (variant === "hook")
        f.behavior.hook = async () => ({ additionalContexts: [], permissionBehavior: "deny" });
      if (variant === "policy") f.behavior.decision = "deny";
      if (variant === "user") {
        f.behavior.decision = "ask";
        f.behavior.reply = { decision: "deny", reason: "example refusal" };
      }
      const result = await f.execute({ automationTurn: true });
      assert.equal(result.success, false);
      assert.deepEqual(f.direct.calls, []);
      assert.equal(f.observed.inputs.length, 0);
      assert.equal(
        result.error?.type,
        variant === "schema" ? CoreErrorType.ToolExecutionFailed : CoreErrorType.PermissionDenied,
      );
    }
});
test("synthetic approval and malformed output preserve real executor event boundaries", async () => {
  for (const operation of Object.keys(entries) as (keyof typeof entries)[]) {
    const f = executorFixture(operation);
    f.behavior.decision = "ask";
    const result = await f.execute();
    assert.equal(result.success, true);
    assert.ok(f.timeline.includes("broker"));
    assert.equal(f.direct.calls.length, 1);
    assert.ok(f.events.some((e) => e.type === SessionEventType.ToolCallResult));
    const bad = executorFixture(operation);
    bad.direct.behavior.result = {};
    bad.direct.behavior.list = [{}];
    bad.direct.behavior.deleted = "invalid";
    const rejected = await bad.execute();
    assert.equal(rejected.success, false);
    assert.equal(bad.direct.calls.length, 1);
    assert.ok(!bad.events.some((e) => e.type === SessionEventType.ToolCallResult));
  }
});
test("create limit stops current turn and hides recovery suggestions only for CronCreate", async () => {
  for (const operation of Object.keys(entries) as (keyof typeof entries)[]) {
    const f = executorFixture(operation);
    f.direct.behavior.failure = new AutomationCreateLimitError(
      "AUTOMATION_CREATE_LIMIT_REACHED Delete an example task",
    );
    const result = await f.execute();
    assert.equal(result.success, false);
    assert.equal(f.direct.calls.length, 1);
    if (operation === "create") {
      assert.deepEqual(result.turnControl, {
        reason: "automation_create_limit",
        stopTurnAfterResult: true,
      });
      assert.match(result.modelContent!, /Do not list, delete, overwrite, retry/);
      assert.ok(!result.modelContent!.includes("Delete an example task"));
    } else assert.equal(result.turnControl, undefined);
  }
});
test("pre/pending cancellation is executor-owned for every operation without cleanup/retry calls", async () => {
  for (const operation of Object.keys(entries) as (keyof typeof entries)[]) {
    const closed = new AbortController(),
      before = executorFixture(operation);
    closed.abort();
    assert.equal(
      (await before.execute({ signal: closed.signal })).error?.type,
      CoreErrorType.ToolCancelled,
    );
    assert.deepEqual(before.direct.calls, []);
    const f = executorFixture(operation),
      entered = gate(),
      release = gate<any>();
    const original = f.direct.port[operation];
    (f.direct.port as any)[operation] = async function (...args: unknown[]) {
      entered.resolve();
      await release.promise;
      return original.apply(f.direct.port, args as never);
    };
    const parent = new AbortController(),
      pending = f.execute({ signal: parent.signal });
    await entered.promise;
    parent.abort();
    assert.equal((await pending).error?.type, CoreErrorType.ToolCancelled);
    release.resolve(undefined);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(f.direct.calls.length, 1);
  }
});
test("runtime/service automation and off-peak policy readers preserve separate mutation sets", () => {
  assert.deepEqual(
    [...loopPolicy.AUTOMATION_MUTATION_TOOL_NAMES],
    ["CronCreate", "CronUpdate", "CronDelete"],
  );
  assert.deepEqual(servicePolicy.mergeAutomationMutationToolDenylist(["Read", "Read"]), [
    "Read",
    "CronCreate",
    "CronUpdate",
    "CronDelete",
  ]);
  assert.ok(
    !servicePolicy
      .mergeOffPeakMutationToolDenylist([])
      .some((name: string) => name.startsWith("Cron")),
  );
  for (const [extra, restricted] of [
    [{ automationId: " example-id " }, true],
    [{ turnTraceContext: { queryId: "automation-example" } }, true],
    [{ toolDisallowlist: ["CronUpdate"] }, false],
    [{ toolDisallowlist: ["CronCreate", "CronUpdate", "CronDelete"] }, true],
    [{ offPeakTaskId: "example-idle" }, false],
    [{ automationId: " " }, false],
  ] as const)
    assert.equal(
      loopPolicy.isAutomationMutationRestrictedTurn({ turnTraceContext: {}, ...extra }),
      restricted,
    );
});

test("actual executor retains 30000ms deadline and ignores call override for every operation", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 123000 });
  for (const operation of Object.keys(entries) as (keyof typeof entries)[]) {
    assert.equal(
      timeout.resolveTimeoutMs(entries[operation], { timeout_ms: 1, timeout: 1 }, 1),
      30000,
    );
    const f = executorFixture(operation),
      entered = gate(),
      release = gate<any>();
    const original = f.direct.port[operation];
    (f.direct.port as any)[operation] = async function (...args: unknown[]) {
      entered.resolve();
      await release.promise;
      return original.apply(f.direct.port, args as never);
    };
    let settled = false;
    const pending = f.execute().then((result) => {
      settled = true;
      return result;
    });
    await entered.promise;
    t.mock.timers.tick(29999);
    await Promise.resolve();
    assert.equal(settled, false);
    t.mock.timers.tick(1);
    const result = await pending;
    assert.equal(result.error?.type, CoreErrorType.ToolTimeout);
    assert.match(result.error!.message, /30000ms/);
    release.resolve(undefined);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(f.direct.calls.length, 1);
  }
});
