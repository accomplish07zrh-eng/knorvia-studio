import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  entry,
  summary,
  baselineSummary,
  summaryDeclaration,
  baseline,
  cases,
  direct,
  executor,
  json,
  publicDeclaration,
  sha,
  handlers,
  createToolRegistry,
  executorFixture,
  normalized,
  clock,
  gate,
  detail,
} from "./workflow-run-summary-fixture.js";
import { edges, edge } from "./workflow-run-summary-settlement-fixture.js";
import {
  summaryCases,
  throwingCases,
  observeSummary,
  changing,
} from "./workflow-run-summary-facts-fixture.js";
const gold = JSON.parse(
  await readFile(new URL("./workflow-run-summary-contract.json", import.meta.url), "utf8"),
);
const digest = (v: any) => sha(JSON.stringify(v));
test("Workflow summary consumer public declarations/metadata/schema identity and supported registry", () => {
  assert.equal(publicDeclaration, gold.declaration);
  assert.equal(summaryDeclaration, gold.summaryDeclaration);
  assert.deepEqual(
    json({
      ...entry,
      handler: undefined,
      formatModelContent: undefined,
      runtimeInputSchema: undefined,
      runtimeOutputSchema: undefined,
    }),
    gold.metadata,
  );
  for (const key of ["inputSchema", "outputSchema", "runtimeInputSchema", "runtimeOutputSchema"])
    assert.equal(entry[key], baseline[key]);
  for (const enabled of [false, true]) {
    const registry = createToolRegistry();
    handlers.registerBuiltInTools(registry, { includeDynamicWorkflow: enabled });
    assert.equal(registry.has("GetWorkflowRun"), enabled);
    if (enabled) assert.equal(registry.get("GetWorkflowRun"), entry);
  }
});
test("Workflow summary consumer frozen direct getter/effect/error/model content contracts", async () => {
  assert.deepEqual(await direct({}), gold.ordinary);
  for (const [i, c] of cases.entries()) {
    const old = await direct(c, baseline),
      current = await direct(c);
    assert.equal(digest(old), gold.directDigests[i], `baseline:${i}`);
    assert.deepEqual(current, old, `current:${i}`);
  }
});
test("Workflow summary consumer actual executor approval/metadata/events/telemetry and malformed ports", async () => {
  const cases = [
    {},
    { port: "missing" },
    { outcome: undefined },
    { port: "throw" },
    { port: "reject" },
    { port: "queued" },
    { port: "double" },
    { port: "early" },
    { port: "deny" },
    { input: { run_id: "" } },
  ];
  for (const [i, c] of cases.entries()) {
    const old = await executor(c, baseline);
    assert.equal(digest(old), gold.executorDigests[i], `baseline:${i}`);
    assert.deepEqual(await executor(c), old, `current:${i}`);
  }
});
test("Workflow summary consumer actual deadline/full call-runner completion-edge settlement", async () => {
  for (const [i, c] of edges.entries()) {
    const old = await edge(baseline, c);
    assert.equal(digest(old), gold.edgeDigests[i], `baseline:${i}`);
    assert.deepEqual(await edge(entry, c), old, `current:${i}`);
  }
  for (const driver of ["deadline", "executor"]) {
    const c = { driver, stage: "detail.artifacts", flavor: "sync", depth: 2 };
    assert.deepEqual(await edge(entry, c, true), await edge(baseline, c, true));
  }
});
async function delayed(selected: any, stale: boolean) {
  return clock(async () => {
    const first = executorFixture({}, selected),
      second = executorFixture({}, selected),
      entered = gate(),
      release = gate<any>();
    let calls = 0;
    const port = {
      getRunDetail(this: any) {
        assert.equal(this, port);
        calls++;
        if (calls === 1) {
          entered.resolve();
          return release.promise;
        }
        return { ...detail, result: "synthetic-second" };
      },
    };
    first.deps.dynamicWorkflowRunPort = second.deps.dynamicWorkflowRunPort = port as any;
    const pending = first.execute();
    await entered.promise;
    if (stale) first.d.controller.abort("Synthetic stale completion");
    const current = await second.execute();
    assert.equal(current.success, true);
    if (!stale) release.resolve(detail);
    const old = await pending;
    if (stale) release.resolve(detail);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(first.terminal().length, 1);
    assert.equal(second.terminal().length, 1);
    return { calls, first: normalized(first, old), second: normalized(second, current) };
  });
}
test("Workflow summary consumer concurrent/stale completion remains owned by existing executor", async () => {
  for (const stale of [false, true])
    assert.deepEqual(await delayed(entry, stale), await delayed(baseline, stale));
});
test("Workflow summary consumer changing nested getters/custom maps and repeated snapshots", async () => {
  async function observation(selected: any) {
    return clock(async () => {
      const tape: any[] = [],
        snapshot: any = { ...detail };
      let usageReads = 0,
        calls = 0;
      Object.defineProperty(snapshot, "usage", {
        get() {
          usageReads++;
          tape.push("usage");
          return {
            ...detail.usage,
            spentTokens: usageReads,
            nodesObserved: usageReads,
            nodesRunning: usageReads,
            nodesCompleted: usageReads,
            nodesFailed: usageReads,
          };
        },
      });
      for (const key of ["stopReason", "maxConcurrency", "subagentModel"])
        Object.defineProperty(snapshot, key, {
          get() {
            tape.push(key);
            return detail[key];
          },
        });
      for (const key of ["actors", "logTail"]) {
        const raw = detail[key];
        snapshot[key] = {
          map(this: any, fn: any) {
            assert.equal(this, snapshot[key]);
            tape.push([key, fn.length, fn.name]);
            return raw.map(fn);
          },
        };
      }
      const context: any = {
        workingDirectory: ".",
        dynamicWorkflowRunPort: {
          getRunDetail() {
            calls++;
            return snapshot;
          },
        },
      };
      const first = await selected.handler({ run_id: "synthetic-run" }, context),
        second = await selected.handler({ run_id: "synthetic-run" }, context);
      assert.equal(calls, 2);
      assert.equal(usageReads, 10);
      return { first: json(first), second: json(second), tape };
    });
  }
  assert.deepEqual(await observation(entry), await observation(baseline));
});

