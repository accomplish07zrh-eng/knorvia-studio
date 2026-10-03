import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InMemoryRuntimeTaskRegistry,
  hasRunningBackgroundRuntimeTask,
  type RuntimeTaskPendingMessage,
  type RuntimeTaskRegistry,
  type RuntimeTaskSnapshot,
} from "../src/runtime-task/registry.js";

const TASK_ID = "synthetic-order-task";

function task(taskId = TASK_ID, patch: Partial<RuntimeTaskSnapshot> = {}): RuntimeTaskSnapshot {
  return {
    taskId,
    type: "local_agent",
    agentId: "synthetic-order-agent",
    agentType: "general",
    description: "owned accessor fixture",
    status: "running",
    startedAt: new Date(0),
    ...patch,
  };
}

function signalPort(hooks: {
  reason?: unknown;
  install?: (listener: () => void) => void;
  cleanup?: (listener: () => void) => void;
}): AbortSignal {
  return {
    aborted: false,
    reason: hooks.reason,
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

test("register and nonempty drain preserve accessor stages and returned message identity", () => {
  const registry = new InMemoryRuntimeTaskRegistry();
  const effects: string[] = [];
  const metadata = { fixture: "nested" };
  const marker = Symbol("owned marker");
  let generationReads = 0;
  const initial = Object.defineProperties(task(), {
    branchGeneration: {
      enumerable: true,
      get() {
        effects.push(`generation:${++generationReads}`);
        return undefined;
      },
    },
    afterGeneration: {
      enumerable: true,
      get() {
        effects.push("after-generation");
        return metadata;
      },
    },
    [marker]: {
      enumerable: true,
      get() {
        effects.push("symbol");
        return metadata;
      },
    },
  });
  registry.setActiveBranchGeneration(11);
  registry.register(initial);
  assert.deepEqual(effects, ["generation:1", "after-generation", "symbol", "generation:2"]);
  const stored = registry.get(TASK_ID)!;
  assert.equal(stored.branchGeneration, 11);
  assert.equal(Reflect.get(stored, marker), metadata);
  assert.deepEqual(Object.keys(stored).slice(-2), ["branchGeneration", "afterGeneration"]);

  const message: RuntimeTaskPendingMessage = {
    id: "synthetic-order-message",
    message: "fixture",
    queuedAt: new Date(0),
  };
  const arrays = [[message], [message], [message], [message]];
  let messageReads = 0;
  const accessor = Object.defineProperties(task(), {
    beforeMessages: {
      enumerable: true,
      get() {
        effects.push("copy-before");
        return metadata;
      },
    },
    pendingMessages: {
      enumerable: true,
      get() {
        effects.push(`messages:${++messageReads}`);
        return arrays[messageReads - 1];
      },
    },
    afterMessages: {
      enumerable: true,
      get() {
        effects.push("copy-after");
        return metadata;
      },
    },
  });
  registry.update(TASK_ID, () => accessor);
  effects.length = 0;
  const drained = registry.drainMessages(TASK_ID);
  assert.equal(drained, arrays[2]);
  assert.deepEqual(effects, [
    "messages:1",
    "messages:2",
    "messages:3",
    "copy-before",
    "messages:4",
    "copy-after",
  ]);
  const replacement = registry.get(TASK_ID)!;
  assert.notEqual(replacement, accessor);
  assert.deepEqual(replacement.pendingMessages, []);
  assert.equal(Reflect.get(replacement, "beforeMessages"), metadata);
  assert.equal(Reflect.get(replacement, "afterMessages"), metadata);
});

test("terminal publication rereads background after cleanup and releases the new background cohort", async () => {
  const registry = new InMemoryRuntimeTaskRegistry();
  registry.register(task());
  const effects: string[] = [];
  let lateBackground: Promise<RuntimeTaskSnapshot | undefined> | undefined;
  const terminal = registry.waitForTerminal(TASK_ID, {
    signal: signalPort({
      cleanup() {
        effects.push("terminal-cleanup");
        registry.register(task());
      },
    }),
  });
  const background = registry.waitForBackgroundRequest(TASK_ID, {
    signal: signalPort({
      cleanup() {
        effects.push("background-cleanup");
        lateBackground = registry.waitForBackgroundRequest(TASK_ID, {
          signal: signalPort({
            cleanup() {
              effects.push("late-cleanup");
            },
          }),
        });
      },
    }),
  });
  const completed = Object.defineProperties(task(), {
    status: {
      enumerable: true,
      get() {
        effects.push("status-read");
        return "completed";
      },
    },
    isBackgrounded: {
      enumerable: true,
      get() {
        effects.push("background-read");
        return true;
      },
    },
  });
  assert.equal(
    registry.update(TASK_ID, () => completed),
    completed,
  );
  assert.deepEqual(effects, [
    "status-read",
    "terminal-cleanup",
    "background-cleanup",
    "background-read",
    "late-cleanup",
  ]);
  assert.equal(await terminal, completed);
  assert.equal(await background, undefined);
  assert.ok(lateBackground);
  assert.equal(await lateBackground, completed);
  assert.notEqual(registry.get(TASK_ID), completed);
  assert.equal(registry.get(TASK_ID)!.status, "running");
});

test("detached abort retains FIFO cleanup and cannot remove a newly admitted cohort", async () => {
  const registry = new InMemoryRuntimeTaskRegistry();
  registry.register(task());
  const effects: string[] = [];
  const reason = { kind: "owned-detached-abort" };
  let abortLater: (() => void) | undefined;
  let next: Promise<RuntimeTaskSnapshot | undefined> | undefined;
  const first = registry.waitForTerminal(TASK_ID, {
    signal: signalPort({
      cleanup() {
        effects.push("first-cleanup");
        registry.register(task());
        next = registry.waitForTerminal(TASK_ID, {
          signal: signalPort({
            cleanup() {
              effects.push("next-cleanup");
            },
          }),
        });
        assert.ok(abortLater);
        abortLater();
      },
    }),
  });
  const cancelled = registry.waitForTerminal(TASK_ID, {
    signal: signalPort({
      reason,
      install(listener) {
        abortLater = listener;
      },
      cleanup() {
        effects.push("cancelled-cleanup");
      },
    }),
  });
  const rejected = assert.rejects(cancelled, (error) => error === reason);
  const last = registry.waitForTerminal(TASK_ID, {
    signal: signalPort({
      cleanup() {
        effects.push("last-cleanup");
      },
    }),
  });
  void first.then(() => {
    effects.push("first-continuation");
  });
  const completed = task(TASK_ID, { status: "completed" });
  registry.update(TASK_ID, () => completed);
  assert.deepEqual(effects, ["first-cleanup", "cancelled-cleanup", "last-cleanup"]);
  assert.equal(await first, completed);
  await rejected;
  assert.equal(await last, completed);
  assert.ok(next);
  registry.remove(TASK_ID);
  assert.equal(await next, undefined);
  assert.deepEqual(effects, [
    "first-cleanup",
    "cancelled-cleanup",
    "last-cleanup",
    "first-continuation",
    "next-cleanup",
  ]);
});

test("background immediate flag reread precedes options and pending aborted errors remain synchronous", async () => {
  const registry = new InMemoryRuntimeTaskRegistry();
  registry.register(task());
  const effects: string[] = [];
  let flagReads = 0;
  const completed = Object.defineProperties(task(), {
    status: {
      enumerable: true,
      get() {
        effects.push("status");
        return "completed";
      },
    },
    isBackgrounded: {
      enumerable: true,
      get() {
        effects.push(`flag:${++flagReads}`);
        return flagReads > 1;
      },
    },
  });
  registry.update(TASK_ID, () => completed);
  effects.length = 0;
  flagReads = 0;
  const options = Object.defineProperty({}, "signal", {
    get() {
      throw new Error("immediate path must ignore this accessor");
    },
  });
  const immediate = registry.waitForBackgroundRequest(TASK_ID, options);
  assert.deepEqual(effects, ["flag:1", "status", "flag:2"]);
  registry.register(task());
  const failure = new Error("owned aborted getter failure");
  const signal = Object.defineProperty({}, "aborted", {
    get() {
      throw failure;
    },
  });
  const pendingOptions = Object.defineProperty({}, "signal", {
    get() {
      effects.push("signal");
      return signal;
    },
  });
  effects.length = 0;
  assert.throws(
    () => registry.waitForTerminal(TASK_ID, pendingOptions),
    (error) => error === failure,
  );
  assert.throws(
    () => registry.waitForBackgroundRequest(TASK_ID, pendingOptions),
    (error) => error === failure,
  );
  assert.deepEqual(effects, ["signal", "signal"]);
  assert.equal(await immediate, completed);
});

test("running-background helper materializes every record value before the short-circuit scan", () => {
  const effects: string[] = [];
  const first = Object.defineProperties(task("first"), {
    isBackgrounded: {
      enumerable: true,
      get() {
        effects.push("first-flag");
        return true;
      },
    },
    status: {
      enumerable: true,
      get() {
        effects.push("first-status");
        return "running";
      },
    },
  });
  const second = Object.defineProperty(task("second"), "isBackgrounded", {
    get() {
      throw new Error("a successful first value must stop flag inspection");
    },
  });
  const records = Object.defineProperties(
    {},
    {
      first: {
        enumerable: true,
        get() {
          effects.push("first-value");
          return first;
        },
      },
      second: {
        enumerable: true,
        get() {
          effects.push("second-value");
          return second;
        },
      },
    },
  );
  const registry = {
    all() {
      effects.push("all");
      return records;
    },
  } as unknown as RuntimeTaskRegistry;
  assert.equal(hasRunningBackgroundRuntimeTask(registry), true);
  assert.deepEqual(effects, ["all", "first-value", "second-value", "first-flag", "first-status"]);
});
