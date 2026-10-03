import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  actual,
  archive,
  baseline,
  current,
  loadBaseline,
  loadCurrent,
  oldScheduler,
  pins,
  scheduler,
  surface,
} from "./workflow-node-publication-fixture.js";
import { gate, observation, ports, schedulerPorts } from "./workflow-node-publication-ports.js";

const implementations = [baseline, current];
test(`${surface}: started gate, child linkage, latest snapshot and completion publication`, async () => {
  const observations = [];
  for (const selected of implementations) {
    const f = ports(),
      held = gate<typeof f.result>();
    f.hooks.run = () => held.promise;
    const pending = selected.runWorkflowNode(f.access, f.node, f.options, 2, f.runtime);
    assert.ok(pending instanceof Promise);
    assert.ok(pending.started instanceof Promise);
    assert.notEqual(pending, pending.started);
    const active = (await pending.started).snapshot;
    assert.equal(active, f.snapshot);
    assert.equal(f.request?.node, f.node);
    assert.equal(f.request?.abortSignal, f.controller.signal);
    assert.equal(f.request?.onEvent, f.options.onEvent);
    assert.equal(f.request?.prompt, "Owned custom prompt");
    assert.equal(f.request?.cwd, "owned-cwd");
    assert.deepEqual(f.trace, [
      "snapshot:get",
      "activity:id",
      "clock:0",
      "clock:1",
      "write:active",
      "snapshot:set:active",
      "status:active",
      "event:node_started",
      "runner:run",
    ]);
    await f.request!.onChildSessionStarted!({
      sessionId: "linked-session",
      model: "linked-model",
      traceId: "linked-trace",
      turnId: "linked-turn",
    });
    assert.equal(f.snapshot.activities[0]?.sessionId, "linked-session");
    assert.equal(f.snapshot.activities[0]?.model, "linked-model");
    f.snapshot = {
      ...f.snapshot,
      task: "Owned latest task",
      graph: {
        ...f.snapshot.graph,
        nodes: [
          { ...f.node, attempts: 99 },
          { id: "other", title: "Owned other", status: "pending", kind: "task", dependsOn: [] },
        ],
      },
    };
    held.resolve(f.result);
    const outcome = await pending;
    assert.equal(outcome.snapshot, f.snapshot);
    assert.equal(outcome.ok, true);
    assert.equal(f.snapshot.task, "Owned latest task");
    assert.equal(f.snapshot.graph.nodes[0]?.attempts, 0);
    assert.equal(f.snapshot.graph.nodes[1]?.status, "pending");
    assert.equal(
      f.snapshot.activities[0]?.inputArtifactPaths,
      active.activities[0]?.inputArtifactPaths,
    );
    assert.deepEqual(f.snapshot.activities[0]?.outputArtifactPaths, ["owned/answer.md"]);
    assert.deepEqual(Object.keys(f.snapshot.activities[0]!), [
      "activityId",
      "artifactPath",
      "completedAt",
      "inputArtifactPaths",
      "kind",
      "nodeId",
      "outputArtifactPaths",
      "parentSessionId",
      "phase",
      "model",
      "sessionId",
      "startedAt",
      "status",
      "traceId",
      "turnId",
    ]);
    const count = f.writes.length;
    await f.request!.onChildSessionStarted!({ sessionId: "late-session" });
    assert.equal(f.writes.length, count);
    assert.equal(f.snapshot.activities[0]?.sessionId, f.result.sessionId);
    observations.push(observation(f, outcome));
  }
  assert.deepEqual(observations[1], observations[0]);
});

