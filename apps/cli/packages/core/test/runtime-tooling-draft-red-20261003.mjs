import assert from "node:assert/strict";
import { fixture, load, trace } from "./runtime-tooling-fixture-20261003.mjs";
let failures = 0;
for (const name of ["accepted-mailbox", "notification-trace", "registration-replaces-config"]) {
  const f = fixture();
  if (name === "accepted-mailbox") f.deps.sessionMailboxPort = {};
  if (name === "registration-replaces-config") {
    const register = f.ports.registerBuiltInTools;
    f.ports.registerBuiltInTools = (...args) => {
      register(...args);
      f.runtime.config = { taskType: "subagent_child", hooks: { enabled: true } };
    };
    f.deps.executionPort = {};
  }
  const api = await load("draft", f.ports);
  api.initializeRuntimeTooling(f.runtime, f.deps, "owned-init-session");
  try {
    if (name === "accepted-mailbox") {
      await f.mailboxOptions.enqueuePendingInput({ owned: "input" }, trace);
      assert.deepEqual(f.warnings, []);
    } else if (name === "notification-trace") {
      f.runtime.shuttingDown = true;
      const context = { traceId: "owned-notification-trace", turnId: "owned-notification-turn" };
      f.executorOptions.shouldEnqueueBackgroundTaskNotification({
        status: "completed",
        taskId: "owned-task",
        toolName: "Bash",
        traceContext: context,
      });
      assert.equal(f.warnings[0][1].traceId, context.traceId);
    } else {
      assert.equal(f.calls.includes("configured"), true);
      assert.equal(f.executorOptions.runtimeScope, "subagent");
    }
    throw Error("Expected preserved draft regression missing: " + name);
  } catch (error) {
    assert.ok(error instanceof assert.AssertionError, error);
    failures++;
    console.log(
      JSON.stringify({
        name,
        expected: error.expected,
        actual: error.actual,
        preservedFailure: true,
      }),
    );
  }
}
assert.equal(failures, 3);
console.log(JSON.stringify({ initialDraftCounterexamples: failures, repairedChecks: 0 }));
