// Offline admission contracts against the real executor and inherited handler baseline.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CoreErrorType,
  HookEventName,
  SessionEventType,
  createCoreError,
} from "@knorvia/contracts";
import { eventPayload, gate } from "./tool-invocation-fixture.js";
import { executorFixture, permissionModule } from "./skill-tool-fixture.js";

test("actual Skill permission mode matrix preserves build/plan denial, reserved auto and yolo pass-through", async () => {
  for (const mode of ["build", "plan", "auto", "yolo"] as const) {
    for (const refusal of ["none", "hard", "project"] as const) {
      const f = executorFixture();
      f.deps.getMode = () => mode;
      f.deps.permissionService = new permissionModule.PermissionService({
        allowedTools: new Set(),
        disallowedTools: new Set(refusal === "hard" ? ["Skill"] : []),
        autoApproveHighRisk: false,
        allowMediumRiskInAutoMode: false,
      });
      if (refusal === "project") {
        f.deps.sessionStore = {
          getSession: async () => ({ projectID: "fixture-project" }),
          getProjectPermission: async () => ({ version: 1, deny: [{ toolName: "Skill" }] }),
        } as NonNullable<typeof f.deps.sessionStore>;
      }
      const result = await f.execute();
      const admitted = mode === "yolo" || (mode !== "auto" && refusal === "none");
      assert.equal(result.success, admitted, `${mode}/${refusal}`);
      assert.equal(f.direct.requests.length, admitted ? 1 : 0);
      assert.equal(f.timeline.includes("broker"), false);
      if (!admitted) assert.equal(result.error!.type, CoreErrorType.PermissionDenied);
      if (mode === "auto")
        assert.equal(result.error!.message, "Auto mode is reserved but not implemented yet");
    }
  }
});

test("interleaved Skill execution keeps adapter content and resolved metadata call-local", async () => {
  const first = executorFixture();
  const second = executorFixture();
  const entered = gate();
  const release = gate();
  first.direct.result.content = "first instructions";
  first.direct.result.metadata.qualifiedName = "first:notes";
  second.direct.result.content = "second instructions";
  second.direct.result.metadata.qualifiedName = "second:notes";
  first.direct.behavior.load = async () => {
    entered.resolve();
    await release.promise;
    return first.direct.result;
  };
  const pending = first.execute();
  await entered.promise;
  const secondResult = await second.execute();
  assert.equal(secondResult.success, true);
  assert.ok((secondResult.output as string).includes("second instructions"));
  assert.equal(first.events.length, 1);
  release.resolve();
  const firstResult = await pending;
  assert.equal(firstResult.success, true);
  assert.ok((firstResult.output as string).includes("first instructions"));
  assert.deepEqual(
    [first, second].map((f) => eventPayload(f.events.at(-1)!).skillMetadata),
    [
      { qualifiedName: "first:notes", pluginId: "demo@example", source: "plugin" },
      { qualifiedName: "second:notes", pluginId: "demo@example", source: "plugin" },
    ],
  );
});

test("current and legacy Skill inputs reach the real adapter after Hook, permission and Started", async () => {
  for (const input of [{ skill: "demo:notes", args: "ignored" }, { name: "legacy" }]) {
    const f = executorFixture();
    f.call.input = input;
    const result = await f.execute();
    assert.equal(result.success, true);
    assert.equal(f.direct.requests.length, 1);
    assert.equal(f.direct.requests[0].request.name, "skill" in input ? input.skill : input.name);
    assert.deepEqual(f.timeline, [
      HookEventName.PreToolUse,
      "permission",
      SessionEventType.ToolCallStarted,
      "handler",
      HookEventName.PostToolUse,
      SessionEventType.ToolCallResult,
      "background",
    ]);
    assert.equal(result.output, result.modelContent);
    assert.equal(f.direct.requests[0].options!.signal, f.observed.contexts[0].abortSignal);
    assert.deepEqual(f.direct.requests[0].request.trace, {
      traceId: f.observed.contexts[0].traceId,
      spanId: f.observed.contexts[0].spanId,
      parentSpanId: f.observed.contexts[0].parentSpanId,
      sessionId: "fixture-session",
      turnId: "fixture-turn",
    });
    assert.deepEqual(eventPayload(f.events.at(-1)!).skillMetadata, {
      qualifiedName: "demo:notes",
      pluginId: "demo@example",
      source: "plugin",
    });
  }
});

