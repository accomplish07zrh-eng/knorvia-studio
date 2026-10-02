import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
const core = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, core), "utf8");
const sha = (text) => createHash("sha256").update(text).digest("hex");
const archiveText = await read("test/workflow-phase-runner-baseline.json");
assert.equal(sha(archiveText), "cbb19f1c309989e66ea2fda06130e61a420c3467ab736d264dbe8f75fda8e4ed");
const archive = JSON.parse(archiveText);
for (const [name, pin] of [
  ["source", "sourceSha256"],
  ["compiled", "compiledSha256"],
  ["declaration", "declarationSha256"],
])
  assert.equal(sha(archive[name]), archive[pin]);
const currentText = await read("test/workflow-phase-runner-current.json");
assert.equal(sha(currentText), "CURRENT_HASH");
const { files } = JSON.parse(currentText);
async function select(reader = read) {
  for (const [path, digest] of Object.entries(files))
    assert.equal(sha(await reader(path)), digest, path);
  return import(new URL("dist/workflow/expert/phase-runner.js", core));
}
const current = await select();
const resolve = createRequire(new URL("package.json", core)).resolve;
const data = (text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
function bind(text, overrides = {}) {
  return text.replace(
    /from "([^"]+)"/gu,
    (_, path) =>
      `from ${JSON.stringify(overrides[path] ?? (path.startsWith(".") ? new URL(`dist/workflow/expert/${path}`, core).href : new URL(`file://${resolve(path)}`).href))}`,
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
const guard = data(
  'const no = () => { throw new Error("Unused owned path"); }; export { no as runFinalCriticLoop, no as runScheduledPhase };',
);
async function caller(owner) {
  return import(
    data(
      bind(await read("dist/workflow/expert/run-loop.js"), {
        "./phase-runner.js": owner,
        "./critic-loop.js": guard,
        "./scheduled-phase.js": guard,
      }),
    )
  );
}
const oldCaller = await caller(oldUrl);
const newCaller = await caller(new URL("dist/workflow/expert/phase-runner.js", core).href);

async function observe(owner, scenario, consumer) {
  const controller = new AbortController();
  const failure = new Error(`Owned ${scenario}`);
  const trace = [],
    writes = [],
    events = [];
  let request,
    clock = 0,
    runs = 0;
  const options = { cwd: "owned", abortSignal: controller.signal };
  const store = {
    async writeSnapshot(snapshot, supplied) {
      assert.equal(this, store);
      assert.equal(supplied.signal, controller.signal);
      writes.push(snapshot);
      trace.push(["snapshot", JSON.stringify(snapshot)]);
      if (scenario === "startup") throw failure;
    },
    async appendGraphRecord(runId, record, supplied) {
      assert.equal(this, store);
      assert.equal(supplied.signal, controller.signal);
      trace.push(["graph", runId, JSON.stringify(record)]);
    },
    async appendEvent(event, supplied) {
      assert.equal(this, store);
      assert.equal(supplied.signal, controller.signal);
      events.push(event);
      trace.push(["event", JSON.stringify(event)]);
      if (scenario === "terminal" && event.type === "phase_completed") throw failure;
    },
    async writeArtifact(runId, path, response, supplied) {
      assert.equal(this, store);
      assert.equal(supplied.signal, controller.signal);
      trace.push(["artifact", runId, path, response]);
      return { relativePath: "artifacts/owned-result.md" };
    },
  };
  const agentRunner = {
    async run(input) {
      assert.equal(this, agentRunner);
      assert.equal(input.abortSignal, controller.signal);
      runs++;
      request = input;
      trace.push(["runner", Object.keys(input), input.prompt]);
      if (scenario === "abort") {
        controller.abort(failure);
        throw failure;
      }
      await input.onChildSessionStarted({
        sessionId: "owned-child",
        model: "owned-model",
        turnId: "owned-turn",
      });
      return { response: "Owned response", sessionId: "owned-result", turnId: "owned-result-turn" };
    },
  };
  const definition = {
    ...createExpertWorkflowDefinition(),
    phaseOrder: ["owned"],
    phases: [
      { phase: "owned", title: "Owned phase", description: "Owned input", behavior: "agent" },
    ],
  };
  const ctx = new ExpertWorkflowRuntimeContext({
    definition,
    store,
    agentRunner,
    createActivityId: () => "owned-activity",
    createRunId: () => "owned-run",
    now: () => new Date(clock++ * 1000),
  });
  const initial = ctx.createInitialSnapshot({
    cwd: "owned",
    task: "Owned task",
    sessionId: "owned-parent",
  });
  let result, caught;
  try {
    result = consumer
      ? await consumer.continueRun(ctx, initial, options)
      : await owner.runPhase(ctx, initial, ctx.definition.phases[0], options);
  } catch (error) {
    caught = error;
  }
  if (scenario === "startup" || scenario === "abort" || scenario === "terminal")
    assert.equal(caught, failure);
  else assert.equal(caught, undefined);
  if (scenario === "startup") {
    assert.equal(runs, 0);
    assert.equal(writes.length, 1);
    assert.equal(events.length, 0);
  }
  if (scenario === "abort") {
    assert.equal(runs, 1);
    assert.equal(writes.length, 1);
    assert.deepEqual(
      events.map((event) => event.type),
      ["phase_started"],
    );
  }
  if (scenario === "terminal") {
    assert.deepEqual(
      writes.map((snapshot) => snapshot.activities[0].status),
      ["active", "active", "completed", "failed"],
    );
    assert.equal(writes[3].artifacts.length, 0);
    assert.equal(writes[3].activities[0].sessionId, "owned-child");
    assert.equal(writes[3].activities[0].model, "owned-model");
    assert.equal(events.at(-1).type, "phase_failed");
  }
  if (scenario === "success") {
    assert.equal(result.snapshot, writes.at(-1));
    assert.equal(result.snapshot.activities[0].status, "completed");
    assert.equal("model" in result.snapshot.activities[0], false);
    assert.equal(
      writes[0].activities[0].inputArtifactPaths,
      result.snapshot.activities[0].inputArtifactPaths,
    );
    await request.onChildSessionStarted({ sessionId: "owned-late" });
    assert.equal(writes.at(-1).activities[0].status, "active");
    assert.equal(writes.at(-1).activities[0].sessionId, "owned-late");
    assert.equal(result.snapshot.activities[0].status, "completed");
    assert.equal(events.at(-1).type, "workflow_session_linked");
  }
  return { trace, result: JSON.stringify(result), clock, runs };
}

test("actual-emitted phase write safety and one real run-loop consumer", async () => {
  for (const scenario of ["success", "startup", "terminal", "abort"])
    assert.deepEqual(
      await observe(current, scenario),
      await observe(historical, scenario),
      scenario,
    );
  assert.deepEqual(
    await observe(current, "success", newCaller),
    await observe(historical, "success", oldCaller),
    "real run-loop",
  );
  await assert.rejects(
    select(async (path) => (path.endsWith("phase-runner.js") ? "wrong" : read(path))),
    assert.AssertionError,
  );
  await assert.rejects(
    select(async (path) => {
      if (path.endsWith("phase-runner.js")) throw new Error("Owned missing artifact");
      return read(path);
    }),
    /Owned missing artifact/,
  );
});
