import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  approvalCases,
  baseline,
  cases,
  clock,
  completed,
  consumer,
  createToolRegistry,
  current,
  gate,
  handlers,
  loadCurrent,
  observe,
  sha,
} from "./eval-workflow-snippet-execution-fixture.js";
const gold = JSON.parse(
  await readFile(
    new URL("./eval-workflow-snippet-execution-contract.json", import.meta.url),
    "utf8",
  ),
);

test("snippet current source/artifacts fail closed and registry preserves schemas and public policy", async () => {
  const module = await loadCurrent();
  assert.equal(module.evalWorkflowSnippetToolEntry, current);
  assert.notEqual(current, baseline);
  assert.notEqual(current.handler, baseline.handler);
  assert.ok(handlers.builtInTools.includes(current));
  const registered = createToolRegistry();
  handlers.registerBuiltInTools(registered, { allowedTools: ["EvalWorkflowSnippet"] });
  assert.equal(registered.get("EvalWorkflowSnippet"), current);
  const disabled = createToolRegistry();
  handlers.registerBuiltInTools(disabled, {
    allowedTools: ["EvalWorkflowSnippet"],
    includeDynamicWorkflow: false,
  });
  assert.equal(disabled.get("EvalWorkflowSnippet"), undefined);
  const registry = createToolRegistry();
  registry.register(current);
  assert.equal(registry.get("EvalWorkflowSnippet"), current);
  assert.equal(registry.get("evalworkflowsnippet"), undefined);
  assert.equal(current.inputSchema, baseline.inputSchema);
  assert.equal(current.outputSchema, baseline.outputSchema);
  assert.equal(current.runtimeInputSchema, baseline.runtimeInputSchema);
  assert.equal(current.runtimeOutputSchema, baseline.runtimeOutputSchema);
  for (const key of [
    "capability",
    "metadata",
    "permission",
    "resultBudget",
    "timeout",
    "cancellation",
    "trace",
  ])
    assert.deepEqual(current[key], baseline[key], key);
  assert.equal(sha(JSON.stringify(registry.toContracts())), gold.modelContractSha256);
  await assert.rejects(
    loadCurrent(async (url) =>
      url.pathname.endsWith(".js") ? "wrong emitted bytes" : readFile(url, "utf8"),
    ),
    assert.AssertionError,
  );
  await assert.rejects(
    loadCurrent(async (url) => {
      if (url.pathname.endsWith(".js"))
        throw Object.assign(new Error("Synthetic missing artifact"), { code: "ENOENT" });
      return readFile(url, "utf8");
    }),
    /Synthetic missing artifact/u,
  );
});
test("snippet frozen terminal outputs, receiver/read order and error stages remain exact", async () => {
  for (const c of cases) {
    const old = await observe(baseline, c);
    assert.equal(sha(JSON.stringify(old)), gold.direct[c.name], c.name);
    assert.deepEqual(await observe(current, c), old, c.name);
    if (old.calls.length) assert.equal(old.calls[0].receiver, true);
    if (old.ok)
      assert.deepEqual(old.ownKeys, ["ok", "diagnostics", "logs", "response", "durationMs"]);
  }
});
test("snippet approval uses real virtual compilation and unchanged literal-command policy", () => {
  for (const selected of [baseline, current]) {
    for (const c of approvalCases)
      assert.deepEqual(selected.prepareApproval(c.input), { gate: c.gate });
    for (const input of [{}, { code: "return 7;", path: "synthetic.dwf.ts" }])
      assert.deepEqual(selected.validateInput(input), {
        result: false,
        errorCode: 400,
        message: gold.sourceError,
      });
    assert.deepEqual(selected.validateInput({ code: "return 7;" }), { result: true });
    assert.deepEqual(selected.validateInput({ code: 7 }), { result: true });
    assert.equal(
      selected.formatModelContent({}),
      "EvalWorkflowSnippet returned an invalid result.",
    );
  }
});
test("registered snippet call-runner preserves terminal results, approval and completion-edge cancellation", async () => {
  await clock(async () => {
    for (const mode of [
      "normal",
      "pure-ask",
      "deny",
      "ask-refuse",
      "throw",
      "reject",
      "queued",
      "hostile",
      "early",
      "settlement",
      "model-begin",
      "model-end",
    ]) {
      const old = await consumer(baseline, mode).run();
      assert.equal(sha(JSON.stringify(old)), gold.consumer[mode], mode);
      assert.deepEqual(await consumer(current, mode).run(), old, mode);
      assert.equal(old.terminal.length, 1);
      if (["normal", "pure-ask", "queued", "hostile", "model-begin", "model-end"].includes(mode)) {
        assert.equal(old.result.success, true);
        assert.equal(old.terminal[0].name, "finishCompleted");
        assert.ok(old.result.display);
      }
      if (["early", "settlement"].includes(mode))
        assert.equal(old.terminal[0].name, "finishCancelled");
      if (["deny", "ask-refuse", "early"].includes(mode)) assert.equal(old.calls.length, 0);
      if (mode === "pure-ask") assert.ok(!old.timeline.includes("broker"));
      if (mode === "ask-refuse") assert.ok(old.timeline.includes("broker"));
    }
  });
});
test("concurrent delayed snippet calls keep receiver, output and terminal ownership separate", async () => {
  await clock(async () => {
    const pair = async (selected: any) => {
      const a = gate<any>(),
        b = gate<any>();
      const left = consumer(selected, "normal", "left", a),
        right = consumer(selected, "normal", "right", b);
      const first = left.run(),
        second = right.run();
      await Promise.all([left.entered.promise, right.entered.promise]);
      b.resolve({ ...completed, artifact: "second" });
      a.resolve({ ...completed, artifact: "first" });
      const outputs = await Promise.all([first, second]);
      for (const result of outputs) {
        assert.equal(result.calls.length, 1);
        assert.equal(result.terminal.length, 1);
      }
      assert.notEqual(outputs[0].result.output.response, outputs[1].result.output.response);
      return outputs;
    };
    assert.deepEqual(await pair(current), await pair(baseline));
  });
});
test("cancelled delayed snippet completion stays stale without a second terminal or notification", async () => {
  await clock(async () => {
    const stale = async (selected: any) => {
      const pending = gate<any>(),
        f = consumer(selected, "normal", "owned", pending);
      const result = f.run();
      await f.entered.promise;
      f.controller.abort("Synthetic pending abort");
      const cancelled = await result;
      const events = JSON.stringify(f.events),
        telemetry = JSON.stringify(f.observed.telemetry);
      pending.resolve(completed);
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(JSON.stringify(f.events), events);
      assert.equal(JSON.stringify(f.observed.telemetry), telemetry);
      assert.equal(cancelled.terminal.length, 1);
      assert.equal(cancelled.terminal[0].name, "finishCancelled");
      return cancelled;
    };
    assert.deepEqual(await stale(current), await stale(baseline));
  });
});