test("bad Skill admission and policy/user refusal cannot call SkillPort", async () => {
  for (const kind of ["schema", "policy", "user", "hook"]) {
    const f = executorFixture();
    if (kind === "schema") f.call.input = {};
    if (kind === "policy") f.behavior.decision = "deny";
    if (kind === "user") {
      f.behavior.decision = "ask";
      f.behavior.reply = { decision: "deny", reason: "example refusal" };
    }
    if (kind === "hook")
      f.behavior.hook = async () => ({
        additionalContexts: [],
        permissionBehavior: "deny",
        hookPermissionDecisionReason: "example hook refusal",
      });
    const result = await f.execute();
    assert.equal(result.success, false);
    assert.equal(
      result.error!.type,
      kind === "schema" ? CoreErrorType.ToolExecutionFailed : CoreErrorType.PermissionDenied,
    );
    assert.deepEqual(f.direct.requests, []);
    assert.equal(f.timeline.includes(SessionEventType.ToolCallStarted), false);
    assert.equal(f.timeline.includes("handler"), false);
  }
});

test("valid Hook rewrites use normalized Skill name; invalid rewrites fail before permission", async () => {
  for (const valid of [true, false]) {
    const f = executorFixture();
    f.behavior.hook = async (input) =>
      input.hookEventName === HookEventName.PreToolUse
        ? {
            additionalContexts: [],
            updatedInput: valid ? { name: "rewritten", args: "ignored" } : {},
          }
        : { additionalContexts: [] };
    const result = await f.execute();
    assert.equal(result.success, valid);
    if (valid) {
      assert.equal(f.direct.requests[0].request.name, "rewritten");
      assert.deepEqual(f.observed.inputs, [{ args: "ignored", skill: "rewritten" }]);
    } else {
      assert.deepEqual(f.direct.requests, []);
      assert.deepEqual(f.timeline, [HookEventName.PreToolUse]);
    }
  }
});

test("load errors retain executor categories and never record resolved metadata or Result", async () => {
  for (const failure of [
    new Error("read failed"),
    createCoreError(CoreErrorType.InvalidInput, "example skill missing"),
  ]) {
    const f = executorFixture();
    f.direct.behavior.load = async () => {
      throw failure;
    };
    const result = await f.execute();
    assert.equal(result.success, false);
    assert.equal(result.error!.type, "type" in failure ? failure.type : failure.name);
    assert.equal(f.direct.requests.length, 1);
    assert.equal(f.timeline.includes(HookEventName.PostToolUseFailure), true);
    assert.deepEqual(
      f.events.map((event) => event.type),
      [SessionEventType.ToolCallStarted, SessionEventType.ToolCallError],
    );
    assert.equal(eventPayload(f.events.at(-1)!).skillMetadata, undefined);
  }
});

test("pre-cancelled executor never admits a load; pending cancellation reaches the child signal", async () => {
  const cancelled = executorFixture();
  const parent = new AbortController();
  parent.abort();
  const early = await cancelled.execute({ signal: parent.signal });
  assert.equal(early.error!.type, CoreErrorType.ToolCancelled);
  assert.deepEqual(cancelled.direct.requests, []);
  assert.deepEqual(cancelled.events, []);

  const f = executorFixture();
  const activeParent = new AbortController();
  const entered = gate();
  f.direct.behavior.load = async () => {
    const signal = f.direct.requests[0].options!.signal!;
    entered.resolve();
    return new Promise((_, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
    );
  };
  const pending = f.execute({ signal: activeParent.signal });
  await entered.promise;
  const child = f.direct.requests[0].options!.signal!;
  assert.notEqual(child, activeParent.signal);
  activeParent.abort(new Error("example cancellation"));
  const result = await pending;
  assert.equal(child.aborted, true);
  assert.equal(result.error!.type, CoreErrorType.ToolCancelled);
  assert.deepEqual(
    f.events.map((event) => event.type),
    [SessionEventType.ToolCallStarted, SessionEventType.ToolCallError],
  );
  assert.equal(eventPayload(f.events.at(-1)!).skillMetadata, undefined);
});
