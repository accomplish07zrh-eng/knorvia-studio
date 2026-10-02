import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const core = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, core), "utf8");
const sha = (text) => createHash("sha256").update(text).digest("hex");
const archiveText = await read("test/workflow-run-loop-baseline.json");
assert.equal(sha(archiveText), "c4622738963a61064b42a5f62bde27c86862ac3f0d71e78a457a1d57a08d5af0");
const archive = JSON.parse(archiveText);
for (const name of ["source", "compiled", "declaration"])
  assert.equal(sha(archive[name]), archive[`${name}Sha256`]);
const pinsText = await read("test/workflow-run-loop-current.json");
assert.equal(sha(pinsText), "CURRENT_PIN");
const pins = JSON.parse(pinsText);
async function select(reader = read) {
  for (const [path, hash] of Object.entries(pins.files))
    assert.equal(sha(await reader(path)), hash, path);
  return import(new URL("dist/workflow/expert/run-loop.js", core));
}
const current = await select();
const data = (text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
function bind(text, overrides = {}) {
  return text.replace(
    /from "([^"]+)"/gu,
    (_, path) =>
      `from ${JSON.stringify(overrides[path] ?? (path.startsWith(".") ? new URL(`dist/workflow/expert/${path}`, core).href : import.meta.resolve(path)))}`,
  );
}
const oldUrl = data(bind(archive.compiled));
const historical = await import(oldUrl);
const { ExpertWorkflowRuntimeContext } = await import(
  new URL("dist/workflow/expert/runtime-context.js", core)
);
const { createExpertWorkflowDefinition } = await import(
  new URL("dist/workflow/definition.js", core)
);
const runtimeText = await read("dist/workflow/expert/runtime.js");
const oldRuntime = await import(data(bind(runtimeText, { "./run-loop.js": oldUrl })));
const newRuntime = await import(
  data(
    bind(runtimeText, { "./run-loop.js": new URL("dist/workflow/expert/run-loop.js", core).href }),
  )
);

async function observe(owner, scenario, Runtime) {
  const controller = new AbortController();
  const failure = new Error("Owned terminal publication failure");
  const writes = [],
    events = [],
    trace = [];
  let stored,
    clock = 0,
    runnerCalls = 0;
  const definition = {
    ...createExpertWorkflowDefinition(),
    phaseOrder: ["agent", "complete", "unreachable"],
    phases: [
      { phase: "agent", behavior: "agent", title: "Owned agent", description: "Owned" },
      { phase: "complete", behavior: "complete", title: "Owned report", description: "Owned" },
      { phase: "unreachable", behavior: "agent", title: "Owned tail", description: "Owned" },
    ],
  };
  const store = {
    async writeSnapshot(snapshot, ...args) {
      assert.equal(this, store);
      stored = snapshot;
      writes.push(snapshot);
      trace.push(["write", args.length, args[0]?.signal?.aborted, JSON.stringify(snapshot)]);
    },
    async appendGraphRecord(runId, record, ...args) {
      assert.equal(this, store);
      trace.push(["graph", runId, args.length, args[0]?.signal?.aborted, JSON.stringify(record)]);
    },
    async appendEvent(event, ...args) {
      assert.equal(this, store);
      events.push(event);
      trace.push(["event", args.length, args[0]?.signal?.aborted, JSON.stringify(event)]);
      if (event.type === "run_completed" && scenario !== "success") throw failure;
    },
    async writeReport(runId, report, options) {
      assert.equal(this, store);
      trace.push(["report", runId, report, options.signal?.aborted]);
      return { relativePath: "owned/report.md" };
    },
    async writeArtifact(runId, path, text, options) {
      assert.equal(this, store);
      trace.push(["artifact", runId, path, text, options.signal?.aborted]);
      return { relativePath: "owned/agent.md" };
    },
    async readRun(runId, options) {
      assert.equal(this, store);
      assert.equal(options.signal, controller.signal);
      trace.push(["read", runId, options.signal.aborted]);
      if (scenario === "abort") controller.abort(failure);
      return scenario === "null" ? null : stored;
    },
  };
  const agentRunner = {
    async run(input) {
      assert.equal(this, agentRunner);
      runnerCalls++;
      trace.push(["runner", input.phase]);
      return { response: "Owned response", sessionId: "owned-child" };
    },
  };
  const deps = {
    definition,
    store,
    agentRunner,
    createRunId: () => "owned-run",
    createActivityId: () => "owned-activity",
    now: () => new Date(clock++ * 1000),
  };
  const options = { cwd: "owned", task: "Owned task", abortSignal: controller.signal };
  let result, initial;
  if (Runtime) result = await new Runtime(deps).start(options);
  else {
    const ctx = new ExpertWorkflowRuntimeContext(deps);
    initial = ctx.createInitialSnapshot(options);
    // Completion is admitted despite its stored phase status; earlier completed work is skipped.
    initial.phases[0].status = "completed";
    initial.phases[1].status = "completed";
    result = await owner.continueRun(ctx, initial, options);
  }
  assert.equal(result.snapshot, writes.at(-1));
  assert.equal(runnerCalls, Runtime ? 1 : 0);
  assert.equal(result.snapshot.phases[2].status, "pending");
  if (scenario === "success") {
    assert.equal(result.status, "completed");
    assert.equal(result.reportPath, "owned/report.md");
    assert.equal(events.at(-1).type, "run_completed");
  } else {
    assert.equal("reportPath" in result, false);
    assert.equal(events.filter((event) => event.type === "run_completed").length, 1);
    if (scenario === "abort") {
      assert.equal(result.status, "cancelled");
      assert.equal(events.at(-1).type, "run_cancelled");
      assert.equal(trace.filter((entry) => entry[0] === "write").at(-1)[1], 0);
    } else {
      assert.equal(result.status, "paused");
      assert.equal(events.at(-1).type, "workflow_paused");
      assert.equal(result.snapshot.reportPath, scenario === "null" ? undefined : "owned/report.md");
    }
  }
  return { trace, result: JSON.stringify(result), clock, runnerCalls };
}

test("emitted continuation terminal-write recovery and runtime.start consumer", async () => {
  for (const scenario of ["success", "terminal", "null", "abort"])
    assert.deepEqual(
      await observe(current, scenario),
      await observe(historical, scenario),
      scenario,
    );
  assert.deepEqual(
    await observe(current, "success", newRuntime.ExpertWorkflowRuntime),
    await observe(historical, "success", oldRuntime.ExpertWorkflowRuntime),
    "runtime.start",
  );
  await assert.rejects(
    select(async (path) => (path.endsWith("run-loop.js") ? "wrong" : read(path))),
    assert.AssertionError,
  );
  await assert.rejects(
    select(async (path) => {
      if (path.endsWith("run-loop.js")) throw new Error("Owned missing artifact");
      return read(path);
    }),
    /Owned missing artifact/,
  );
});
