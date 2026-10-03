import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  KnorviaTaskMeta,
  KnorviaSessionStateSnapshot,
  KnorviaWorkspaceEvent,
} from "@knorvia/shared";
import type {
  SessionsIndexTopicFrame,
  SessionsIndexTopicWireCandidate,
  V4SessionsIndexSubscribeResult,
} from "@knorvia/shared/protocol-v4";
import type { KnorviaAgentWorkspaceTarget, IKnorviaAgentService } from "../src/agent/agent.js";

test("workspace observer stays dormant until runtime authority and preserves initial/terminal event boundaries", async (t) => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((fulfil) => {
      resolve = fulfil;
    });
    return { promise, resolve };
  }
  class FakeEmitter {
    listeners = new Set<(event: unknown) => void>();
    event = (listener: (event: unknown) => void) => {
      this.listeners.add(listener);
      return { dispose: () => this.listeners.delete(listener) };
    };
    fire(value: unknown) {
      for (const listener of this.listeners) listener(value);
    }
    dispose() {
      this.listeners.clear();
    }
  }
  const logical = new Map<string, SessionsIndexTopicFrame>();
  class FakeAssembler {
    accept(wire: SessionsIndexTopicWireCandidate) {
      const frame = logical.get(wire.logicalFrameId);
      assert.ok(frame);
      return [
        {
          kind: "complete",
          frame,
          deliveryKind: frame.payload.kind === "snapshot" ? "initial" : "online",
        },
      ];
    }
    clear() {}
    abort() {}
    expire() {
      return [];
    }
    nextExpiryAt = null;
  }
  t.mock.module("@knorvia/rpc", { namedExports: { Emitter: FakeEmitter } });
  t.mock.module("@knorvia/shared", {
    namedExports: {
      KNORVIA_AGENT_PROVIDER: "knorvia",
      KNORVIA_AGENT_PROVIDER_NOT_READY_CODE: "synthetic-provider-pending",
      resolveWorkspaceKey: (target: KnorviaAgentWorkspaceTarget) =>
        target.workspaceIdentity?.trim() || target.workspacePath,
      generateTraceId: (id: string) => `trace-${id}`,
      deriveKnorviaTaskStatusFromSessionSnapshot: () => "error",
      getKnorviaUserVisibleMessages: (value: unknown) => value,
      isKnorviaGoalContinuationReminderText: () => false,
      isKnorviaModelOnlySyntheticUserMessage: () => false,
      resolveKnorviaVisibleSessionTitle: (input: { title: string }) => input.title,
    },
  });
  t.mock.module("@knorvia/shared/protocol-v4", {
    namedExports: {
      sessionsIndexTopic: (key: string) => `sessions-index/${key}`,
      workspaceConfigTopic: (key: string) => `workspace-config/${key}`,
      sessionsIndexTopicFrameSchema: {},
      workspaceConfigTopicFrameSchema: {},
      TopicWireFrameAssembler: FakeAssembler,
      PROTOCOL_V4_LIMITS: { logicalFrameAssemblyTimeoutMs: 100 },
    },
  });
  t.mock.module("../src/agent/agent.js", {
    namedExports: { KNORVIA_AGENT_RUNTIME_UNAVAILABLE_CODE: "synthetic-unavailable" },
  });
  t.mock.module("../src/logger/serviceLogger.js", {
    namedExports: { createServiceLogger: () => ({ debug() {}, warn() {} }) },
  });
  t.mock.module("../src/agent/configOptions.js", {
    namedExports: { formatTaskMetaModelSelectionFromSnapshot: () => "synthetic-model" },
  });
  t.mock.module("../src/agent/repairSubagentTaskIndex.js", {
    namedExports: { async repairSubagentTaskIndex() {} },
  });
  const { createKnorviaTaskIndexSyncer: create } = await import("../src/agent/taskIndexSyncer.js");
  type Options = Parameters<typeof create>[0];
  type LifecycleEvent = Parameters<
    NonNullable<IKnorviaAgentService["onAgentRuntimeLifecycle"]>
  >[0] extends (event: infer E) => void
    ? E
    : never;
  let lifecycle: ((event: LifecycleEvent) => void) | undefined;
  let indexFrame: ((wire: SessionsIndexTopicWireCandidate) => void) | undefined;
  const subscribes: Array<{
    kind: string;
    params: Record<string, unknown>;
    gate: ReturnType<typeof deferred<V4SessionsIndexSubscribeResult>>;
  }> = [];
  const seeds: KnorviaTaskMeta[] = [];
  const patches: unknown[] = [];
  const readbacks: unknown[] = [];
  const unsubscribed: unknown[] = [];
  const order: string[] = [];
  const workspaceEvents: KnorviaWorkspaceEvent[] = [];
  const converged = deferred<void>();
  const patch = deferred<KnorviaTaskMeta>();
  let listeners = 0;
  let disposedListeners = 0;
  const target = { workspacePath: "synthetic/workspace", workspaceIdentity: "synthetic-identity" };
  const repo = {
    async seedTaskMetaIfMissing(meta: KnorviaTaskMeta) {
      seeds.push(meta);
      return meta;
    },
    applyAgentPatch(input: unknown) {
      order.push("patch");
      patches.push(input);
      return patch.promise;
    },
    async syncTaskMeta(input: { meta: KnorviaTaskMeta }) {
      return input.meta;
    },
  } as unknown as Options["taskIndexRepo"];
  function subscribe(kind: string, params: Record<string, unknown>) {
    const gate = deferred<V4SessionsIndexSubscribeResult>();
    subscribes.push({ kind, params, gate });
    return gate.promise;
  }
  const agent = {
    onAgentRuntimeLifecycle(callback: (event: LifecycleEvent) => void) {
      lifecycle = callback;
      return { dispose() {} };
    },
    onAgentRuntimeRestarted() {
      assert.fail("lifecycle-aware observer must not register fallback restart");
    },
    onDynamicSessionsIndexFrame() {
      return (callback: typeof indexFrame) => {
        indexFrame = callback;
        listeners++;
        return {
          dispose() {
            disposedListeners++;
          },
        };
      };
    },
    onDynamicWorkspaceConfigFrame() {
      return () => {
        listeners++;
        return {
          dispose() {
            disposedListeners++;
          },
        };
      };
    },
    subscribeSessionsIndexV4: (params: Record<string, unknown>) => subscribe("index", params),
    subscribeWorkspaceConfigV4: (params: Record<string, unknown>) => subscribe("config", params),
    async unsubscribeSessionsIndexV4(input: unknown) {
      unsubscribed.push(input);
    },
    async unsubscribeWorkspaceConfigV4(input: unknown) {
      unsubscribed.push(input);
    },
    async readSession(input: unknown) {
      readbacks.push(input);
      return {
        session: {
          sessionId: "running",
          workspace: target,
          title: "Visible title",
          mode: "build",
          createdAt: 1,
          updatedAt: 2,
        },
        settings: { thoughtLevel: {} },
        projection: { lastError: { type: "synthetic-code", message: "synthetic-converged" } },
        messages: [],
      } as unknown as KnorviaSessionStateSnapshot;
    },
  } as unknown as Options["agentService"];
  const syncer = create({ agentService: agent, taskIndexRepo: repo });
  syncer.onDynamicWorkspaceEvent(target)((event) => {
    workspaceEvents.push(event);
    if (
      event.type === "workspace_task_list_changed" &&
      event.taskMeta?.lastError?.message === "synthetic-converged"
    )
      converged.resolve();
  });
  syncer.onSessionTerminalEvent(() => order.push("terminal"));
  syncer.onSessionReadyEvent(() => order.push("ready"));
  syncer.ensureWorkspaceSubscription(target);
  syncer.ensureWorkspaceSubscription(target);
  assert.equal(subscribes.length, 0);
  assert.equal(listeners, 0);
  assert.ok(lifecycle);
  function notify(state: "available" | "unavailable", generation: number) {
    assert.ok(lifecycle);
    lifecycle({
      state,
      ...target,
      workspaceKey: "synthetic-identity",
      runtimeIdentity: { generation },
    } as LifecycleEvent);
  }
  notify("available", 1);
  assert.equal(subscribes.length, 2);
  assert.equal(listeners, 2);
  assert.ok(subscribes[0]);
  assert.deepEqual(subscribes[0].params, {
    ...target,
    visibility: "background",
    subscriberScope: "task-index",
    runtimePolicy: "existing-only",
  });
  let ordinal = 0;
  const summary = (sessionId: string, phase: string) => ({
    sessionId,
    phase,
    title: "Visible title",
    createdAt: 1,
    lastActivityAt: 2,
  });
  function send(from: number, to: number, payload: unknown) {
    assert.ok(indexFrame);
    const logicalFrameId = `synthetic-${++ordinal}`;
    const frame = {
      topic: "sessions-index/synthetic-identity",
      subscriptionId: "index-1",
      fromSeq: from,
      toSeq: to,
      payload,
    } as SessionsIndexTopicFrame;
    logical.set(logicalFrameId, frame);
    indexFrame({
      ...frame,
      logicalFrameId,
      logicalFrameOrdinal: ordinal,
    } as unknown as SessionsIndexTopicWireCandidate);
  }
  send(0, 1, {
    kind: "snapshot",
    snapshot: {
      logEpoch: "synthetic-epoch",
      sessions: [
        summary("historic", "completedSuccess"),
        summary("running", "running"),
        summary("draft", "draft"),
      ],
    },
  });
  subscribes[0].gate.resolve({
    ack: { subscriptionId: "index-1", mode: "snapshot", logEpoch: "synthetic-epoch" },
  });
  assert.ok(subscribes[1]);
  subscribes[1].gate.resolve({
    ack: { subscriptionId: "config-1", mode: "snapshot", logEpoch: "synthetic-epoch" },
  });
  await subscribes[0].gate.promise;
  assert.deepEqual(
    seeds.map((meta) => meta.taskId),
    ["historic", "running"],
  );
  assert.deepEqual(order, []);
  assert.deepEqual(workspaceEvents, []);
  send(1, 2, {
    kind: "deltas",
    deltas: [{ op: "session.upserted", session: summary("running", "error") }],
  });
  assert.deepEqual(order, ["terminal", "ready", "patch"]);
  assert.equal(patches.length, 1);
  patch.resolve({
    taskId: "running",
    workspacePath: target.workspacePath,
    workspaceIdentity: target.workspaceIdentity,
  } as KnorviaTaskMeta);
  await converged.promise;
  assert.deepEqual(readbacks, [
    { ...target, sessionId: "running", runtimePolicy: "existing-only" },
  ]);
  const taskEvents = workspaceEvents.filter(
    (event) => event.type === "workspace_task_list_changed",
  );
  assert.equal(
    taskEvents.filter((event) => event.unreadSignal === "background_terminal").length,
    1,
  );
  notify("unavailable", 0);
  notify("available", 2);
  assert.equal(subscribes.length, 4);
  assert.equal(listeners, 2);
  notify("unavailable", 2);
  assert.equal(unsubscribed.length, 0);
  syncer.disposeAll();
  assert.equal(disposedListeners, 2);
});
