import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InMemoryRuntimeTaskRegistry,
  hasRunningBackgroundRuntimeTask,
  isTerminalRuntimeTask,
  type RuntimeTaskPendingMessage,
  type RuntimeTaskSnapshot,
} from "../src/runtime-task/registry.js";

const TASK_ID = "synthetic-task";

function task(taskId = TASK_ID, patch: Partial<RuntimeTaskSnapshot> = {}): RuntimeTaskSnapshot {
  return {
    taskId,
    type: "local_agent",
    agentId: "synthetic-agent",
    agentType: "general",
    description: "owned registry fixture",
    status: "running",
    startedAt: new Date(0),
    ...patch,
  };
}

function signalPort(hooks: {
  install?: (listener: () => void) => void;
  cleanup?: (listener: () => void) => void;
}): AbortSignal {
  return {
    aborted: false,
    reason: undefined,
    addEventListener(event: string, listener: () => void, options: { once: boolean }) {
      assert.equal(event, "abort");
      assert.deepEqual(options, { once: true });
      hooks.install?.(listener);
    },
    removeEventListener(event: string, listener: () => void) {
      assert.equal(event, "abort");
      assert.equal(arguments.length, 2);
      hooks.cleanup?.(listener);
    },
  } as unknown as AbortSignal;
}

test("registration stamps only future defaults and preserves special ids and order", () => {
  const registry = new InMemoryRuntimeTaskRegistry();
  const initial = task("__proto__");
  registry.register(initial);
  registry.register(task("second", { branchGeneration: 0 }));
  const stored = registry.get("__proto__")!;
  assert.notEqual(stored, initial);
  assert.equal(stored.startedAt, initial.startedAt);
  registry.setActiveBranchGeneration(7);
  registry.register(task("third"));
  assert.equal(stored.branchGeneration, 0);
  assert.equal(registry.get("second")!.branchGeneration, 0);
  assert.equal(registry.get("third")!.branchGeneration, 7);
  const all = registry.all();
  assert.equal(Object.getPrototypeOf(all), Object.prototype);
  assert.equal(Object.hasOwn(all, "__proto__"), true);
  assert.equal(all.__proto__, stored);
  assert.deepEqual(Object.keys(all), ["__proto__", "second", "third"]);
  registry.register(task("second"));
  assert.deepEqual(Object.keys(registry.all()), ["__proto__", "second", "third"]);
  registry.remove("second");
  registry.register(task("second"));
  assert.deepEqual(Object.keys(registry.all()), ["__proto__", "third", "second"]);
});

test("queue uses the public update receiver; drain preserves message array identity", () => {
  class ObservedRegistry extends InMemoryRuntimeTaskRegistry {
    updates = 0;
    override update(...args: Parameters<InMemoryRuntimeTaskRegistry["update"]>) {
      this.updates += 1;
      return super.update(...args);
    }
  }
  const registry = new ObservedRegistry();
  registry.register(task());
  const message: RuntimeTaskPendingMessage = {
    id: "synthetic-message",
    message: "fixture",
    queuedAt: new Date(0),
  };
  const queued = registry.queueMessage(TASK_ID, message)!;
  assert.equal(registry.updates, 1);
  assert.equal(queued.pendingMessages![0], message);
  assert.equal(registry.drainMessages(TASK_ID), queued.pendingMessages);
  assert.equal(registry.updates, 1);
  const drained = registry.get(TASK_ID)!;
  assert.notEqual(drained, queued);
  assert.deepEqual(drained.pendingMessages, []);
  assert.notEqual(registry.drainMessages(TASK_ID), registry.drainMessages(TASK_ID));
  assert.equal(registry.get(TASK_ID), drained);
});

test("immediate waits ignore signal getters and retain terminal background precedence", async () => {
  const registry = new InMemoryRuntimeTaskRegistry();
  const options = Object.defineProperty({}, "signal", {
    get() { throw new Error("must not read immediate signal"); },
  });
  assert.equal(await registry.waitForTerminal("missing", options), undefined);
  assert.equal(await registry.waitForBackgroundRequest("missing", options), undefined);
  registry.register(task(TASK_ID, { status: "completed", isBackgrounded: true }));
  assert.equal(await registry.waitForTerminal(TASK_ID, options), registry.get(TASK_ID));
  assert.equal(await registry.waitForBackgroundRequest(TASK_ID, options), registry.get(TASK_ID));
  registry.register(task(TASK_ID, { status: "completed" }));
  assert.equal(await registry.waitForBackgroundRequest(TASK_ID, options), undefined);
});

test("wait subscription is admitted by id after reentrant listener installation", async () => {
  const registry = new InMemoryRuntimeTaskRegistry();
  registry.register(task());
  let installed: (() => void) | undefined;
  let cleaned: (() => void) | undefined;
  const signal = signalPort({
    install(listener) { installed = listener; registry.remove(TASK_ID); },
    cleanup(listener) { cleaned = listener; },
  });
  const pending = registry.waitForTerminal(TASK_ID, { signal });
  assert.equal(registry.get(TASK_ID), undefined);
  registry.register(task(TASK_ID, { status: "completed" }));
  assert.equal(await pending, registry.get(TASK_ID));
  assert.equal(cleaned, installed);
});

