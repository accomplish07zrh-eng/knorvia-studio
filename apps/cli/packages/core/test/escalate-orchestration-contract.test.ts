import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CoreErrorType, EscalateInputSchema, EscalateInputJsonSchema } from "@knorvia/contracts";
import {
  cases,
  getterCases,
  executorCases,
  validInput,
  refusal,
} from "./escalate-orchestration-cases.js";
import {
  archive,
  baseline,
  clock,
  entry,
  executorFixture,
  fixture,
  gate,
  json,
  observeDirect,
  observeExecutor,
  publicDeclaration,
  registryObservations,
  runtimeObservations,
  resolveTimeoutMs,
} from "./escalate-orchestration-fixture.js";
import {
  delayedObservation,
  settlement,
  settlementCases,
} from "./escalate-orchestration-settlement-fixture.js";
const frozen = JSON.parse(
  await readFile(new URL("./escalate-orchestration-contract.json", import.meta.url), "utf8"),
);
test("exact public declaration/schema identity and retained metadata/prose remain frozen", () => {
  assert.equal(publicDeclaration, frozen.declaration);
  assert.equal(entry.runtimeInputSchema, EscalateInputSchema);
  assert.equal(entry.inputSchema, EscalateInputJsonSchema);
  assert.equal(baseline.inputSchema, entry.inputSchema);
  assert.equal(archive.commit, "d6214b9059bd7e7bf95e26f19d2c47170e640a4e");
  for (const key of [
    "metadata",
    "inputSchema",
    "outputSchema",
    "permission",
    "resultBudget",
    "timeout",
    "cancellation",
    "trace",
    "capability",
  ])
    assert.deepEqual(json(entry[key]), frozen[key], key);
});
test("direct outputs, malformed values, thenables and error identities replay the pre-edit freeze", async () => {
  for (const [index, c] of cases.entries())
    assert.deepEqual(await observeDirect(c), frozen.direct[index].observed, c.label);
});
test("schema/port/method/trace/outcome getter order and failures replay frozen source", async () => {
  for (const [index, c] of getterCases.entries())
    assert.deepEqual(await observeDirect(c), frozen.getters[index].observed, c.label);
});
test("real registry and runtime presence gate retain filtering without runtimeScope substitution", () => {
  assert.deepEqual(json(registryObservations()), frozen.registry);
  assert.equal(entry.aliases, undefined);
  assert.deepEqual(runtimeObservations(), frozen.runtime);
  for (const row of frozen.runtime) assert.equal(row.registered, row.present);
  assert.equal(frozen.registry[0].registered, false);
  assert.equal(frozen.registry[2].registered, true);
  assert.equal(frozen.registry[3].registered, false);
  assert.equal(frozen.registry[6].registered, false);
});
test("actual executor preserves admission/errors/model content/events/telemetry and metadata", async () => {
  await clock(async () => {
    for (const [index, c] of executorCases.entries())
      assert.deepEqual(await observeExecutor(c), frozen.executor[index].observed, c.label);
  });
});
test("port swapping preserves second receiver and method lookup before argument construction", async () => {
  const f = fixture({ label: "swap", swap: "other" });
  await entry.handler(f.input, f.context);
  assert.equal(f.calls[0].secondReceiver, true);
  const old = await observeDirect({
    label: "method",
    probe: { target: "port.escalate", throwAt: 1 },
  });
  assert.equal(old.tape.includes("context.toolCallId"), false);
  assert.equal(old.fact.sameFailure, true);
});
test("refusal is an ordinary successful result and never ends the actor turn", async () => {
  await clock(async () => {
    const f = executorFixture({ label: "refused", outcome: refusal });
    const result = await f.execute();
    assert.equal(result.success, true);
    assert.equal(result.modelContent, refusal.message);
    assert.equal(result.turnControl, undefined);
    assert.equal(f.terminal()[0].name, "finishCompleted");
  });
});
test("repeat calls invoke the owned port once each without a cache or duplicate notification", async () => {
  const f = fixture();
  let count = 0;
  Object.defineProperty(f.port, "escalate", {
    value: function (this: unknown, request: any) {
      assert.equal(this, f.port);
      assert.equal(request.question, validInput.question);
      return { kind: "answered", answer: `synthetic ${++count}`, qid: `owned-${count}` };
    },
    configurable: true,
  });
  assert.equal(((await entry.handler(validInput, f.context)) as any).message, "synthetic 1");
  assert.equal(((await entry.handler(validInput, f.context)) as any).message, "synthetic 2");
  assert.equal(count, 2);
});
for (const driver of ["deadline", "executor"])
  test(`actual ${driver} completion-edge abort matches frozen and exact baseline`, async () => {
    let index = driver === "deadline" ? 0 : settlementCases.length;
    for (const c of settlementCases) {
      const current = await settlement(entry, driver, c.kind, c.flavor, c.stage, c.depth);
      assert.deepEqual(current, frozen.edges[index++].observed, JSON.stringify(c));
      assert.deepEqual(
        current,
        await settlement(baseline, driver, c.kind, c.flavor, c.stage, c.depth),
        `baseline/${JSON.stringify(c)}`,
      );
      assert.equal(current.fired, true);
      assert.equal(current.callCount, 1);
    }
  });