test("Workflow summary frozen sentence/UTF-16/getter/malformed facts", () => {
  for (const [i, c] of [...summaryCases, ...throwingCases].entries()) {
    const old = observeSummary(c, baselineSummary);
    assert.equal(digest(old), gold.summaryDigests[i], `baseline:${i}`);
    assert.deepEqual(observeSummary(c), old, `current:${i}`);
    if (old.success) assert.ok(old.text.length <= 400);
  }
  assert.deepEqual(changing(summary), changing(baselineSummary));
});
test("Workflow summary evaluates dropped optional getters and preserves native method receiver", () => {
  function observation(selected: any) {
    const tape: any[] = [];
    const phases: any = [{ name: "x".repeat(600), state: "current" }];
    phases.findIndex = function (this: any, callback: any) {
      assert.equal(this, phases);
      tape.push(["findIndex", callback.length, callback.name]);
      return Array.prototype.findIndex.call(this, callback);
    };
    const input: any = { ...detail, generatedAt: 60000, phases };
    Object.defineProperty(input, "ownedByThisSession", {
      get() {
        tape.push("discarded ownership");
        throw new Error("Synthetic discarded clause failure");
      },
    });
    try {
      return { text: selected(input), tape };
    } catch (error: any) {
      return { name: error.name, message: error.message, tape };
    }
  }
  const old = observation(baselineSummary);
  assert.deepEqual(observation(summary), old);
  assert.deepEqual(old.tape, [["findIndex", 1, ""], "discarded ownership"]);
});
