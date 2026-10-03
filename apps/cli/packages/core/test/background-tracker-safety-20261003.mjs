import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  fixture,
  flush,
  deferred,
  plain,
  repo,
  hash,
} from "./background-tracker-fixture-20261003.mjs";
const mode = process.argv[2];
assert.ok(["baseline", "current"].includes(mode));
const observations = [];
async function group(name, fn) {
  const value = await fn();
  observations.push({ name, ...value });
  console.log("ok", name);
}
await group("launch admission, shared dedupe and started failure ownership", async () => {
  const f = await fixture(mode);
  for (const output of [
    undefined,
    [],
    { status: "completed", backgroundTaskId: "x" },
    { status: "backgrounded", backgroundTaskId: "", agentId: "fallback" },
  ])
    await f.tracker.trackBackgroundTask(
      f.tool(),
      output,
      { traceId: "owned-trace", spanId: "owned-span" },
      "owned-turn",
    );
  assert.equal(f.trace.length, 0);
  const failed = { owned: "Started rejected" },
    emit = f.deps.emitEvent;
  let first = true;
  f.deps.emitEvent = async function (e) {
    if (first) {
      first = false;
      f.trace.push(["started.rejected"]);
      throw failed;
    }
    return emit.call(this, e);
  };
  await assert.rejects(f.tracking(), (e) => e === failed);
  assert.equal(f.records.size, 0);
  await f.tracking();
  assert.equal(f.events.length, 2);
  assert.equal(f.records.get("owned-task").status, "lost");
  assert.equal(f.notifications.length, 1);
  const stranded = await fixture(mode),
    registration = { owned: "register failure" };
  stranded.deps.runtimeTaskRegistry.register = () => {
    throw registration;
  };
  await assert.rejects(stranded.tracking(), (e) => e === registration);
  await stranded.tracking();
  assert.equal(stranded.events.length, 0);
  return { retried: f.summary(), stranded: stranded.summary() };
});
await group(
  "poll/wait resource race, live receivers, late running and subagent Bash limit",
  async () => {
    const f = await fixture(mode),
      wait = deferred(),
      late = deferred();
    let count = 0;
    const running = {
      taskId: "owned-task",
      status: "running",
      startedAt: new f.Clock(),
      pid: 7,
      stdoutTail: "Owned tail",
    };
    const terminal = {
      ...running,
      status: "completed",
      completedAt: new f.Clock(),
      result: { exitCode: 0 },
    };
    const originalPort = {
      getBackgroundTask(id) {
        assert.equal(this, originalPort);
        assert.equal(arguments.length, 1);
        f.trace.push(["get", id]);
        return ++count === 1 ? Promise.resolve(running) : late.promise;
      },
      waitForBackgroundTask(id) {
        assert.equal(this, originalPort);
        assert.equal(arguments.length, 1);
        f.trace.push(["wait", id]);
        return wait.promise;
      },
      cancelBackgroundTask(id) {
        assert.equal(this, originalPort);
        f.trace.push(["cancel", id]);
        return Promise.reject(Error("Owned cancellation rejection"));
      },
    };
    f.deps.executionPort = originalPort;
    f.deps.runtimeScope = "subagent";
    f.deps.subagentBackgroundBashMaxMs = 0;
    await f.tracking();
    await flush();
    assert.equal(f.events.length, 2);
    await f.tracking(f.tool("Workflow"), f.launch);
    assert.equal(f.events.length, 2);
    f.fire("timeout");
    await flush();
    f.fire("interval");
    await flush();
    wait.resolve(terminal);
    await flush();
    assert.equal(f.events.at(-1).payload.status, "completed");
    assert.equal(f.notifications.length, 1);
    late.resolve({ ...running, stdoutTail: "Owned late tail" });
    await flush();
    assert.equal(f.events.at(-1).payload.status, "running");
    assert.equal(f.timers.size, 0);
    assert.equal(f.records.get("owned-task").status, "completed");
    return f.summary();
  },
);
await group(
  "direct wait no-source success/rejection and missing-source partial publication",
  async () => {
    const f = await fixture(mode),
      waiting = deferred(),
      port = {
        waitForBackgroundTask(id) {
          assert.equal(this, port);
          assert.equal(arguments.length, 1);
          f.trace.push(["wait", id]);
          return waiting.promise;
        },
      };
    f.deps.executionPort = port;
    await f.tracking();
    await flush();
    assert.equal(f.events.length, 1);
    waiting.resolve({ taskId: "owned-task", status: "running", startedAt: new f.Clock() });
    await flush();
    assert.equal(f.events.length, 2);
    assert.equal(f.records.get("owned-task").status, "running");
    assert.equal(f.timers.size, 0);
    const rejected = await fixture(mode);
    rejected.deps.executionPort = {
      waitForBackgroundTask() {
        return Promise.reject(Error("Owned wait rejection"));
      },
    };
    await rejected.tracking();
    await flush();
    await rejected.tracking();
    await flush();
    assert.equal(rejected.events.length, 2);
    const lost = await fixture(mode),
      fail = { owned: "completed publication failure" },
      emit = lost.deps.emitEvent;
    lost.deps.emitEvent = async function (e) {
      if (e.type === "BackgroundTaskCompleted") throw fail;
      return emit.call(this, e);
    };
    await assert.rejects(lost.tracking(), (e) => e === fail);
    await lost.tracking();
    assert.equal(lost.events.length, 1);
    assert.equal(lost.notifications.length, 1);
    return { running: f.summary(), rejected: rejected.summary(), partial: lost.summary() };
  },
);
await group(
  "Agent/Task alias terminal is owned by subagent and legacy cancellation remains false",
  async () => {
    const results = [];
    for (const name of ["Agent", "Task"]) {
      const f = await fixture(mode),
        snapshot = {
          taskId: "owned-task",
          type: "local_agent",
          status: "completed",
          notified: true,
          startedAt: new f.Clock(),
          childSessionId: "owned-child",
        },
        port = {
          getTask(id) {
            assert.equal(this, port);
            assert.equal(arguments.length, 1);
            f.trace.push(["agent.get", id]);
            return Promise.resolve(snapshot);
          },
          stopTask() {
            throw Error("must not stop actual agent");
          },
          waitForTask() {
            throw Error("agent waiter must remain unused");
          },
        };
      f.deps.subagentPort = port;
      await f.tracking(f.tool(name), {
        status: "async_launched",
        agentId: "owned-task",
        childSessionId: "owned-child",
      });
      assert.equal(f.events.length, 1);
      assert.equal(f.events[0].payload.cancellable, true);
      assert.equal(f.events[0].payload.taskKind, "subagent");
      assert.equal(f.events[0].payload.childSessionId, "owned-child");
      assert.equal(f.notifications.length, 0);
      assert.equal(f.timers.size, 0);
      results.push(f.summary());
    }
    const legacy = await fixture(mode),
      port = {
        getTask() {
          return Promise.resolve({
            taskId: "owned-task",
            status: "completed",
            startedAt: new legacy.Clock(),
            output: { response: "Owned legacy response" },
          });
        },
        waitForTask() {
          throw Error("initial terminal must suppress waiter");
        },
        cancel() {
          throw Error("no legacy cancellation");
        },
      };
    legacy.deps.workflowPort = port;
    await legacy.tracking(legacy.tool("Workflow"), legacy.launch);
    assert.equal(legacy.events[0].payload.cancellable, false);
    assert.equal(legacy.events[0].payload.taskKind, "bash");
    assert.ok(legacy.notifications[0].text.includes("Owned legacy response"));
    return { aliases: results, legacy: legacy.summary() };
  },
);
await group("dynamic terminal data caps, notification policy and claim release", async () => {
  async function dynamic(options = {}) {
    const f = await fixture(mode),
      snapshot = {
        taskId: "owned-task",
        runId: "owned-task",
        name: "Owned run",
        status: "cancelled",
        runStatus: "stopped",
        stopReason: options.reason ?? "user",
        startedAt: new f.Clock(1000),
        completedAt: new f.Clock(1042),
        output: "x".repeat(4001),
        error: "e".repeat(2001),
        scriptPath: "/owned-workspace/owned.dwf.ts",
        reports: ["Owned report"],
        artifacts: [
          {
            id: "owned-artifact",
            kind: "markdown",
            version: 1,
            title: "Owned deliverable",
            description: "Owned summary",
            primary: true,
          },
        ],
      },
      port = {
        getTask(id) {
          assert.equal(this, port);
          f.trace.push(["workflow.get", id]);
          return Promise.resolve(snapshot);
        },
        waitForTask() {
          throw Error("terminal initial poll suppresses waiter");
        },
        cancel() {
          throw Error("no actual cancel");
        },
      };
    f.deps.dynamicWorkflowRunPort = port;
    f.deps.shouldEnqueueBackgroundTaskNotification = function (input) {
      assert.equal(this, f.deps);
      f.trace.push(["policy", plain(input)]);
      return options.deny ? false : true;
    };
    if (options.enqueueThrows)
      f.deps.enqueueBackgroundTaskNotification = function () {
        f.trace.push(["enqueue.throw"]);
        throw Error("Owned queue failure");
      };
    await f.tracking(f.tool("ResumeWorkflowRun", { run_id: "owned-task" }), {
      ...f.launch,
      response: "Stale launch prose",
    });
    await flush();
    return f;
  }
  const f = await dynamic();
  assert.equal(f.events[0].payload.taskKind, "workflow");
  assert.equal(f.events[0].payload.cancellable, true);
  const m = f.notifications[0].originMeta.workflowNotification;
  assert.equal(m.status, "stopped");
  assert.equal(m.result.length, 4000);
  assert.equal(m.resultTruncated, true);
  assert.equal(m.error.length, 2000);
  assert.equal(m.durationMs, 42);
  assert.equal(m.artifacts[0].id, "owned-artifact");
  assert.equal(m.reports.count, 1);
  assert.ok(!f.notifications[0].text.includes("Stale launch prose"));
  assert.equal(f.records.get("owned-task").notified, true);
  const denied = await dynamic({ deny: true });
  assert.equal(denied.notifications.length, 0);
  assert.equal(denied.records.get("owned-task").notified, false);
  const superseded = await dynamic({ reason: "superseded" });
  assert.equal(superseded.notifications.length, 0);
  assert.equal(superseded.records.get("owned-task").notified, true);
  assert.ok(!superseded.trace.some((x) => x[0] === "policy"));
  const thrown = await dynamic({ enqueueThrows: true });
  assert.equal(thrown.records.get("owned-task").notified, false);
  assert.equal(thrown.events.at(-1).payload.status, "cancelled");
  return {
    accepted: f.summary(),
    denied: denied.summary(),
    superseded: superseded.summary(),
    released: thrown.summary(),
  };
});
await group(
  "actual external-tracking executor shares duplicate tracker without real tool invocation",
  async () => {
    const f = await fixture(mode),
      wait = deferred(),
      port = {
        waitForBackgroundTask(id) {
          assert.equal(this, port);
          f.trace.push(["external.wait", id]);
          return wait.promise;
        },
      };
    const executor = f.executor({ executionPort: port });
    const trace = { traceId: "owned-trace", spanId: "owned-span" };
    await executor.trackExternalBackgroundTask(f.tool(), f.launch, trace, "owned-turn");
    await executor.trackExternalBackgroundTask(f.tool(), f.launch, trace, "owned-turn");
    await flush();
    assert.equal(f.events.length, 1);
    wait.resolve(undefined);
    await flush();
    assert.equal(f.events.length, 2);
    assert.equal(f.notifications.length, 1);
    assert.equal(f.events[0].sessionId, "owned-session");
    assert.equal(f.events[0].turnId, "owned-turn");
    return f.summary();
  },
);
const goldenPath = "apps/cli/packages/core/test/background-tracker-observations-20261003.json";
if (mode === "baseline")
  await writeFile(path.join(repo, goldenPath), JSON.stringify(observations) + "\n");
else {
  const b = await readFile(path.join(repo, goldenPath));
  assert.equal(hash(b), "1a3d7d6cbda0002a84b583a9643b7217afbef12781faae2404b2f18ffb63a13a");
  assert.deepEqual(observations, JSON.parse(b));
}
console.log(
  JSON.stringify({
    mode,
    groups: observations.length,
    liveTasksProcessesFilesProvidersGrants: 0,
    currentComparedToImmutableObservations: mode === "current",
  }),
);
