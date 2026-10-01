// Existing protocol/host projections; the requestClient transport is always synthetic.
import assert from "node:assert/strict";
import test from "node:test";
import {
  knorviaProtocolMethods,
  knorviaOffPeakCreateResultSchema,
  knorviaOffPeakListResultSchema,
} from "@knorvia/shared";
import {
  entries,
  failureCases,
  protocolFixture,
  task,
  updateOffPeakToolPolicy,
  valid,
} from "./off-peak-fixture.js";

test("actual protocol create preserves binding, defaults, payload and task snapshot through handler", async () => {
  const f = protocolFixture();
  f.state.own = { app: { sessionId: "own-session" }, activeAutomationId: "example-automation" };
  const input = {
    ...valid,
    permissionMode: "build",
    model: " example-model ",
    thoughtLevel: " high ",
  };
  const output = await entries.create.handler(input, {
    offPeakPort: f.port,
    toolCallId: "example-call",
    sessionId: "explicit-session",
    automationTurn: true,
  } as never);
  assert.deepEqual(
    f.calls.map((c) => c.method),
    [knorviaProtocolMethods.offPeakList, knorviaProtocolMethods.offPeakCreate],
  );
  assert.deepEqual(f.calls[0].params, {});
  assert.equal(f.calls[0].schema, knorviaOffPeakListResultSchema);
  assert.equal(f.calls[1].schema, knorviaOffPeakCreateResultSchema);
  assert.deepEqual(f.calls[1].params, {
    title: "Deferred example",
    prompt: "Produce the example deliverable.",
    permissionMode: "build",
    model: "example-model",
    thoughtLevel: "high",
    boundSessionId: "explicit-session",
  });
  assert.deepEqual((output as { task: unknown }).task, task);
  const defaulted = protocolFixture();
  await entries.create.handler(valid, {
    offPeakPort: defaulted.port,
    toolCallId: "example-call",
  } as never);
  assert.deepEqual(
    defaulted.calls.map((c) => c.method),
    [knorviaProtocolMethods.offPeakCreate],
  );
  assert.deepEqual(defaulted.calls[0].params, {
    title: "Deferred example",
    prompt: "Produce the example deliverable.",
  });
});

test("actual protocol rejects active idle runs before lookup and pending same-session tasks before create", async () => {
  const active = protocolFixture();
  active.state.own = { activeOffPeakTaskId: " example-idle " };
  await assert.rejects(
    active.port.create({ title: "Example", prompt: "Example" }, { sessionId: "bound" }),
    /Cannot create an idle-time task while running an idle-time task\./,
  );
  assert.deepEqual(active.calls, []);
  for (const status of [
    "queued",
    "paused",
    "running",
    "completed",
    "failed",
    "cancelled",
  ] as const) {
    const f = protocolFixture();
    f.state.tasks = [{ ...task, status, sessionId: "bound" }];
    if (["queued", "paused", "running"].includes(status)) {
      await assert.rejects(
        f.port.create({ title: "Example", prompt: "Example" }, { sessionId: "bound" }),
        /This session already has a pending idle-time task\./,
      );
      assert.deepEqual(
        f.calls.map((c) => c.method),
        [knorviaProtocolMethods.offPeakList],
      );
    } else {
      assert.equal(
        (await f.port.create({ title: "Example", prompt: "Example" }, { sessionId: "bound" })).ok,
        true,
      );
      assert.deepEqual(
        f.calls.map((c) => c.method),
        [knorviaProtocolMethods.offPeakList, knorviaProtocolMethods.offPeakCreate],
      );
    }
  }
  const unrelated = protocolFixture();
  unrelated.state.tasks = [{ ...task, sessionId: "other" }];
  assert.equal(
    (await unrelated.port.create({ title: "Example", prompt: "Example" }, { sessionId: "bound" }))
      .ok,
    true,
  );
});

