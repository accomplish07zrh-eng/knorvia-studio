// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test, type TestContext } from "node:test";
import { pathToFileURL } from "node:url";
import {
  createInProcessNodeReplExecutor,
  executeInWorker,
  WORKER_KIND,
  type NodeReplExecuteInput,
} from "../src/executor.js";

function input(overrides: Partial<NodeReplExecuteInput> = {}): NodeReplExecuteInput {
  return {
    code: "fixture",
    requestMeta: { session_id: "fixture", workspace_identity: "workspace" },
    signal: new AbortController().signal,
    syncTimeoutMs: 1000,
    ...overrides,
  };
}
async function worker(t: TestContext, body: string) {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-worker-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "worker.mjs");
  await writeFile(path, `import {parentPort,workerData} from 'node:worker_threads';\n${body}\n`);
  return pathToFileURL(path).href;
}

test("REPL worker receives data, correlation metadata and kind without transferring the signal", async (t) => {
  const module = await worker(t, "parentPort.postMessage({logs:JSON.stringify(workerData)});");
  const value = input({ cuaBroker: { socketPath: "fixture", token: "fixture-only" } });
  const before = getEventListeners(value.signal, "abort").length;
  const result = await executeInWorker(module, value);
  const { signal: _signal, ...data } = value;
  assert.deepEqual(JSON.parse(result.logs), { ...data, kind: WORKER_KIND });
  assert.equal(getEventListeners(value.signal, "abort").length, before);
});

test("REPL worker exposes errors, empty exit and empty message without producing success", async (t) => {
  const thrown = await worker(t, "throw new Error('worker fixture failed');");
  await assert.rejects(executeInWorker(thrown, input()), /worker fixture failed/);
  const exited = await worker(t, "process.exit(7);");
  await assert.rejects(executeInWorker(exited, input()), /Execution worker exited \(7\)/);
  const empty = await worker(t, "parentPort.postMessage(null);");
  await assert.rejects(executeInWorker(empty, input()), /Execution worker returned no result/);
});

test("REPL worker first response remains final and a new worker stays independent", async (t) => {
  const module = await worker(
    t,
    "parentPort.postMessage({logs:'first'}); parentPort.postMessage({logs:'second'});",
  );
  assert.deepEqual(await executeInWorker(module, input()), { logs: "first" });
  assert.deepEqual(await executeInWorker(module, input()), { logs: "first" });
});

test("REPL worker refuses already cancelled input before parsing a worker URL", () => {
  const reason = new Error("cancelled before spawn");
  assert.throws(
    () => executeInWorker("not a URL", input({ signal: AbortSignal.abort(reason) })),
    (error) => error === reason,
  );
});

test("REPL worker cancellation retains its reason and removes its listener", async (t) => {
  const module = await worker(t, "setInterval(() => {}, 1000);");
  const controller = new AbortController(),
    reason = new Error("stop worker");
  const before = getEventListeners(controller.signal, "abort").length;
  const result = executeInWorker(module, input({ signal: controller.signal }));
  controller.abort(reason);
  await assert.rejects(result, (error) => error === reason);
  assert.equal(getEventListeners(controller.signal, "abort").length, before);
});

test("REPL worker cancellation cannot be blocked by another signal observer", async (t) => {
  const module = await worker(t, "parentPort.postMessage({logs:'late success'});");
  const controller = new AbortController(),
    reason = new Error("owner cancelled");
  controller.signal.addEventListener("abort", (event) => event.stopImmediatePropagation());
  const result = executeInWorker(module, input({ signal: controller.signal }));
  controller.abort(reason);
  await assert.rejects(result, (error) => error === reason);
});

test("REPL in-process calls isolate VM globals and always restrict process capabilities", async () => {
  const execute = createInProcessNodeReplExecutor();
  const first = await execute(
    input({
      code: "globalThis.fixtureValue = 1; console.log(typeof process.exit, typeof process.kill, typeof process.cwd);",
    }),
  );
  assert.equal(first.logs, "undefined undefined function");
  assert.equal(first.error, undefined);
  assert.equal(
    (await execute(input({ code: "typeof globalThis.fixtureValue" }))).result,
    "undefined",
  );
});

test("REPL in-process execution propagates metadata and resolves separate documentation roots", async (t) => {
  const keys = ["KNORVIA_PLUGIN_ROOT", "KNORVIA_CUA_PLUGIN_ROOT"] as const;
  const before = keys.map((key) => process.env[key]);
  t.after(() =>
    keys.forEach((key, index) => {
      if (before[index] === undefined) delete process.env[key];
      else process.env[key] = before[index];
    }),
  );
  process.env.KNORVIA_PLUGIN_ROOT = "browser-fixture";
  process.env.KNORVIA_CUA_PLUGIN_ROOT = "computer-fixture";
  const execute = createInProcessNodeReplExecutor();
  const result = await execute(
    input({
      code: "[nodeRepl.requestMeta,globalThis[Symbol.for('knorvia.node-repl.browser-control-bridge')].documentationRoot,globalThis[Symbol.for('knorvia.node-repl.computer-use-bridge')].documentationRoot]",
    }),
  );
  assert.deepEqual(JSON.parse(result.result!), [
    { session_id: "fixture", workspace_identity: "workspace" },
    resolve("browser-fixture", "docs"),
    resolve("computer-fixture", "docs"),
  ]);
});

test("REPL in-process subagent and missing Computer Use connection still reject", async () => {
  const execute = createInProcessNodeReplExecutor();
  const subagent = await execute(
    input({
      requestMeta: { runtime_scope: "subagent" },
      code: "globalThis[Symbol.for('knorvia.node-repl.browser-control-bridge')].assertAvailable()",
    }),
  );
  assert.match(subagent.error?.message ?? "", /not available in subagent/);
  const missing = await execute(
    input({
      code: "globalThis[Symbol.for('knorvia.node-repl.computer-use-bridge')].assertAvailable()",
    }),
  );
  assert.match(missing.error?.message ?? "", /unavailable/);
});

test("REPL in-process aborted and synchronous timeout calls do not poison subsequent calls", async () => {
  const execute = createInProcessNodeReplExecutor(),
    reason = new Error("pre-cancelled");
  await assert.rejects(
    execute(input({ signal: AbortSignal.abort(reason) })),
    (error) => error === reason,
  );
  const timedOut = await execute(input({ code: "while (true) {}", syncTimeoutMs: 5 }));
  assert.ok(timedOut.error);
  assert.equal((await execute(input({ code: "6 * 7" }))).result, "42");
});

test("REPL in-process completion revokes retained bridges after both success and error", async (t) => {
  const module = await worker(t, "export const saved = [];");
  const fixture = (await import(module)) as { saved: Array<{ assertAvailable(): void }> };
  const execute = createInProcessNodeReplExecutor();
  const capture = `const fixture = await import(${JSON.stringify(module)}); fixture.saved.push(globalThis[Symbol.for('knorvia.node-repl.browser-control-bridge')]);`;
  assert.equal((await execute(input({ code: capture }))).error, undefined);
  assert.match(
    (await execute(input({ code: capture + "throw new Error('cell failed')" }))).error?.message ??
      "",
    /cell failed/,
  );
  assert.equal(fixture.saved.length, 2);
  for (const bridge of fixture.saved) assert.throws(() => bridge.assertAvailable(), /stale/);
});
