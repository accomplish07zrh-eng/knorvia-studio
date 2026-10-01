import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CoreErrorType } from "@knorvia/contracts";
import { fixturePermissionBroker } from "./permission-client-fixture.js";
import { gate } from "./tool-invocation-fixture.js";
import { executorCases } from "./plan-mode-cases.js";
import {
  clock,
  createToolRegistry,
  entryFor,
  executorFixture,
  handlers,
  module,
  observeExecutor,
  PermissionService,
  resolveRuntimePermissionCapability,
  validPlan,
} from "./plan-mode-fixture.js";
const frozen = JSON.parse(
  await readFile(new URL("./plan-mode-contract.json", import.meta.url), "utf8"),
);

test("real built-in registry preserves descriptions, handler identities and provider contracts", () => {
  for (const embeddedSearchEnabled of [false, true]) {
    const registry = createToolRegistry();
    handlers.registerBuiltInTools(registry, {
      allowedTools: ["EnterPlanMode", "ExitPlanMode"],
      embeddedSearchEnabled,
    });
    const enter = registry.get("EnterPlanMode"),
      exit = registry.get("ExitPlanMode");
    assert.equal(enter.handler, module.enterPlanModeToolEntry.handler);
    assert.equal(exit, module.exitPlanModeToolEntry);
    assert.equal(enter.metadata.description, frozen.descriptions[embeddedSearchEnabled ? 1 : 0]);
    const contracts = registry.toContracts();
    assert.deepEqual(
      contracts.map((c: any) => c.name),
      ["EnterPlanMode", "ExitPlanMode"],
    );
    assert.equal(contracts[1].permission, exit.permission);
    assert.equal(contracts[1].requiresUserInteraction, true);
    assert.equal(contracts[1].executionMode, undefined);
    assert.equal(contracts[1].providerNative, undefined);
    assert.deepEqual(
      JSON.parse(
        JSON.stringify({
          keys: contracts.map((contract: object) => Object.keys(contract)),
          contracts,
        }),
      ),
      frozen.registryContracts[embeddedSearchEnabled ? 1 : 0],
    );
  }
});
test("actual source/strict emitted executor preserves approval, error, event and trace observations", async () => {
  await clock(async () => {
    for (const [index, { c, decision }] of executorCases.entries())
      assert.deepEqual(
        await observeExecutor(c, decision),
        frozen.executor[index].observed,
        c.label,
      );
  });
});
test("permission policy keeps enter admission and active exit interaction/deny in every mode", () => {
  for (const mode of ["build", "edit", "plan", "yolo", "auto"])
    for (const enabled of [true, false, undefined])
      for (const hardDeny of [false, true]) {
        const service = new PermissionService({
          allowedTools: new Set(),
          disallowedTools: new Set(hardDeny ? ["EnterPlanMode", "ExitPlanMode"] : []),
          autoApproveHighRisk: false,
          allowMediumRiskInAutoMode: false,
        });
        for (const operation of ["enter", "exit"] as const) {
          const entry = entryFor(operation),
            input = operation === "enter" ? {} : { plan: validPlan };
          const result = service.checkPermission(
            { toolName: entry.metadata.name, input, mode, planEnabled: enabled },
            resolveRuntimePermissionCapability(entry, input, {
              workingDirectory: ".",
              workspaceRoot: ".",
              runtimeScope: "main",
            }),
          );
          assert.equal(
            result.decision,
            operation === "enter"
              ? "allow"
              : !(enabled ?? mode === "plan") || hardDeny
                ? "deny"
                : "ask",
            `${operation}/${mode}/${enabled}/${hardDeny}`,
          );
        }
      }
  const service = new PermissionService();
  assert.equal(
    service.checkPermission(
      { mode: "plan", toolName: "SyntheticWrite", input: {} },
      { readOnly: false, destructive: false, sideEffectScope: "workspace", needsApproval: false },
    ).decision,
    "deny",
  );
});
test("approved exit waits for synthetic approval; rejection produces no write or transition", async () => {
  await clock(async () => {
    const f = executorFixture({ label: "pending approval" }),
      entered = gate(),
      release = gate();
    f.deps.permissionBroker = fixturePermissionBroker(async (request) => {
      assert.equal(request.input.plan, validPlan);
      entered.resolve();
      await release.promise;
      return { decision: "allow" };
    });
    const pending = f.execute();
    await entered.promise;
    assert.deepEqual(f.direct.writes, []);
    assert.equal(
      f.direct.calls.some((c) => c.phase === "exit"),
      false,
    );
    release.resolve();
    assert.equal((await pending).success, true);
    assert.equal(f.direct.writes.length, 1);
    const denied = executorFixture({ label: "denied" }, "deny");
    const result = await denied.execute();
    assert.equal(result.error.type, CoreErrorType.PermissionDenied);
    assert.equal(result.turnControl.reason, "plan_exit_denied");
    assert.deepEqual(denied.direct.writes, []);
    assert.equal(
      denied.direct.calls.some((c) => c.phase === "exit"),
      false,
    );
  });
});
test("denied approval feedback retains model text and follow-up metadata without effects", async () => {
  const f = executorFixture({ label: "feedback" });
  f.deps.permissionBroker = fixturePermissionBroker(async () => ({
    decision: "deny",
    reason: "Synthetic plan feedback",
    reasonSource: "plan_approval_feedback",
  }));
  const result = await f.execute();
  assert.equal(result.success, false);
  assert.deepEqual(result.followUpUserInput, {
    input: "Synthetic plan feedback",
    reasonSource: "plan_approval_feedback",
  });
  assert.equal(result.modelContent, "The plan was not approved by the user.");
  assert.deepEqual(f.direct.writes, []);
});
test("pre-cancellation and schema/hook rejection remain before effects and approval", async () => {
  const controller = new AbortController();
  controller.abort();
  const f = executorFixture({ label: "preabort" });
  assert.equal(
    (await f.execute({ signal: controller.signal })).error.type,
    CoreErrorType.ToolCancelled,
  );
  assert.deepEqual(f.direct.writes, []);
  assert.deepEqual(f.approvals, []);
  for (const reason of ["schema", "hook"]) {
    const f = executorFixture({ label: reason });
    if (reason === "schema") f.call.input = { plan: "" };
    else f.behavior.hook = async () => ({ additionalContexts: [], permissionBehavior: "deny" });
    assert.equal((await f.execute()).success, false);
    assert.deepEqual(f.direct.writes, []);
    assert.deepEqual(f.approvals, []);
  }
});
test("executor cancellation during synthetic persistence aborts signal and prevents late exit", async () => {
  const f = executorFixture({ label: "pending write" }),
    entered = gate(),
    release = gate();
  let signal: AbortSignal | undefined;
  f.direct.fs.writeTextFile = async (_request, options) => {
    signal = options?.signal;
    entered.resolve();
    await release.promise;
    throw new Error("Synthetic interrupted persistence");
  };
  const controller = new AbortController(),
    pending = f.execute({ signal: controller.signal });
  await entered.promise;
  controller.abort();
  assert.equal((await pending).error.type, CoreErrorType.ToolCancelled);
  assert.equal(signal?.aborted, true);
  release.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    f.direct.calls.some((c) => c.phase === "exit"),
    false,
  );
});
test("executor deadline retains 30-second budget while synthetic transition is pending", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1736942400000 });
  const f = executorFixture({ label: "deadline", operation: "enter" }),
    entered = gate(),
    release = gate();
  f.direct.port.enterPlanMode = async () => {
    entered.resolve();
    await release.promise;
    return { mode: "build", previousMode: "build", planEnabled: true, previousPlanEnabled: false };
  };
  const pending = f.execute();
  await entered.promise;
  t.mock.timers.tick(30001);
  assert.equal((await pending).error.type, CoreErrorType.ToolTimeout);
  release.resolve();
  await new Promise((resolve) => setImmediate(resolve));
});