test("actual protocol lookup failure remains closed and create rejection propagates without retry", async () => {
  const f = protocolFixture();
  f.state.failList = new Error("Example lookup failure");
  await assert.rejects(
    f.port.create({ title: "Example", prompt: "Example" }, { sessionId: "bound" }),
    /Cannot verify whether this session already has a pending idle-time task; try again later\./,
  );
  assert.deepEqual(
    f.calls.map((c) => c.method),
    [knorviaProtocolMethods.offPeakList],
  );
  assert.equal(f.warnings.length, 1);
  const other = protocolFixture(),
    failure = new Error("Example transport failure");
  other.state.failCreate = failure;
  await assert.rejects(
    other.port.create({ title: "Example", prompt: "Example" }),
    (error) => error === failure,
  );
  assert.equal(other.calls.length, 1);
});

test("actual protocol retains own-session precedence and fallback records without injecting runtime choices", async () => {
  const fallback = protocolFixture();
  fallback.records.set("bound", { activeOffPeakTaskId: "example-idle" });
  await assert.rejects(
    fallback.port.create({ title: "Example", prompt: "Example" }, { sessionId: "bound" }),
  );
  assert.deepEqual(fallback.calls, []);
  fallback.state.own = {
    app: { sessionId: "own-session" },
    runtimeModel: "unrelated",
    mode: "plan",
    thoughtLevel: "low",
  };
  await fallback.port.create({ title: "Example", prompt: "Example" }, { sessionId: "bound" });
  assert.deepEqual(fallback.calls.at(-1)!.params, {
    title: "Example",
    prompt: "Example",
    boundSessionId: "bound",
  });
  const own = protocolFixture();
  own.state.own = { app: { sessionId: "own-session" } };
  await own.port.create({ title: "Example", prompt: "Example" });
  assert.equal(
    (own.calls.at(-1)!.params as { boundSessionId: string }).boundSessionId,
    "own-session",
  );
});

test("actual protocol preserves all discriminated category/code/stage values and list order/duplicates", async () => {
  for (const failure of failureCases) {
    const f = protocolFixture();
    f.state.result = failure;
    assert.deepEqual(await f.port.create({ title: "Example", prompt: "Example" }), failure);
    assert.equal(f.calls.length, 1);
  }
  const f = protocolFixture();
  f.state.tasks = [
    { ...task, status: "failed" },
    { ...task, status: "queued" },
    { ...task, status: "queued" },
  ];
  assert.deepEqual(await f.port.list(), f.state.tasks);
  assert.deepEqual(
    f.calls.map((c) => c.method),
    [knorviaProtocolMethods.offPeakList],
  );
  assert.deepEqual(f.calls[0].params, {});
});

test("existing workspace tool gate changes only the synthetic preference after valid admission", async () => {
  const context = { appRuntimePreferences: { offPeakToolEnabled: false } };
  await assert.rejects(updateOffPeakToolPolicy(context, { workspace: {}, enabled: "true" }));
  assert.equal(context.appRuntimePreferences.offPeakToolEnabled, false);
  const workspace = { workspaceKey: "example-workspace", workspacePath: "/example-workspace" };
  assert.deepEqual(await updateOffPeakToolPolicy(context, { workspace, enabled: true }), {
    workspace,
    enabled: true,
  });
  assert.equal(context.appRuntimePreferences.offPeakToolEnabled, true);
});

test("actual UI pure reader preserves created-task metadata from executor-compatible object/JSON output", async () => {
  const ui =
    await import("../../../../../packages/ui/src/ToolCallBlocks/renderers/offpeak-create.js");
  const output = { task, message: "Created idle-time task example-idle (#3 in queue)." };
  for (const value of [output, JSON.stringify(output)]) {
    const call = { toolName: "OffPeakCreate", output: value } as never;
    assert.equal(ui.isOffPeakCreateToolCall(call), true);
    assert.deepEqual(ui.readOffPeakCreateTaskSummary(call), {
      offPeakTaskId: "example-idle",
      title: "Example deferred work",
      status: "queued",
      queuePosition: 3,
    });
  }
  assert.equal(
    ui.readOffPeakCreateTaskSummary({ output: { task: { title: "Example" } } } as never),
    null,
  );
});
