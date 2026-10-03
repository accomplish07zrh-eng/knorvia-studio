import assert from "node:assert/strict";
import test from "node:test";
import { messageBufferCases } from "./runtime-task-registry-message-fixture.js";
import {
  current,
  detachedAbortObservation,
  drainGetterObservation,
  inlineAbortObservation,
  message,
  observedSignal,
  registry,
  surface,
  task,
} from "./runtime-task-registry-observation-fixture.js";

test(`${surface}: snapshots/messages preserve copies, identity, ordering and drain reads`, () => {
  const owner = registry();
  assert.deepEqual(owner.all(), {});
  const original = task("running", { pendingMessages: [message("first")] });
  owner.register(original);
  const stored = owner.get("task")!;
  assert.notEqual(stored, original);
  assert.equal(stored.pendingMessages, original.pendingMessages);
  assert.equal(stored.branchGeneration, 0);
  owner.setActiveBranchGeneration(7);
  assert.equal(stored.branchGeneration, 0);
  owner.register(task("running", { taskId: "other", branchGeneration: null }));
  assert.equal(owner.get("other")?.branchGeneration, 7);
  owner.register(task("running", { taskId: "2", branchGeneration: 0 }));
  owner.register(task("running", { taskId: "__proto__" }));
  owner.register(task("pending"));
  const view = owner.all();
  assert.equal(Object.getPrototypeOf(view), Object.prototype);
  assert.ok(Object.hasOwn(view, "__proto__"));
  assert.deepEqual(Object.keys(view), ["2", "task", "other", "__proto__"]);
  assert.notEqual(owner.all(), view);
  assert.equal(view.task, owner.get("task"));
  owner.remove("other");
  owner.register(task("running", { taskId: "other" }));
  assert.deepEqual(Object.keys(owner.all()), ["2", "task", "__proto__", "other"]);
  let calls = 0;
  assert.equal(
    owner.update("absent", () => {
      calls++;
      return task();
    }),
    undefined,
  );
  assert.equal(calls, 0);
  const replaced = task("running", { taskId: "different", pendingMessages: [message("one")] });
  owner.update("task", (input) => {
    assert.equal(input, view.task);
    calls++;
    return replaced;
  });
  assert.equal(calls, 1);
  assert.equal(owner.get("task"), replaced);
  assert.equal(owner.get("different"), undefined);
  const update = owner.update;
  owner.update = function (id, patcher) {
    assert.equal(this, owner);
    calls++;
    return update.call(this, id, patcher);
  };
  const queued = message("two");
  replaced.messageSink = {
    send() {
      assert.fail("queue must not send");
    },
  };
  const next = owner.queueMessage("task", queued)!;
  assert.equal(calls, 2);
  assert.equal(next, owner.get("task"));
  assert.notEqual(next.pendingMessages, replaced.pendingMessages);
  assert.equal(next.pendingMessages?.[0], replaced.pendingMessages?.[0]);
  assert.equal(next.pendingMessages?.[1], queued);
  assert.equal(next.messageSink, replaced.messageSink);
  assert.equal(owner.drainMessages("task"), next.pendingMessages);
  const drained = owner.get("task");
  assert.notEqual(drained, next);
  assert.notEqual(drained?.pendingMessages, next.pendingMessages);
  const empty = owner.drainMessages("task");
  assert.deepEqual(empty, []);
  assert.notEqual(owner.drainMessages("task"), empty);
  assert.equal(owner.get("task"), drained);
  assert.equal(calls, 2, "drain does not call public update");
  assert.deepEqual(owner.drainMessages("missing"), []);
  drainGetterObservation();
});

