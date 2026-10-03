import assert from "node:assert/strict";
import { test } from "node:test";
import type { KnorviaSessionStateSnapshot, KnorviaTaskMeta } from "@knorvia/shared";
import type { SessionSummary, SessionsIndexTopicFrame } from "@knorvia/shared/protocol-v4";

const drain = () => new Promise<void>((resolve) => setImmediate(resolve));

test("projection consequences retain write boundaries, notification order and unread ownership", async (t) => {
  t.mock.module("@knorvia/shared", {
    namedExports: {
      KNORVIA_AGENT_PROVIDER: "knorvia",
      generateTraceId: (id: string) => "trace-" + id,
      resolveWorkspaceKey: (value: { workspacePath: string; workspaceIdentity?: string }) =>
        value.workspaceIdentity || value.workspacePath,
      deriveKnorviaTaskStatusFromSessionSnapshot: () => "completed",
      getKnorviaUserVisibleMessages: (value: unknown) => value,
      isKnorviaGoalContinuationReminderText: () => false,
      isKnorviaModelOnlySyntheticUserMessage: () => false,
      resolveKnorviaVisibleSessionTitle: () => "synthetic-title",
    },
  });
  t.mock.module("../src/agent/repairSubagentTaskIndex.js", {
    namedExports: {
      repairSubagentTaskIndex: async () => {},
    },
  });
  t.mock.module("../src/agent/configOptions.js", {
    namedExports: {
      formatTaskMetaModelSelectionFromSnapshot: () => "synthetic-model",
    },
  });
  const { createSessionIndexProjection } =
    await import("../src/agent/task-index-ingestion/sessionIndexProjection.js");
  const { createSnapshotProjection } =
    await import("../src/agent/task-index-ingestion/snapshotProjection.js");
  type Ports = Parameters<typeof createSessionIndexProjection>[0];
  type Patch = Parameters<Ports["repo"]["applyAgentPatch"]>[0];
  type Read = Parameters<Ports["agent"]["readSession"]>[0];
  const workspace = {
    workspacePath: "synthetic/workspace",
    workspaceIdentity: "synthetic-identity",
  };
  const target = { ...workspace, sessionId: "synthetic-session" };
  const row = { ...workspace, taskId: target.sessionId } as KnorviaTaskMeta;
  const snapshot = { session: { sessionId: target.sessionId } } as KnorviaSessionStateSnapshot;
  const effects: string[] = [];
  const patches: Patch[] = [];
  const reads: Read[] = [];
  const events: Parameters<Ports["emit"]>[] = [];
  const publications: Parameters<Ports["sync"]>[] = [];
  const warnings: unknown[][] = [];
  let patch: (input: Patch) => Promise<KnorviaTaskMeta | null> = () => Promise.resolve(row);
  let read: () => Promise<KnorviaSessionStateSnapshot> = () => Promise.resolve(snapshot);
  let publish: () => Promise<KnorviaTaskMeta> = () => Promise.resolve(row);
  let notificationFailure: { value: unknown } | undefined;
  const repo = {
    seedTaskMetaIfMissing: async (value: KnorviaTaskMeta) => value,
    applyAgentPatch(input: Patch) {
      effects.push("patch");
      patches.push(input);
      return patch(input);
    },
  } as unknown as Ports["repo"];
  const ports: Ports = {
    target: workspace,
    repo,
    agent: {
      readSession(input: Read) {
        effects.push("read");
        reads.push(input);
        return read();
      },
    } as unknown as Ports["agent"],
    logger: {
      warn(...args: unknown[]) {
        effects.push("warn");
        warnings.push(args);
      },
      debug() {},
    } as Ports["logger"],
    emit(...args) {
      effects.push("emit");
      events.push(args);
      if (notificationFailure) throw notificationFailure.value;
    },
    terminal() {
      effects.push("terminal", "ready");
    },
    captureGenerationGuard: () => () => true,
    sync(...args) {
      effects.push("sync");
      publications.push(args);
      return publish();
    },
  };
  function summary(phase: SessionSummary["phase"], extra: Partial<SessionSummary> = {}) {
    return {
      sessionId: target.sessionId,
      phase,
      title: "old title",
      createdAt: 1,
      lastActivityAt: 2,
      ...extra,
    } as SessionSummary;
  }
  function initial(value: SessionSummary): SessionsIndexTopicFrame {
    return {
      payload: { kind: "snapshot", snapshot: { sessions: [value] } },
    } as SessionsIndexTopicFrame;
  }
  function change(value: SessionSummary): SessionsIndexTopicFrame {
    return {
      payload: { kind: "deltas", deltas: [{ op: "session.upserted", session: value }] },
    } as SessionsIndexTopicFrame;
  }
  async function fresh(phase: SessionSummary["phase"] = "running") {
    effects.length =
      patches.length =
      reads.length =
      events.length =
      publications.length =
      warnings.length =
        0;
    patch = () => Promise.resolve(row);
    read = () => Promise.resolve(snapshot);
    publish = () => Promise.resolve(row);
    notificationFailure = undefined;
    const projection = createSessionIndexProjection(ports);
    projection.apply(initial(summary(phase)));
    await drain();
    assert.deepEqual(effects, []);
    return projection;
  }
  await t.test("terminal callback and patch admission precede acknowledgement", async () => {
    const projection = await fresh();
    let acknowledge!: (value: KnorviaTaskMeta | null) => void;
    patch = () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      });
    projection.apply(change(summary("error")));
    assert.deepEqual(effects, ["terminal", "ready", "patch"]);
    assert.equal("lastError" in (patches[0]?.patch ?? {}), false);
    assert.equal(events.length, 0);
    acknowledge(row);
    await drain();
    assert.deepEqual(effects, ["terminal", "ready", "patch", "emit", "read", "sync"]);
    assert.deepEqual(events[0]?.[3], { unreadSignal: "background_terminal" });
    assert.deepEqual(reads, [{ ...target, runtimePolicy: "existing-only" }]);
    assert.equal(publications[0]?.[0], snapshot);
    assert.deepEqual(publications[0]?.[1], {
      broadcastReason: "task_status_changed",
      moveGroupedTaskToTop: false,
    });
    assert.equal(publications[0]?.[1].unreadSignal, undefined);
    assert.equal(Object.hasOwn(publications[0]?.[1] ?? {}, "unreadSignal"), false);
  });
  await t.test(
    "missing terminal row transfers unread exactly once and retains explicit completed clearing",
    async () => {
      const projection = await fresh("draft");
      patch = () => Promise.resolve(null);
      projection.apply(change(summary("completedSuccess", { goalStatus: "verified" })));
      await drain();
      assert.equal(Object.hasOwn(patches[0]?.patch ?? {}, "lastError"), true);
      assert.equal(patches[0]?.patch.lastError, undefined);
      assert.equal(events.length, 0);
      assert.deepEqual(publications[0]?.[1], {
        unreadSignal: "background_terminal",
        broadcastReason: "task_status_changed",
        moveGroupedTaskToTop: true,
      });
      assert.deepEqual(effects, ["terminal", "ready", "patch", "read", "sync"]);
    },
  );
  await t.test("unverified completion has no unread notification or handoff", async () => {
    const projection = await fresh();
    projection.apply(
      change(
        summary("completedInterrupted", { goalStatus: "active" as SessionSummary["goalStatus"] }),
      ),
    );
    await drain();
    assert.equal(events[0]?.[3], undefined);
    assert.equal(Object.hasOwn(publications[0]?.[1] ?? {}, "unreadSignal"), false);
  });
  for (const exists of [true, false]) {
    await t.test("title update retains row presence policy: " + String(exists), async () => {
      const projection = await fresh();
      patch = () => Promise.resolve(exists ? row : null);
      projection.apply(change(summary("running", { title: "new title" })));
      await drain();
      assert.equal(patches[0]?.patch.title, "new title");
      assert.equal(events.length, exists ? 1 : 0);
      if (exists) {
        assert.equal(events[0]?.[2], "task_title_changed");
        assert.equal(events[0]?.[3], undefined);
        assert.equal(reads.length, 0);
      } else {
        assert.deepEqual(publications[0]?.[1], {
          broadcastReason: "task_status_changed",
          moveGroupedTaskToTop: true,
        });
      }
    });
  }
  await t.test("synchronous repository submission failure escapes the frame callback", async () => {
    const projection = await fresh();
    const failure = new Error("synchronous submit");
    patch = () => {
      throw failure;
    };
    assert.throws(
      () => projection.apply(change(summary("running", { title: "new title" }))),
      (error) => error === failure,
    );
    await drain();
    assert.deepEqual(effects, ["patch"]);
    assert.equal(warnings.length, 0);
    assert.equal(reads.length, 0);
  });
  for (const phase of ["error", "running"] as const) {
    await t.test("rejected patch warns without starting readback: " + phase, async () => {
      const projection = await fresh();
      patch = () => Promise.reject(undefined);
      projection.apply(change(summary(phase, { title: "new title" })));
      await drain();
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0]?.[2], undefined);
      assert.equal(events.length, 0);
      assert.equal(reads.length, 0);
    });
  }
  await t.test(
    "notification failure stops terminal readback and enters patch completion warning",
    async () => {
      const projection = await fresh();
      const failure = new Error("notification failure");
      notificationFailure = { value: failure };
      projection.apply(change(summary("error")));
      await drain();
      assert.equal(warnings[0]?.[2], failure);
      assert.equal(reads.length, 0);
      assert.equal(warnings.length, 1);
    },
  );
  for (const stage of ["capture", "publish"] as const) {
    await t.test("readback failure keeps its value and warns once: " + stage, async () => {
      const projection = await fresh();
      patch = () => Promise.resolve(null);
      if (stage === "capture")
        read = () => {
          throw false;
        };
      else publish = () => Promise.reject(false);
      projection.apply(change(summary("running", { title: "new title" })));
      await drain();
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0]?.[2], false);
      assert.equal(publications.length, stage === "capture" ? 0 : 1);
      assert.equal(reads.length, 1);
    });
  }
  await t.test(
    "model-only completion keeps object identity, single-field shape and sync/async failure policy",
    async () => {
      const updates: unknown[] = [];
      const logs: unknown[][] = [];
      let update: () => Promise<KnorviaTaskMeta> = () => Promise.resolve(row);
      const port = createSnapshotProjection(
        {
          updateTaskState(input: unknown) {
            updates.push(input);
            return update();
          },
        } as unknown as Parameters<typeof createSnapshotProjection>[0],
        () => assert.fail("model-only must not broadcast"),
        {
          warn(...args: unknown[]) {
            logs.push(args);
          },
        } as Parameters<typeof createSnapshotProjection>[2],
      );
      assert.equal(await port.model(target, " \n "), null);
      assert.equal(updates.length, 0);
      assert.equal(await port.model(target, " selected "), row);
      assert.deepEqual(updates[0], {
        ...workspace,
        taskId: target.sessionId,
        patch: { model: "selected" },
      });
      for (const asynchronous of [false, true]) {
        update = () => {
          if (asynchronous) return Promise.reject(null);
          throw null;
        };
        assert.equal(await port.model(target, "selected"), null);
        assert.equal(logs.at(-1)?.[2], null);
      }
      assert.equal(logs.length, 2);
    },
  );
});