for (const driver of ["deadline", "executor"])
  test(`actual ${driver} early and uncancelled controls preserve the existing owner`, async () => {
    for (const kind of ["answered", "refused"])
      for (const early of [false, true]) {
        const current = await settlement(entry, driver, kind, "sync", "none", 0, early);
        assert.deepEqual(
          current,
          await settlement(baseline, driver, kind, "sync", "none", 0, early),
        );
        assert.equal(current.callCount, early ? 0 : 1);
        const result = driver === "deadline" ? current.observed : current.observed.result;
        assert.equal(result.success, !early);
        if (early) assert.equal(result.error.type, CoreErrorType.ToolCancelled);
      }
  });
test("delayed concurrent completion and stale cancelled answers preserve separate executor results", async () => {
  for (const [index, stale] of [false, true].entries()) {
    const current = await delayedObservation(entry, stale);
    assert.deepEqual(current, frozen.delayed[index].observed);
    assert.deepEqual(current, await delayedObservation(baseline, stale));
    assert.deepEqual(current.calls, ["synthetic-first", "synthetic-second"]);
    assert.equal(current.first.result.success, !stale);
    assert.equal(current.second.result.success, true);
    assert.equal(current.first.terminal.length, 1);
    assert.equal(current.second.terminal.length, 1);
  }
});
test("no-timeout policy remains no-timeout across the actual deadline resolver", () => {
  assert.equal(resolveTimeoutMs(entry, validInput, 1000), undefined);
  assert.deepEqual(entry.timeout, { kind: "none" });
});
test("actual executor keeps waiting across synthetic elapsed time until external cancellation", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.UTC(2026, 0, 15, 12) });
  const f = executorFixture({ label: "no-timeout waiting" }),
    entered = gate(),
    release = gate<any>();
  let settled = false;
  const port = {
    escalate(this: unknown) {
      assert.equal(this, port);
      entered.resolve();
      return release.promise;
    },
  };
  f.deps.workflowEscalatePort = port as any;
  const pending = f.execute().then((result: any) => {
    settled = true;
    return result;
  });
  await entered.promise;
  t.mock.timers.tick(3_600_001);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  f.direct.controller.abort("Synthetic no-timeout cancellation");
  assert.equal((await pending).error.type, CoreErrorType.ToolCancelled);
  release.resolve({ kind: "answered", answer: "synthetic stale answer", qid: "synthetic-late" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    f.terminal().map((item: any) => item.name),
    ["finishCancelled"],
  );
});