test(`${surface}: classification and immediate waits precede options admission`, async () => {
  const owner = registry();
  const options = {
    get signal(): AbortSignal {
      return assert.fail("immediate wait read options");
    },
  };
  assert.equal(await owner.waitForTerminal("missing", options), undefined);
  assert.equal(await owner.waitForBackgroundRequest("missing", options), undefined);
  for (const status of ["completed", "failed", "cancelled", "killed", "stopped", "lost"]) {
    assert.equal(current.isTerminalRuntimeTask(task(status)), true);
    owner.register(task(status));
    assert.equal(await owner.waitForTerminal("task", options), owner.get("task"));
    assert.equal(await owner.waitForBackgroundRequest("task", options), undefined);
    assert.equal(owner.requestBackground("task"), false);
  }
  assert.equal(current.isTerminalRuntimeTask(task("pending")), false);
  assert.equal(current.isTerminalRuntimeTask(task("future_status")), false);
  owner.register(task("completed", { isBackgrounded: true }));
  assert.equal(await owner.waitForBackgroundRequest("task", options), owner.get("task"));
  let calls = 0;
  const helperOwner = {
    all() {
      assert.equal(this, helperOwner);
      calls++;
      return owner.all();
    },
  };
  assert.equal(current.hasRunningBackgroundRuntimeTask(helperOwner as any), false);
  assert.equal(calls, 1);
  owner.register(task("running", { isBackgrounded: true }));
  assert.equal(current.hasRunningBackgroundRuntimeTask(owner), true);
  owner.register(task("running", { isBackgrounded: "truthy" }));
  assert.equal(current.hasRunningBackgroundRuntimeTask(owner), false);
  assert.equal(await owner.waitForBackgroundRequest("task", options), owner.get("task"));
});

