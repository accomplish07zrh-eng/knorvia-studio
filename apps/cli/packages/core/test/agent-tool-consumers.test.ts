import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CoreErrorType } from "@knorvia/contracts";
import { gate } from "./tool-invocation-fixture.js";
import { executorCases, completed, validInput, backgrounded } from "./agent-tool-cases.js";
import {
  clock,
  compat,
  createToolRegistry,
  executorFixture,
  handlers,
  module,
  observeExecutor,
  permissionObservation,
  registryObservation,
} from "./agent-tool-fixture.js";
const frozen = JSON.parse(
  await readFile(new URL("./agent-tool-contract.json", import.meta.url), "utf8"),
);
test("built-in registry exercises both canonical aliases with frozen provider contracts", () => {
  const options = [
    {},
    { includeAgent: false },
    { includeDynamicWorkflow: false },
    { embeddedSearchEnabled: true },
    { disallowedTools: ["Task"] },
  ];
  assert.deepEqual(options.map(registryObservation), frozen.registry);
  const registry = createToolRegistry();
  handlers.registerBuiltInTools(registry, { includeAgent: true, allowedTools: ["Agent", "Task"] });
  assert.equal(registry.get("Agent").handler, module.agentToolEntry.handler);
  assert.equal(registry.get("Task").handler, module.agentToolEntry.handler);
  assert.deepEqual(
    registry.toContracts().map((c: any) => c.name),
    ["Agent"],
  );
  assert.equal(registry.toContracts()[0].inputSchema, module.agentToolEntry.inputSchema);
  assert.equal(registry.toContracts()[0].permission, module.agentToolEntry.permission);
});
test("dispatch and hook compatibility are exact for Agent and Task only", () => {
  for (const name of ["Agent", "Task"]) assert.equal(compat.isSubagentDispatchToolName(name), true);
  for (const name of [undefined, "", "agent", "task", "TaskOutput", "TaskStop", "SendMessage"])
    assert.equal(compat.isSubagentDispatchToolName(name), false);
  assert.deepEqual(compat.hookMatcherToolNamesForTool("Agent"), ["Agent", "Task"]);
  assert.deepEqual(compat.hookMatcherToolNamesForTool("Task"), ["Task", "Agent"]);
});
test("actual source/strict emitted executor preserves result, hooks, trace and error ordering", async () => {
  await clock(async () => {
    for (const [index, { c, decision }] of executorCases.entries())
      assert.deepEqual(
        await observeExecutor(c, decision),
        frozen.executor[index].observed,
        c.label,
      );
  });
});
test("actual permission service retains every frozen mode/scope/deny/alias decision", () => {
  assert.deepEqual(permissionObservation(), frozen.permissions);
});
test("executor visibility follows registry provider filtering for Read/Bash exactly", async () => {
  await clock(async () => {
    for (const [name, hidden] of [
      ["Read", false],
      ["Bash", false],
      ["Read", true],
      ["read", false],
    ] as const) {
      const f = executorFixture({ label: "visibility" });
      f.deps.registry.register({
        ...f.entry,
        metadata: { ...f.entry.metadata, name, providerVisible: !hidden },
      });
      assert.equal((await f.execute()).success, true);
      assert.equal(f.direct.calls[0].request.callerCanReadOutputFile, !hidden && name !== "read");
    }
  });
});
test("executor waits for delayed synthetic launch without notification or second launch", async () => {
  await clock(async () => {
    const f = executorFixture({ label: "delayed" }),
      entered = gate(),
      release = gate();
    let calls = 0;
    f.direct.port.launch = async function (_request, options) {
      assert.equal(this, f.direct.port);
      assert.equal(options.signal.aborted, false);
      calls++;
      entered.resolve();
      await release.promise;
      return completed;
    };
    let settled = false;
    const pending = f.execute().then((result) => {
      settled = true;
      return result;
    });
    await entered.promise;
    assert.equal(settled, false);
    assert.equal(calls, 1);
    assert.equal(f.timeline.includes("background"), false);
    release.resolve();
    assert.equal((await pending).success, true);
    assert.equal(calls, 1);
  });
});
test("pre-cancellation, permission rejection and hook refusal never launch", async () => {
  await clock(async () => {
    for (const mode of ["abort", "deny", "hook", "ask-reject"] as const) {
      const f = executorFixture(
        { label: mode },
        mode === "deny" ? "deny" : mode === "ask-reject" ? "ask" : "allow",
      );
      const controller = new AbortController();
      if (mode === "abort") controller.abort();
      if (mode === "hook")
        f.behavior.hook = async () => ({ additionalContexts: [], permissionBehavior: "deny" });
      if (mode === "ask-reject") f.behavior.reply = { decision: "deny" };
      const result = await f.execute({ signal: controller.signal });
      assert.equal(result.success, false);
      assert.equal(f.direct.calls.length, 0);
      if (mode === "abort") assert.equal(result.error.type, CoreErrorType.ToolCancelled);
    }
  });
});
test("cancellation during delayed launch propagates signal and preserves late settlement boundary", async () => {
  await clock(async () => {
    const f = executorFixture({ label: "cancel pending" }),
      entered = gate(),
      release = gate();
    let signal: AbortSignal | undefined,
      calls = 0;
    f.direct.port.launch = async function (_request, options) {
      calls++;
      signal = options.signal;
      entered.resolve();
      await release.promise;
      return completed;
    };
    const controller = new AbortController(),
      pending = f.execute({ signal: controller.signal });
    await entered.promise;
    controller.abort("Synthetic cancellation");
    assert.equal((await pending).error.type, CoreErrorType.ToolCancelled);
    assert.equal(signal?.aborted, true);
    assert.equal(calls, 1);
    release.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.events.filter((e) => e.type === "tool_completed").length, 0);
    assert.equal(calls, 1);
  });
});
test("foreground and background alias results retain exact model text and output references", async () => {
  await clock(async () => {
    for (const alias of [false, true])
      for (const output of [completed, backgrounded]) {
        const f = executorFixture({ label: "projection", alias, output });
        f.call.input = { ...validInput, run_in_background: output.status === "async_launched" };
        const result = await f.execute();
        assert.equal(result.success, true);
        assert.deepEqual(result.output, output);
        assert.equal(result.modelContent, module.agentToolEntry.formatModelContent(output));
        assert.equal(f.direct.calls.length, 1);
      }
  });
});
test("executor propagates synthetic model override, session, turn, paths and span to launch", async () => {
  await clock(async () => {
    const f = executorFixture({ label: "model fields", alias: true });
    const model = {
      providerId: "synthetic",
      modelId: "never-called",
      bind() {
        assert.fail("No model binding");
      },
      generateText() {
        assert.fail("No model request");
      },
      streamText() {
        assert.fail("No model stream");
      },
    };
    const override = {
      selection: { providerId: "synthetic", modelId: "never-called" },
      background: "deny" as const,
    };
    let seen: any;
    f.direct.port.launch = function (request, options) {
      assert.equal(this, f.direct.port);
      seen = { request, options };
      return Promise.resolve(completed);
    };
    const result = await f.execute({
      model: model as any,
      subagentModelOverride: override as any,
      traceContext: { traceId: "synthetic-model-trace", spanId: "synthetic-parent-span" },
    });
    assert.equal(result.success, true);
    const context = f.observed.contexts[0];
    assert.equal(seen.options.model, context.model);
    assert.equal(seen.options.modelOverride, override);
    assert.equal(seen.options.signal, context.abortSignal);
    assert.equal(seen.request.sessionId, "fixture-session");
    assert.equal(seen.request.turnId, "fixture-turn");
    assert.equal(seen.request.workingDirectory, "synthetic-working-directory");
    assert.equal(seen.request.workspaceRoot, "synthetic-workspace");
    assert.deepEqual(seen.request.trace, {
      traceId: "synthetic-model-trace",
      spanId: context.spanId,
      parentSpanId: "synthetic-parent-span",
      sessionId: "fixture-session",
      turnId: "fixture-turn",
    });
    assert.equal(seen.request.parentToolCallId, "fixture-call");
  });
});