test(`${surface}: failure attempts, linked metadata, primitive errors and default prompt`, async () => {
  for (const maxAttempts of [1, 2]) {
    const observations = [];
    for (const selected of implementations) {
      const f = ports();
      delete (f.options as Partial<typeof f.options>).buildPrompt;
      f.hooks.run = async (input) => {
        await input.onChildSessionStarted!({
          sessionId: "linked-session",
          model: "linked-model",
          traceId: "linked-trace",
          turnId: "linked-turn",
        });
        throw "Owned primitive rejection";
      };
      const outcome = await selected.runWorkflowNode(
        f.access,
        f.node,
        f.options,
        maxAttempts,
        f.runtime,
      );
      const status = maxAttempts === 1 ? "failed" : "pending";
      assert.equal(outcome.ok, false);
      assert.equal(f.snapshot.graph.nodes[0]?.status, status);
      assert.equal(f.snapshot.graph.nodes[0]?.attempts, 1);
      assert.equal(f.snapshot.activities[0]?.error, "Owned primitive rejection");
      assert.equal(f.snapshot.activities[0]?.sessionId, "linked-session");
      assert.equal(f.snapshot.activities[0]?.model, "linked-model");
      assert.match(
        f.request!.prompt,
        /You are running a Knorvia Studio workflow node for phase: execute\./u,
      );
      assert.ok(f.request!.prompt.includes("- Owned input: owned/input.txt"));
      assert.equal(
        f.trace.some((value) => value.startsWith("artifact:")),
        false,
      );
      assert.deepEqual(Object.keys(f.snapshot.activities[0]!), [
        "activityId",
        "completedAt",
        "error",
        "inputArtifactPaths",
        "kind",
        "model",
        "nodeId",
        "outputArtifactPaths",
        "parentSessionId",
        "phase",
        "sessionId",
        "startedAt",
        "status",
        "traceId",
        "turnId",
      ]);
      observations.push(observation(f, outcome));
    }
    assert.deepEqual(observations[1], observations[0]);
  }
});

test(`${surface}: startup escapes, success-publication failure converts, failure-publication escapes`, async () => {
  for (const stage of ["startup", "success-event", "failure-event"] as const) {
    const observations = [];
    for (const selected of implementations) {
      const f = ports(),
        error = new Error(`Owned ${stage} failure`);
      if (stage === "startup") f.hooks.write = () => Promise.reject(error);
      if (stage === "success-event")
        f.hooks.event = (type) =>
          type === "artifact_written" ? Promise.reject(error) : Promise.resolve();
      if (stage === "failure-event") {
        f.hooks.run = () => Promise.reject(new Error("Owned runner error"));
        f.hooks.event = (type) =>
          type === "node_failed" ? Promise.reject(error) : Promise.resolve();
      }
      const pending = selected.runWorkflowNode(f.access, f.node, f.options, 2, f.runtime);
      let started = false;
      const startedObservation = pending.started.then(() => {
        started = true;
      });
      let outcome;
      if (stage === "success-event") {
        outcome = await pending;
        assert.equal(outcome.ok, false);
        assert.equal(f.snapshot.artifacts.at(-1)?.path, "owned/answer.md");
        assert.equal(f.snapshot.graph.nodes[0]?.status, "pending");
        assert.equal(f.snapshot.activities[0]?.error, error.message);
      } else {
        await assert.rejects(pending, (received) => received === error);
        outcome = error.message;
      }
      await Promise.resolve();
      assert.equal(started, stage !== "startup");
      if (started) await startedObservation;
      if (stage === "startup") assert.equal(f.snapshot.graph.nodes[0]?.status, "pending");
      if (stage === "failure-event") assert.equal(f.snapshot.graph.nodes[0]?.status, "pending");
      observations.push(observation(f, outcome));
    }
    assert.deepEqual(observations[1], observations[0]);
  }
});

test(`${surface}: queued thenables and throwing runner getter preserve error/effect order`, async () => {
  for (const mode of ["queued", "then-getter", "runner-getter"] as const) {
    const observations = [];
    for (const selected of implementations) {
      const f = ports(),
        error = new Error(`Owned ${mode} failure`);
      if (mode === "queued")
        f.hooks.run = () => ({
          then(resolve: (value: typeof f.result) => void) {
            f.trace.push("then:invoke");
            queueMicrotask(() => resolve(f.result));
          },
        });
      if (mode === "then-getter")
        f.hooks.run = () => ({
          get then() {
            f.trace.push("then:get");
            throw error;
          },
        });
      if (mode === "runner-getter")
        Object.defineProperty(f.runtime, "runner", {
          get() {
            f.trace.push("runner:get");
            throw error;
          },
        });
      const outcome = await selected.runWorkflowNode(f.access, f.node, f.options, 1, f.runtime);
      assert.equal(outcome.ok, mode === "queued");
      if (mode !== "queued") assert.equal(f.snapshot.activities[0]?.error, error.message);
      observations.push(observation(f, outcome));
    }
    assert.deepEqual(observations[1], observations[0]);
  }
});