test(`${surface}: pending native promises, synchronous reads and inline abort admission`, async () => {
  const owner = registry();
  owner.register(task());
  const failure = new Error("Owned setup failure");
  assert.throws(
    () =>
      owner.waitForTerminal("task", {
        get signal(): AbortSignal {
          throw failure;
        },
      }),
    (error) => error === failure,
  );
  assert.throws(
    () =>
      owner.waitForBackgroundRequest("task", {
        signal: {
          get aborted(): boolean {
            throw failure;
          },
        } as unknown as AbortSignal,
      }),
    (error) => error === failure,
  );
  const install = observedSignal("install", []);
  install.signal.addEventListener = function () {
    assert.equal(this, install.signal);
    throw failure;
  };
  const failedInstall = owner.waitForTerminal("task", { signal: install.signal });
  assert.ok(failedInstall instanceof Promise);
  await assert.rejects(failedInstall, (error) => error === failure);
  const aborted = observedSignal("preaborted", []);
  aborted.controller.abort(failure);
  await assert.rejects(
    owner.waitForTerminal("task", { signal: aborted.signal }),
    (error) => error === failure,
  );
  const nullReason = new AbortController();
  nullReason.abort(null);
  await assert.rejects(owner.waitForBackgroundRequest("task", { signal: nullReason.signal }), {
    name: "Error",
    message: "Runtime task wait aborted",
  });
  const first = owner.waitForTerminal("task");
  const second = owner.waitForTerminal("task");
  assert.ok(first instanceof Promise);
  assert.notEqual(first, second);
  let settled = false;
  const result = first.then((value) => {
    settled = true;
    return value;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  const trace: string[] = [];
  const cancelled = observedSignal("cancelled", trace);
  const wait = owner.waitForTerminal("task", { signal: cancelled.signal });
  const rejected = assert.rejects(wait, (error) => error === failure);
  cancelled.controller.abort(failure);
  await rejected;
  const terminal = task("completed");
  owner.update("task", () => terminal);
  assert.equal(await result, terminal);
  assert.equal(await second, terminal);
  assert.deepEqual(trace, ["cancelled:add"], "abort does not explicitly remove listener");
  await inlineAbortObservation();
});

test(`${surface}: terminal/background publication commits first and preserves native order`, async () => {
  const owner = registry();
  owner.register(task());
  const trace: string[] = [];
  const terminal = task("completed", { isBackgrounded: true });
  const one = observedSignal("terminal", trace, {
    remove() {
      assert.equal(owner.get("task"), terminal);
    },
  });
  const two = observedSignal("background", trace);
  const first = owner.waitForTerminal("task", { signal: one.signal }).then((value) => {
    trace.push("terminal:fulfilled");
    return value;
  });
  const second = owner.waitForBackgroundRequest("task", { signal: two.signal }).then((value) => {
    trace.push("background:fulfilled");
    return value;
  });
  owner.update("task", () => terminal);
  trace.push("publication:return");
  assert.equal(await first, terminal);
  assert.equal(await second, undefined);
  assert.deepEqual(trace, [
    "terminal:add",
    "background:add",
    "terminal:remove",
    "background:remove",
    "publication:return",
    "terminal:fulfilled",
    "background:fulfilled",
  ]);
  owner.register(task());
  const background = owner.waitForBackgroundRequest("task");
  assert.equal(owner.requestBackground("task"), true);
  const copy = owner.get("task");
  assert.equal(await background, copy);
  assert.equal(owner.requestBackground("task"), true);
  assert.notEqual(owner.get("task"), copy);
  assert.equal(owner.requestBackground("absent"), false);
  owner.register(task());
  const removedTerminal = owner.waitForTerminal("task");
  const removedBackground = owner.waitForBackgroundRequest("task");
  owner.remove("task");
  assert.equal(await removedTerminal, undefined);
  assert.equal(await removedBackground, undefined);
  await detachedAbortObservation();
});

test(`${surface}: reentrant admission, registration, removal and patcher partial effects`, async () => {
  const owner = registry();
  owner.register(task());
  const install = observedSignal("install", [], {
    add() {
      owner.remove("task");
    },
  });
  const afterDeletion = owner.waitForTerminal("task", { signal: install.signal });
  assert.equal(owner.get("task"), undefined);
  owner.register(task("completed"));
  assert.equal(await afterDeletion, owner.get("task"));
  owner.register(task());
  let nested: Promise<unknown> | undefined;
  const replacement = task();
  const reentrant = observedSignal("reentrant", [], {
    remove() {
      owner.register(replacement);
      nested = owner.waitForTerminal("task");
    },
  });
  const pending = owner.waitForTerminal("task", { signal: reentrant.signal });
  const published = task("completed");
  owner.update("task", () => published);
  assert.equal(await pending, published);
  const currentReplacement = owner.get("task");
  assert.notEqual(currentReplacement, replacement);
  assert.equal(currentReplacement?.status, "running");
  let nestedSettled = false;
  const checked = nested!.then((value) => {
    nestedSettled = true;
    return value;
  });
  await Promise.resolve();
  assert.equal(nestedSettled, false);
  owner.remove("task");
  assert.equal(await checked, undefined);
  owner.register(task());
  const beforePatch = owner.get("task");
  const removed = owner.waitForTerminal("task");
  const returned = task("completed", { taskId: "different" });
  assert.equal(
    owner.update("task", (input) => {
      assert.equal(input, beforePatch);
      owner.remove("task");
      owner.register(task());
      return returned;
    }),
    returned,
  );
  assert.equal(await removed, undefined);
  assert.equal(owner.get("task"), returned);
  const failure = new Error("Owned patcher failure");
  assert.throws(
    () =>
      owner.update("task", () => {
        owner.remove("task");
        throw failure;
      }),
    (error) => error === failure,
  );
  assert.equal(owner.get("task"), undefined);
});

test(`${surface}: throwing cleanup retains commit/detachment and abandons later publication`, async () => {
  const owner = registry();
  owner.register(task());
  const trace: string[] = [];
  const failure = new Error("Owned cleanup failure");
  const first = observedSignal("first", trace, {
    remove() {
      throw failure;
    },
  });
  const later = observedSignal("later", trace);
  const background = observedSignal("background", trace);
  const pending = owner.waitForTerminal("task", { signal: first.signal });
  const remaining = owner.waitForTerminal("task", { signal: later.signal });
  const bg = owner.waitForBackgroundRequest("task", { signal: background.signal });
  let settlements = 0;
  const observe = (p: Promise<unknown>) =>
    p.then(
      (value) => {
        settlements++;
        return value;
      },
      (error: unknown) => {
        settlements++;
        assert.equal(error, failure);
        return "aborted";
      },
    );
  const a = observe(pending),
    b = observe(remaining),
    c = observe(bg);
  const terminal = task("completed");
  assert.throws(
    () => owner.update("task", () => terminal),
    (error) => error === failure,
  );
  assert.equal(owner.get("task"), terminal);
  await Promise.resolve();
  assert.equal(settlements, 0);
  assert.deepEqual(trace, ["first:add", "later:add", "background:add", "first:remove"]);
  owner.remove("task");
  assert.equal(await c, undefined);
  assert.equal(settlements, 1);
  assert.deepEqual(trace, [
    "first:add",
    "later:add",
    "background:add",
    "first:remove",
    "background:remove",
  ]);
  first.controller.abort(failure);
  later.controller.abort(failure);
  assert.equal(await a, "aborted");
  assert.equal(await b, "aborted");
  owner.remove("task");
  assert.equal(trace.filter((value) => value.endsWith(":remove")).length, 2);
});
for (const observation of messageBufferCases) {
  test(`${surface}: ${observation.name}`, () => observation.observe(registry));
}
