import assert from "node:assert/strict";
import { fixture, load } from "./runtime-tooling-fixture-20261003.mjs";
const mode = process.argv[2],
  f = fixture(),
  api = await load(mode, f.ports);
api.initializeRuntimeTooling(f.runtime, f.deps, "owned-init-session");
const traceContext = { traceId: "owned-notification-trace", turnId: "owned-notification-turn" };
const input = { status: "completed", taskId: "owned-task", toolName: "Bash", traceContext };
f.runtime.shuttingDown = true;
assert.equal(f.executorOptions.shouldEnqueueBackgroundTaskNotification(input), false);
assert.equal(f.warnings[0][1].traceId, traceContext.traceId);
assert.equal(f.warnings[0][1].turnId, traceContext.turnId);
f.runtime.shuttingDown = false;
f.runtime.config.taskType = "subagent_child";
f.runtime.backgroundTaskNotificationsSealed = true;
assert.equal(f.executorOptions.shouldEnqueueBackgroundTaskNotification(input), false);
assert.equal(f.warnings[1][1].traceId, traceContext.traceId);
assert.equal(f.warnings[1][1].turnId, traceContext.turnId);
console.log(
  JSON.stringify({
    mode,
    appendedConcreteNotificationTraceGroup: 1,
    sourceOfTrace: "input",
    realOperations: 0,
  }),
);