test(`${surface}: abort controls and queued accepted-completion settlement`, async () => {
  for (const mode of ["pending", "completion"] as const) {
    const observations = [];
    for (const selected of implementations) {
      const f = ports(),
        error = new Error("Owned port rejection"),
        reason = new Error("Owned abort reason");
      const held = gate<typeof f.result>();
      if (mode === "pending") f.hooks.run = () => held.promise;
      else
        f.hooks.event = (type) => {
          if (type === "node_completed") queueMicrotask(() => f.controller.abort(reason));
          return Promise.resolve();
        };
      const pending = selected.runWorkflowNode(f.access, f.node, f.options, 2, f.runtime);
      await pending.started;
      let outcome;
      if (mode === "pending") {
        const rejection = assert.rejects(pending, (received) => received === error);
        f.controller.abort(reason);
        held.reject(error);
        await rejection;
        assert.equal(f.writes.length, 1);
        assert.equal(f.snapshot.graph.nodes[0]?.status, "active");
        outcome = error.message;
      } else {
        outcome = await pending;
        assert.equal(outcome.ok, true);
        assert.equal(f.controller.signal.aborted, true);
        assert.equal(f.snapshot.graph.nodes[0]?.status, "completed");
      }
      observations.push(observation(f, outcome));
    }
    assert.deepEqual(observations[1], observations[0]);
  }
});

test(`${surface}: actual scheduler consumer completion, error threshold and terminal abort`, async () => {
  for (const mode of ["success", "failure", "completion-abort"] as const) {
    const observations = [];
    for (const selected of [oldScheduler, scheduler]) {
      const p = schedulerPorts(),
        reason = new Error("Owned caller abort");
      if (mode === "failure") p.f.hooks.run = () => Promise.reject(new Error("Owned run error"));
      if (mode === "completion-abort")
        p.f.hooks.event = (type) => {
          if (type === "node_completed") queueMicrotask(() => p.f.controller.abort(reason));
          return Promise.resolve();
        };
      const pending = new selected.WorkflowGraphScheduler(p.deps).run(p.f.options);
      let outcome;
      if (mode === "completion-abort") {
        await assert.rejects(pending, (error) => error === reason);
        assert.equal(p.snapshots.at(-1)?.graph.nodes[0]?.status, "completed");
        assert.equal(
          p.events.some((event) => event.type === "executor_completed"),
          false,
        );
        outcome = reason.message;
      } else {
        outcome = await pending;
        assert.equal(outcome.reason, mode === "success" ? "completed" : "error_threshold");
      }
      observations.push({ trace: p.trace, events: p.events, snapshots: p.snapshots, outcome });
    }
    assert.deepEqual(observations[1], observations[0]);
  }
});

test(`${surface}: immutable oracle and strict current/private artifact selectors fail closed`, async () => {
  assert.notEqual(current.runWorkflowNode, baseline.runWorkflowNode);
  assert.equal(current.runWorkflowNode, actual.runWorkflowNode);
  assert.equal(archive.commit, "9670185fbd9ae890840b4c43a0dc22b47cd64f0e");
  await assert.rejects(loadBaseline(async () => "wrong archive"));
  const missing = new Error("Owned missing artifact");
  await assert.rejects(
    loadBaseline(async () => {
      throw missing;
    }),
    (error) => error === missing,
  );
  for (const path of Object.keys(pins.files)) {
    await assert.rejects(
      loadCurrent(async (url) =>
        url.pathname.endsWith(path) ? "wrong artifact" : readFile(url, "utf8"),
      ),
    );
    await assert.rejects(
      loadCurrent(async (url) => {
        if (url.pathname.endsWith(path)) throw missing;
        return readFile(url, "utf8");
      }),
      (error) => error === missing,
    );
  }
});
