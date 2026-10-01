import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CoreErrorType, SessionEventType } from "@knorvia/contracts";
import { URL_FIXTURE } from "./webfetch-orchestration-cases.js";
import {
  cache,
  clock,
  entry,
  flushUntil,
  handlerModule,
} from "./webfetch-orchestration-fixture.js";
import {
  createToolRegistry,
  executorCases,
  executorFixture,
  observeExecutor,
  permissions,
  registryObservation,
  registryVariants,
} from "./webfetch-orchestration-consumer-fixture.js";
const frozen = JSON.parse(
  await readFile(new URL("./webfetch-orchestration-contract.json", import.meta.url), "utf8"),
);
test("real built-in registration and emitted registry contracts retain admission flags", () => {
  assert.deepEqual(registryVariants.map(registryObservation), frozen.registry);
  const registry = createToolRegistry();
  registry.register(entry);
  assert.equal(registry.get("WebFetch"), entry);
  assert.equal(registry.get("webfetch"), undefined);
});
test("real executor results/model content/errors/display/telemetry remain frozen", async () => {
  for (const [i, c] of executorCases.entries())
    assert.deepEqual(await observeExecutor(c), frozen.executor[i].observed, c.label);
});
test("real permission service preserves approval/preapproval/deny/ask/plan ordering", () => {
  assert.deepEqual(permissions(), frozen.permissions);
  assert.equal(frozen.permissions.length, 60);
  for (const fact of frozen.permissions.filter((f: any) => f.rule === "deny")) {
    assert.equal(fact.decision.decision, fact.mode === "yolo" ? "allow" : "deny");
    assert.equal(
      fact.decision.ruleId,
      fact.mode === "yolo"
        ? "mode.yolo"
        : fact.mode === "auto"
          ? "mode.auto.unimplemented"
          : "rule.project.deny",
    );
  }
});
test("executor validation, denial, approval rejection and pre-cancel never call HTTP/model", async () =>
  clock(async () => {
    for (const kind of ["schema", "deny", "ask", "abort"]) {
      handlerModule.clearWebFetchCacheForTests();
      const f = executorFixture({ label: kind }),
        controller = new AbortController();
      if (kind === "schema") f.call.input = { prompt: "synthetic" };
      if (kind === "deny") f.behavior.decision = "deny";
      if (kind === "ask") {
        f.behavior.decision = "ask";
        f.behavior.reply = { decision: "deny" };
      }
      if (kind === "abort") controller.abort("synthetic pre-cancel");
      const result = await f.execute({ signal: controller.signal });
      assert.equal(result.success, false);
      assert.equal(f.direct.calls.length, 0);
      assert.equal(cache.getWebFetchCache(URL_FIXTURE), undefined);
      assert.equal(f.observed.contexts.length, 0);
    }
  }));
test("warm cache cannot bypass real executor permission admission", async () =>
  clock(async () => {
    handlerModule.clearWebFetchCacheForTests();
    const f = executorFixture({ label: "warm" });
    assert.equal((await f.execute()).success, true);
    const count = f.direct.calls.length;
    f.call.id = "synthetic-denied-call" as any;
    f.behavior.decision = "deny";
    assert.equal((await f.execute()).success, false);
    assert.equal(f.direct.calls.length, count);
    assert.ok(cache.getWebFetchCache(URL_FIXTURE));
  }));
test("executor binds port signal/trace and orders pending/complete before tool result", async () =>
  clock(async () => {
    handlerModule.clearWebFetchCacheForTests();
    const f = executorFixture({ label: "event order" });
    assert.equal((await f.execute()).success, true);
    const request = f.direct.rawCalls.find((c) => c.target === "request");
    assert.equal(request.args[1].signal, f.observed.contexts[0].abortSignal);
    assert.equal(request.args[0].trace.spanId, f.observed.contexts[0].spanId);
    const network = f.events.filter((e) => e.type === SessionEventType.NetworkRequestStatus);
    assert.deepEqual(
      network.map((e) => (e.payload as any).status),
      ["pending", "complete"],
    );
    assert.ok(
      f.events.indexOf(network[1]) <
        f.events.findIndex((e) => e.type === SessionEventType.ToolCallResult),
    );
    assert.deepEqual(
      f.terminal().map((t) => t.name),
      ["finishCompleted"],
    );
  }));
test("executor HTTP/model delayed cancellation emits one error and no late successful result", async () =>
  clock(async () => {
    for (const target of ["request", "generateText"] as const) {
      handlerModule.clearWebFetchCacheForTests();
      const f = executorFixture({ label: "interrupted", fault: { target, kind: "delay" } }),
        controller = new AbortController();
      const pending = f.execute({ signal: controller.signal });
      await flushUntil(() => f.direct.calls.some((c) => c.target === target));
      controller.abort("synthetic interruption");
      const result = await pending;
      assert.equal(result.error.type, CoreErrorType.ToolCancelled);
      assert.equal(result.turnControl, undefined);
      assert.equal(result.success, false);
      f.direct.waits[target].resolve(
        target === "request" ? f.direct.response() : { text: "synthetic late text" },
      );
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(f.events.filter((e) => e.type === SessionEventType.ToolCallResult).length, 0);
      assert.equal(f.events.filter((e) => e.type === SessionEventType.ToolCallError).length, 1);
      assert.deepEqual(
        f.terminal().map((t) => t.name),
        ["finishCancelled"],
      );
    }
  }));
test("rejected delayed HTTP stays failed without cache while delayed model preserves cached content", async () =>
  clock(async () => {
    for (const target of ["request", "generateText"] as const) {
      handlerModule.clearWebFetchCacheForTests();
      const f = executorFixture({ label: "delayed rejection", fault: { target, kind: "delay" } });
      const pending = f.execute();
      await flushUntil(() => f.direct.calls.some((c) => c.target === target));
      f.direct.waits[target].reject(f.direct.originalError);
      const result = await pending;
      assert.equal(result.success, false);
      assert.equal(result.error.type, CoreErrorType.ToolExecutionFailed);
      assert.equal(cache.getWebFetchCache(URL_FIXTURE) !== undefined, target === "generateText");
      assert.deepEqual(
        f.terminal().map((t) => t.name),
        ["finishFailed"],
      );
    }
  }));
