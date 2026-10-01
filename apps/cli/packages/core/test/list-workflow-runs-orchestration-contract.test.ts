import { edge, edgeCases } from "./list-workflow-runs-orchestration-settlement-fixture.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  entry,
  baseline,
  cases,
  direct,
  executor,
  registry,
  json,
  publicDeclaration,
  executorFixture,
  normalized,
  clock,
  gate,
  row,
} from "./list-workflow-runs-orchestration-fixture.js";
const frozen = JSON.parse(
  await readFile(
    new URL("./list-workflow-runs-orchestration-contract.json", import.meta.url),
    "utf8",
  ),
);
test("ListWorkflowRuns public declarations, schemas, metadata and registry remain frozen", () => {
  assert.equal(publicDeclaration, frozen.declaration);
  assert.deepEqual(
    json({
      ...entry,
      handler: undefined,
      formatModelContent: undefined,
      runtimeInputSchema: undefined,
      runtimeOutputSchema: undefined,
    }),
    frozen.metadata,
  );
  assert.deepEqual(registry(), frozen.registry);
  assert.equal(entry.runtimeInputSchema, baseline.runtimeInputSchema);
  assert.equal(entry.runtimeOutputSchema, baseline.runtimeOutputSchema);
  assert.equal(entry.inputSchema, baseline.inputSchema);
  assert.equal(entry.outputSchema, baseline.outputSchema);
});
test("ListWorkflowRuns frozen direct admission/getter/request/projection failures", async () => {
  for (const [i, c] of cases.entries()) {
    assert.deepEqual(await direct(c, baseline), frozen.directFacts[i], `baseline:${c.label}`);
    assert.deepEqual(await direct(c), frozen.directFacts[i], c.label);
  }
});
test("ListWorkflowRuns frozen complete executor permissions, metadata, events and telemetry", async () => {
  for (const [i, c] of frozen.executorCases.entries()) {
    assert.deepEqual(await executor(c, baseline), frozen.executorFacts[i], `baseline:${i}`);
    assert.deepEqual(await executor(c), frozen.executorFacts[i], `current:${i}`);
  }
});
test("ListWorkflowRuns completion-edge abort settlement through real owners", async () => {
  for (const [i, c] of edgeCases.entries()) {
    assert.deepEqual(
      await edge(baseline, c.driver, c.stage, c.depth, c.flavor),
      frozen.edgeFacts[i],
      `baseline:${i}`,
    );
    assert.deepEqual(
      await edge(entry, c.driver, c.stage, c.depth, c.flavor),
      frozen.edgeFacts[i],
      `current:${i}`,
    );
  }
});
test("ListWorkflowRuns early abort controls", async () => {
  for (const driver of ["deadline", "executor"])
    assert.deepEqual(
      await edge(entry, driver, "result.complete", 2, "sync", true),
      await edge(baseline, driver, "result.complete", 2, "sync", true),
    );
});
async function delayed(selected: any, stale: boolean) {
  return clock(async () => {
    const first = executorFixture({}, selected),
      second = executorFixture({}, selected),
      entered = gate(),
      release = gate<any>();
    let count = 0;
    const port = {
      listRuns(this: any, ...args: any[]) {
        assert.equal(this, port);
        assert.equal(args.length, 1);
        count++;
        if (count === 1) {
          entered.resolve();
          return release.promise;
        }
        return { runs: [{ ...row, runId: "synthetic-second" }] };
      },
    };
    first.deps.dynamicWorkflowRunPort = second.deps.dynamicWorkflowRunPort = port as any;
    let settled = false;
    const pending = first.execute().then((r: any) => {
      settled = true;
      return r;
    });
    await entered.promise;
    assert.equal(settled, false);
    if (stale) first.d.controller.abort("Synthetic stale");
    const current = await second.execute();
    assert.equal(current.success, true);
    if (!stale) release.resolve({ runs: [row] });
    const initial = await pending;
    if (stale) release.resolve({ runs: [row] });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(first.terminal().length, 1);
    assert.equal(second.terminal().length, 1);
    return { count, initial: normalized(first, initial), current: normalized(second, current) };
  });
}
test("ListWorkflowRuns concurrent calls and late stale results retain executor ownership", async () => {
  for (const stale of [false, true])
    assert.deepEqual(await delayed(entry, stale), await delayed(baseline, stale));
});
test("ListWorkflowRuns repeated calls have no cache or retained derived state", async () => {
  for (const selected of [baseline, entry]) {
    let count = 0;
    const context: any = {
      workingDirectory: "synthetic-project",
      dynamicWorkflowRunPort: {
        listRuns() {
          count++;
          return { runs: [{ ...row, spentTokens: count }] };
        },
      },
    };
    const first = await selected.handler({}, context),
      second = await selected.handler({}, context);
    assert.equal(count, 2);
    assert.equal(first.runs[0].spentTokens, 1);
    assert.equal(second.runs[0].spentTokens, 2);
  }
});
test("ListWorkflowRuns sparse/custom map receiver and optional getter compatibility", async () => {
  for (const mode of ["sparse", "custom", "swap", "primitive-reject"]) {
    async function observe(selected: any) {
      const tape: any[] = [];
      const values: any = { ...row };
      for (const key of ["stopReason", "resumedFrom", "supersededBy"])
        Object.defineProperty(values, key, {
          get() {
            tape.push(key);
            return tape.filter((k) => k === key).length === 1
              ? "synthetic-first"
              : "synthetic-second";
          },
        });
      const runs: any = mode === "sparse" ? Array(3) : [values];
      if (mode === "sparse") runs[1] = values;
      if (mode === "custom")
        runs.map = function (this: any, fn: any) {
          assert.equal(this, runs);
          tape.push([fn.length, fn.name]);
          return [fn(values)];
        };
      const port: any = {};
      let read = 0;
      Object.defineProperty(port, "listRuns", {
        get() {
          read++;
          tape.push("method");
          return mode === "swap" && read === 1
            ? () => {
                throw new Error("Guard function must never run");
              }
            : function (this: any, ...args: any[]) {
                assert.equal(this, port);
                tape.push(args[0]);
                if (mode === "primitive-reject") return Promise.reject("Synthetic primitive");
                return { runs };
              };
        },
      });
      try {
        return {
          output: json(
            await selected.handler(
              {},
              { workingDirectory: "synthetic-project", dynamicWorkflowRunPort: port },
            ),
          ),
          tape,
        };
      } catch (error) {
        return { error: typeof error === "string" ? error : (error as Error).message, tape };
      }
    }
    assert.deepEqual(await observe(entry), await observe(baseline), mode);
  }
});
