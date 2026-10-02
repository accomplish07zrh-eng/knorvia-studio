import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const core = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, core), "utf8");
const sha = (text) => createHash("sha256").update(text).digest("hex");
const archiveText = await read("test/workflow-runtime-context-baseline.json");
assert.equal(sha(archiveText), "8fa862a70b17684ba6bf95f60035e7b5c8683233e85f70f810dbaabc1f97e0d9");
const archive = JSON.parse(archiveText);
for (const name of ["source", "compiled", "declaration"])
  assert.equal(sha(archive[name]), archive[`${name}Sha256`]);
const pinText = await read("test/workflow-runtime-context-current.json");
assert.equal(sha(pinText), "CURRENT_PIN");
async function select(reader = read) {
  for (const [path, hash] of Object.entries(JSON.parse(pinText).files))
    assert.equal(sha(await reader(path)), hash, path);
  return import(new URL("dist/workflow/expert/runtime-context.js", core));
}
const current = await select();
const text = archive.compiled.replace(
  /from "([^"]+)"/gu,
  (_, path) =>
    `from ${JSON.stringify(path.startsWith(".") ? new URL(`dist/workflow/expert/${path}`, core).href : import.meta.resolve(path))}`,
);
const historical = await import(
  `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`
);
const { createExpertWorkflowDefinition } = await import(
  new URL("dist/workflow/definition.js", core)
);
async function observe(Owner) {
  const records = [];
  let ticks = 0;
  const signal = new AbortController().signal;
  const store = {
    async appendGraphRecord(runId, record, options) {
      assert.equal(this, store);
      assert.equal(options.signal, signal);
      records.push([runId, record]);
    },
  };
  const deps = {
    definition: {
      ...createExpertWorkflowDefinition(),
      definitionId: "owned-definition",
      definitionVersion: "owned-version",
      phaseOrder: ["owned"],
      phases: [{ phase: "owned", title: "Owned", description: "Owned input", behavior: "agent" }],
    },
    agentRunner: {
      run() {
        throw new Error("Unused owned runner");
      },
    },
    store,
    createActivityId: () => "owned-activity",
    createRunId: () => "owned-run",
    now: () => new Date(ticks++ * 1000),
  };
  const ctx = new Owner(deps);
  assert.equal(ctx.store, store);
  assert.equal(ctx.agentRunner, deps.agentRunner);
  assert.equal(ctx.createRunId, deps.createRunId);
  assert.equal(ctx.now, deps.now);
  const snapshot = ctx.createInitialSnapshot({
    cwd: "owned",
    task: "Owned task",
    sessionId: "owned-session",
  });
  assert.equal(snapshot.definitionId, "owned-definition");
  assert.equal(snapshot.definitionVersion, "owned-version");
  assert.equal(snapshot.phaseOrder, ctx.definition.phaseOrder);
  assert.equal(snapshot.strategy, ctx.definition.strategy);
  await ctx.writeInitialGraph(snapshot, signal);
  assert.equal(records[0][1].definitionId, "owned-definition");
  assert.equal(records[0][1].definitionVersion, "owned-version");
  assert.equal(records[0][1].phaseOrder, snapshot.phaseOrder);
  assert.equal(records[0][1].strategy, snapshot.strategy);
  assert.equal(records[1][1].node, snapshot.graph.nodes[0]);
  return { snapshot: JSON.stringify(snapshot), records: JSON.stringify(records), ticks };
}
test("emitted context initialization preserves definition metadata in journal", async () => {
  assert.deepEqual(
    await observe(current.ExpertWorkflowRuntimeContext),
    await observe(historical.ExpertWorkflowRuntimeContext),
  );
  await assert.rejects(
    select(async (path) => (path.endsWith("runtime-context.js") ? "wrong" : read(path))),
    assert.AssertionError,
  );
  await assert.rejects(
    select(async (path) => {
      if (path.endsWith("runtime-context.js")) throw new Error("Owned missing artifact");
      return read(path);
    }),
    /Owned missing artifact/,
  );
});
