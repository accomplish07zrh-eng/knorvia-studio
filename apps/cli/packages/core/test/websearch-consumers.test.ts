import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CoreErrorType,
  getCurrentModelInvocationContext,
  SessionEventType,
} from "@knorvia/contracts";
import { gate } from "./tool-invocation-fixture.js";
import { executorCases } from "./websearch-cases.js";
import {
  clock,
  createToolRegistry,
  date,
  entry,
  executorFixture,
  observeExecutor,
  PermissionService,
  resolveRuntimePermissionCapability,
  streamFixture,
  toAiSdkTools,
  valid,
  withModelInvocationContext,
} from "./websearch-fixture.js";
import { handlers } from "./websearch-fixture.js";
const frozen = JSON.parse(
  await readFile(new URL("./websearch-contract.json", import.meta.url), "utf8"),
);
test("actual executor preserves frozen output/error/hook/event/trace stream boundaries", async () => {
  await clock(async () => {
    for (const [index, scenario] of executorCases.entries())
      assert.deepEqual(
        await observeExecutor(scenario),
        frozen.executions[index].observed,
        scenario.label,
      );
  });
});
test("real registry projects wrapper client execution while internal contract remains provider-native", async () => {
  const registry = createToolRegistry();
  handlers.registerBuiltInTools(registry, { allowedTools: ["WebSearch"] });
  assert.equal(registry.get("WebSearch"), entry);
  await clock(async () => {
    const outer = registry.toContracts()[0];
    assert.equal(outer.name, "WebSearch");
    assert.equal(outer.executionMode, "client");
    assert.equal(outer.providerNative, undefined);
    assert.equal(outer.permission, entry.permission);
    assert.equal(outer.inputSchema, entry.inputSchema);
    assert.equal(outer.description, frozen.descriptions[0]);
    const fixture = streamFixture({ label: "native-projection", events: [] });
    await entry.handler(valid, fixture.context);
    const native = fixture.requests[0].tools![0];
    assert.equal(native.executionMode, "providerNative");
    assert.throws(
      () => toAiSdkTools([native], { providerKind: "openai", supportsNativeWebSearch: true }),
      (error: any) =>
        error.name === "AiSdkModelAdapterError" && error.code === "invalid_model_request",
    );
    assert.doesNotThrow(() =>
      toAiSdkTools([native], { providerKind: "anthropic", supportsNativeWebSearch: true }),
    );
    assert.throws(() =>
      toAiSdkTools([native], { providerKind: "anthropic", supportsNativeWebSearch: false }),
    );
  });
});
test("permission service preserves build/plan/auto/yolo and explicit denial behavior", () => {
  for (const mode of ["build", "plan", "auto", "yolo"])
    for (const denial of ["none", "hard", "project"]) {
      const service = new PermissionService({
        allowedTools: new Set(),
        disallowedTools: new Set(denial === "hard" ? ["WebSearch"] : []),
        autoApproveHighRisk: false,
        allowMediumRiskInAutoMode: false,
      });
      const result = service.checkPermission(
        { mode, toolName: "WebSearch", input: valid, riskLevel: "low" },
        resolveRuntimePermissionCapability(entry, valid, {
          workingDirectory: ".",
          workspaceRoot: ".",
          runtimeScope: "main",
        }),
        denial === "project" ? { version: 1, deny: [{ toolName: "WebSearch" }] } : undefined,
      );
      assert.equal(
        result.decision,
        mode === "yolo" ? "allow" : mode === "auto" || denial !== "none" ? "deny" : "allow",
        `${mode}/${denial}`,
      );
    }
});
test("schema/hook/policy/synthetic broker refusals produce no model effects", async () => {
  for (const reason of ["schema", "hook", "policy", "broker"]) {
    const fixture = executorFixture();
    if (reason === "schema") fixture.call.input = { query: "x" };
    if (reason === "hook")
      fixture.behavior.hook = async () => ({ additionalContexts: [], permissionBehavior: "deny" });
    if (reason === "policy") fixture.behavior.decision = "deny";
    if (reason === "broker") {
      fixture.behavior.decision = "ask";
      fixture.behavior.reply = { decision: "deny" };
    }
    assert.equal((await fixture.execute()).success, false);
    assert.deepEqual(fixture.direct.calls, []);
  }
});
test("executor/runtime invocation wrappers retain admission/retry/status sink and iterator correlation", async () => {
  const fixture = executorFixture({ label: "status", events: [] });
  const scopes: any[] = [];
  const admission = { synthetic: true };
  const model = fixture.direct.model;
  model.streamText = function () {
    scopes.push(getCurrentModelInvocationContext());
    return {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            const scope = getCurrentModelInvocationContext();
            scopes.push(scope);
            await scope?.statusSink?.publish({
              type: "request_state",
              state: "queued",
              requestId: "synthetic",
            } as any);
            return { done: true, value: undefined };
          },
        };
      },
    };
  };
  fixture.deps.model = withModelInvocationContext(model, () => ({
    modelRequestAdmission: admission,
    modelRetryBudget: "unbounded",
  }));
  const result = await fixture.execute({ traceContext: { traceId: "synthetic-parent-trace" } });
  assert.equal(result.success, true);
  assert.equal(scopes.length, 2);
  for (const scope of scopes) {
    assert.equal(scope.modelRequestAdmission, admission);
    assert.equal(scope.modelRetryBudget, "unbounded");
    assert.equal(scope.metadata.querySource, "web_search_tool");
    assert.equal(scope.traceContext.traceId, "synthetic-parent-trace");
    assert.ok(scope.statusSink);
  }
  assert.ok(fixture.events.some((event) => event.type === SessionEventType.ModelNetworkStatus));
});
test("pre/pending cancellation belongs to executor and preserves synthetic abort-signal delivery", async () => {
  const parent = new AbortController();
  parent.abort();
  const before = executorFixture();
  assert.equal(
    (await before.execute({ signal: parent.signal })).error?.type,
    CoreErrorType.ToolCancelled,
  );
  assert.deepEqual(before.direct.calls, []);
  const fixture = executorFixture(),
    entered = gate(),
    release = gate();
  let signal: AbortSignal | undefined;
  fixture.direct.model.streamText = function (request) {
    signal = request.abortSignal;
    return {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            entered.resolve();
            await release.promise;
            return { done: true, value: undefined };
          },
        };
      },
    };
  };
  const controller = new AbortController();
  const pending = fixture.execute({ signal: controller.signal });
  await entered.promise;
  controller.abort();
  assert.equal((await pending).error?.type, CoreErrorType.ToolCancelled);
  assert.equal(signal?.aborted, true);
  release.resolve();
  await new Promise((resolve) => setImmediate(resolve));
});
test("executor rejects malformed usage output after one synthetic model stream", async () => {
  const fixture = executorFixture({
    label: "invalid-output",
    events: [{ type: "finish", finishReason: "stop", usage: { inputTokens: null } }],
  });
  const result = await fixture.execute();
  assert.equal(result.success, false);
  assert.equal(fixture.direct.calls.length, 1);
  assert.ok(!fixture.events.some((event) => event.type === SessionEventType.ToolCallResult));
});
test("synthetic deadline cancels a pending stream without changing configured timeout budgets", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: date });
  const fixture = executorFixture(),
    entered = gate(),
    release = gate();
  fixture.direct.model.streamText = () => ({
    [Symbol.asyncIterator]() {
      return {
        async next() {
          entered.resolve();
          await release.promise;
          return { done: true, value: undefined };
        },
      };
    },
  });
  const pending = fixture.execute();
  await entered.promise;
  t.mock.timers.tick(60_001);
  assert.equal((await pending).error?.type, CoreErrorType.ToolTimeout);
  release.resolve();
  await new Promise((resolve) => setImmediate(resolve));
});
