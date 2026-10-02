import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { RuntimeTaskSnapshot } from "../src/runtime-task/registry.js";

export const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const read = (url: URL) => readFile(url, "utf8");
const root = new URL("../", import.meta.url);
export const surface =
  process.env.KNORVIA_WORKFLOW_RUN_SUMMARY_TEST_EMITTED === "1" ? "emitted" : "source";
const folder = surface === "emitted" ? "dist" : "src";
const extension = surface === "emitted" ? "js" : "ts";
const selector = await read(
  new URL("./runtime-task-registry-observation-pins.json", import.meta.url),
);
assert.equal(sha(selector), "dc8d21ef4beb2f4d87a60c41bf72825a8448c1290b47f45097f4ba517f6b2e31");
export const pins: { baseline: string; files: Record<string, string> } = JSON.parse(selector);

export async function loadCurrent(readArtifact = read) {
  for (const [path, expected] of Object.entries(pins.files))
    assert.equal(sha(await readArtifact(new URL(path, root))), expected, path);
  return import(new URL(`${folder}/runtime-task/registry.${extension}`, root).href) as Promise<
    typeof import("../src/runtime-task/registry.js")
  >;
}
export const current = await loadCurrent();
export const selectedURL = new URL(`${folder}/runtime-task/registry.${extension}`, root);
export const actual = await import(selectedURL.href);
export const taskOutput = (
  await import(new URL(`${folder}/tool/handlers/task-output.${extension}`, root).href)
).taskOutputToolEntry as typeof import("../src/tool/handlers/task-output.js").taskOutputToolEntry;
export const registry = () => new current.InMemoryRuntimeTaskRegistry();
export const task = (status = "running", fields: Record<string, unknown> = {}) =>
  ({
    taskId: "task",
    type: "local_dynamic_workflow",
    description: "Owned synthetic task",
    status,
    ...fields,
  }) as RuntimeTaskSnapshot;
export const message = (id: string) => ({ id, message: `Owned ${id}`, queuedAt: new Date(0) });

export function observedSignal(
  name: string,
  trace: string[],
  hooks: { add?: () => void; remove?: () => void } = {},
) {
  const controller = new AbortController();
  const signal = controller.signal;
  const add = signal.addEventListener;
  const remove = signal.removeEventListener;
  let installed: EventListenerOrEventListenerObject | undefined;
  signal.addEventListener = function (
    this: AbortSignal,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) {
    assert.equal(this, signal);
    assert.equal(type, "abort");
    assert.deepEqual(options, { once: true });
    installed = listener;
    trace.push(`${name}:add`);
    add.call(this, type, listener, options);
    hooks.add?.();
  };
  signal.removeEventListener = function (
    this: AbortSignal,
    type: string,
    listener: EventListenerOrEventListenerObject,
  ) {
    assert.equal(this, signal);
    assert.equal(type, "abort");
    assert.equal(listener, installed);
    assert.equal(arguments.length, 2);
    trace.push(`${name}:remove`);
    hooks.remove?.();
    remove.call(this, type, listener);
  };
  return { controller, signal };
}

export async function detachedAbortObservation() {
  const owner = registry();
  owner.register(task());
  const trace: string[] = [];
  const reason = new Error("Owned detached-cohort abort");
  const later = observedSignal("later", trace);
  const first = observedSignal("first", trace, {
    remove() {
      trace.push("first:abort-later");
      later.controller.abort(reason);
    },
  });
  const one = owner.waitForTerminal("task", { signal: first.signal });
  const two = owner.waitForTerminal("task", { signal: later.signal });
  const firstResult = one.then((value) => {
    trace.push("first:fulfilled");
    return value;
  });
  const laterResult = two.then(
    () => assert.fail("detached observer's earlier abort must win settlement"),
    (error: unknown) => {
      assert.equal(error, reason);
      trace.push("later:rejected");
    },
  );
  const terminal = task("completed");
  assert.equal(
    owner.update("task", () => terminal),
    terminal,
  );
  trace.push("publication:return");
  assert.equal(await firstResult, terminal);
  await laterResult;
  assert.deepEqual(trace, [
    "first:add",
    "later:add",
    "first:remove",
    "first:abort-later",
    "later:remove",
    "publication:return",
    "later:rejected",
    "first:fulfilled",
  ]);
  return trace;
}

export function drainGetterObservation() {
  const owner = registry();
  owner.register(task());
  const trace: string[] = [];
  const arrays = [message("one"), message("two"), message("three"), message("four")].map(
    (value) => [value],
  );
  let reads = 0;
  const snapshot = task();
  Object.defineProperties(snapshot, {
    beforeMessages: {
      enumerable: true,
      get() {
        trace.push("copy:before");
        return "Owned before";
      },
    },
    pendingMessages: {
      enumerable: true,
      get() {
        trace.push(`messages:${++reads}`);
        return arrays[reads - 1];
      },
    },
    afterMessages: {
      enumerable: true,
      get() {
        trace.push("copy:after");
        return "Owned after";
      },
    },
  });
  owner.update("task", () => snapshot);
  assert.equal(owner.drainMessages("task"), arrays[2]);
  assert.notEqual(owner.get("task"), snapshot);
  assert.deepEqual(owner.get("task")?.pendingMessages, []);
  assert.deepEqual(trace, [
    "messages:1",
    "messages:2",
    "messages:3",
    "copy:before",
    "messages:4",
    "copy:after",
  ]);
  return trace;
}

export async function inlineAbortObservation() {
  const traces: Record<string, string[]> = {};
  for (const operation of ["publication", "removal"] as const) {
    const owner = registry();
    owner.register(task());
    const trace: string[] = [];
    const reason = new Error(`Owned inline ${operation} abort`);
    const port = observedSignal("inline", trace, {
      add() {
        trace.push("inline:abort");
        port.controller.abort(reason);
      },
    });
    const pending = owner.waitForTerminal("task", { signal: port.signal });
    assert.ok(pending instanceof Promise);
    trace.push("wait:return");
    await pending.then(
      () => assert.fail("inline abort rejects before admission finishes"),
      (error: unknown) => {
        assert.equal(error, reason);
        trace.push("inline:rejected");
      },
    );
    if (operation === "publication") owner.update("task", () => task("completed"));
    else owner.remove("task");
    trace.push(`${operation}:return`);
    owner.remove("task");
    assert.deepEqual(trace, [
      "inline:add",
      "inline:abort",
      "wait:return",
      "inline:rejected",
      "inline:remove",
      `${operation}:return`,
    ]);
    assert.equal(owner.get("task"), undefined);
    traces[operation] = trace;
  }
  return traces;
}