test("terminal cleanup precedes background cleanup; new cohorts survive detached publication", async () => {
  const registry = new InMemoryRuntimeTaskRegistry();
  registry.register(task());
  const effects: string[] = [];
  let nextWait: Promise<RuntimeTaskSnapshot | undefined> | undefined;
  let replacement: RuntimeTaskSnapshot | undefined;
  const terminal = registry.waitForTerminal(TASK_ID, {
    signal: signalPort({ cleanup() {
      effects.push("terminal");
      registry.register(task());
      replacement = registry.get(TASK_ID);
      nextWait = registry.waitForTerminal(TASK_ID);
    } }),
  });
  const background = registry.waitForBackgroundRequest(TASK_ID, {
    signal: signalPort({ cleanup() { effects.push("background"); } }),
  });
  const completed = task(TASK_ID, { status: "completed", isBackgrounded: true });
  const committed = registry.update(TASK_ID, () => completed);
  assert.equal(committed, completed);
  assert.equal(await terminal, completed);
  assert.equal(await background, undefined);
  assert.deepEqual(effects, ["terminal", "background"]);
  assert.equal(registry.get(TASK_ID), replacement);
  assert.ok(nextWait);
  registry.remove(TASK_ID);
  assert.equal(await nextWait, undefined);
});

test("cleanup failure keeps commit and detached cohort; later publication cannot recover it", async () => {
  const registry = new InMemoryRuntimeTaskRegistry();
  registry.register(task());
  const failure = new Error("owned cleanup failure");
  let cleanupCalls = 0;
  let settled = false;
  void registry.waitForTerminal(TASK_ID, {
    signal: signalPort({ cleanup() { cleanupCalls += 1; throw failure; } }),
  }).then(() => { settled = true; });
  const committed = task(TASK_ID, { status: "failed" });
  assert.throws(() => registry.update(TASK_ID, () => committed), (error) => error === failure);
  assert.equal(registry.get(TASK_ID), committed);
  registry.remove(TASK_ID);
  await Promise.resolve();
  assert.equal(cleanupCalls, 1);
  assert.equal(settled, false);
});

test("pending signal getters throw synchronously while install errors reject natively", async () => {
  const registry = new InMemoryRuntimeTaskRegistry();
  registry.register(task());
  const failure = new Error("owned signal failure");
  const options = Object.defineProperty({}, "signal", { get() { throw failure; } });
  assert.throws(() => registry.waitForTerminal(TASK_ID, options), (error) => error === failure);
  const signal = signalPort({ install() { throw failure; } });
  await assert.rejects(registry.waitForTerminal(TASK_ID, { signal }), (error) => error === failure);
});

test("abort affects one observer and retains exact reason without explicit cleanup", async () => {
  const registry = new InMemoryRuntimeTaskRegistry();
  registry.register(task());
  const controller = new AbortController();
  const reason = { kind: "owned abort reason" };
  const cancelled = registry.waitForTerminal(TASK_ID, { signal: controller.signal });
  const unaffected = registry.waitForTerminal(TASK_ID);
  controller.abort(reason);
  await assert.rejects(cancelled, (error) => error === reason);
  const committed = registry.update(TASK_ID, (current) => ({ ...current, status: "completed" }));
  assert.equal(await unaffected, committed);
});

test("patcher errors preserve reentrant effects and classification stays exact", () => {
  const registry = new InMemoryRuntimeTaskRegistry();
  registry.register(task());
  const failure = new Error("owned patcher failure");
  assert.throws(() => registry.update(TASK_ID, () => {
    registry.remove(TASK_ID);
    throw failure;
  }), (error) => error === failure);
  assert.equal(registry.get(TASK_ID), undefined);
  for (const status of ["completed", "failed", "cancelled", "killed", "stopped", "lost"] as const) {
    assert.equal(isTerminalRuntimeTask({ status }), true);
  }
  registry.register(task(TASK_ID, { isBackgrounded: 1 as unknown as boolean }));
  assert.equal(hasRunningBackgroundRuntimeTask(registry), false);
  registry.requestBackground(TASK_ID);
  assert.equal(hasRunningBackgroundRuntimeTask(registry), true);
});

test("inline abort remains admitted for one later cleanup, without a second cancellation policy", async () => {
  const registry = new InMemoryRuntimeTaskRegistry();
  registry.register(task());
  let cleanupCalls = 0;
  const signal = signalPort({
    install(listener) { listener(); },
    cleanup() { cleanupCalls += 1; },
  });
  const pending = registry.waitForTerminal(TASK_ID, { signal });
  await assert.rejects(pending, { message: "Runtime task wait aborted" });
  assert.equal(cleanupCalls, 0);
  registry.remove(TASK_ID);
  registry.remove(TASK_ID);
  assert.equal(cleanupCalls, 1);
});

test("an abort in detached cleanup wins before later native settlement", async () => {
  const registry = new InMemoryRuntimeTaskRegistry();
  registry.register(task());
  const laterSignal = new AbortController();
  const reason = new Error("owned detached abort");
  const first = registry.waitForTerminal(TASK_ID, {
    signal: signalPort({ cleanup() { laterSignal.abort(reason); } }),
  });
  const later = registry.waitForTerminal(TASK_ID, { signal: laterSignal.signal });
  const rejected = assert.rejects(later, (error) => error === reason);
  const completed = registry.update(TASK_ID, (current) => ({ ...current, status: "completed" }));
  assert.equal(await first, completed);
  await rejected;
});
