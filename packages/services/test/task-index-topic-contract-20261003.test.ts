import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  TopicWireFrameAssembler,
  V4SessionsIndexSubscribeResult,
  V4ConversationResyncResult,
} from "@knorvia/shared/protocol-v4";
import type {
  TopicPorts,
  TopicWire,
  LogicalTopicFrame,
} from "../src/agent/task-index-ingestion/topicTypes.js";

// Authored for the final unified acceptance phase; deliberately unexecuted here.
test("topic admission keeps independent ownership through delayed ACK, recovery and replacement", async (t) => {
  t.mock.module("@knorvia/shared", {
    namedExports: {
      KNORVIA_AGENT_PROVIDER_NOT_READY_CODE: "synthetic-provider-pending",
      resolveWorkspaceKey: () => "synthetic-identity",
    },
  });
  t.mock.module("@knorvia/shared/protocol-v4", {
    namedExports: {
      PROTOCOL_V4_LIMITS: { logicalFrameAssemblyTimeoutMs: 100 },
    },
  });
  t.mock.module("../src/agent/agent.js", {
    namedExports: {
      KNORVIA_AGENT_RUNTIME_UNAVAILABLE_CODE: "synthetic-runtime-unavailable",
    },
  });
  const { createTopicIngest } = await import("../src/agent/task-index-ingestion/topicIngest.js");
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((fulfil) => {
      resolve = fulfil;
    });
    return { promise, resolve };
  }
  const ack = (subscriptionId: string): V4SessionsIndexSubscribeResult => ({
    ack: { subscriptionId, logEpoch: "synthetic-epoch", mode: "snapshot" },
  });
  function fixture(kind: "sessions-index" | "workspace-config" = "sessions-index") {
    const frames = new Map<
      string,
      { frame: LogicalTopicFrame; deliveryKind: "initial" | "online" | "recovery" }
    >();
    const pending: ReturnType<typeof deferred<V4SessionsIndexSubscribeResult>>[] = [];
    const resyncs: Array<{
      input: unknown;
      gate: ReturnType<typeof deferred<V4ConversationResyncResult>>;
    }> = [];
    const unsubscribed: string[] = [];
    const applied: LogicalTopicFrame[] = [];
    let assembled = 0;
    const assembler = {
      accept(wire: TopicWire) {
        assembled++;
        const owned = frames.get(wire.logicalFrameId);
        assert.ok(owned);
        return [{ kind: "complete" as const, ...owned }];
      },
      clear() {},
      abort() {},
      expire() {
        return [];
      },
      nextExpiryAt: null,
    } as unknown as TopicWireFrameAssembler<LogicalTopicFrame>;
    const ports: TopicPorts<LogicalTopicFrame> = {
      kind,
      target: { workspacePath: "synthetic/workspace", workspaceIdentity: "synthetic-identity" },
      logger: { warn() {}, debug() {} } as unknown as TopicPorts<LogicalTopicFrame>["logger"],
      topic: () => `${kind}/synthetic-identity`,
      live: () => true,
      assembler,
      subscribe() {
        const gate = deferred<V4SessionsIndexSubscribeResult>();
        pending.push(gate);
        return gate.promise;
      },
      async unsubscribe(id) {
        unsubscribed.push(id);
      },
      resync(input) {
        const gate = deferred<V4ConversationResyncResult>();
        resyncs.push({ input, gate });
        return gate.promise;
      },
      becameUnavailable() {},
      apply: (frame) => applied.push(frame),
      commitDeltaBeforeProjection: kind === "workspace-config",
      expiryChanged() {},
    };
    const owner = createTopicIngest(ports);
    let ordinal = 0;
    function send(
      id: string,
      from: number,
      to: number,
      deliveryKind: "initial" | "online" | "recovery",
      snapshot = false,
    ) {
      const logicalFrameId = `synthetic-frame-${++ordinal}`;
      const frame: LogicalTopicFrame = {
        topic: ports.topic(),
        subscriptionId: id,
        fromSeq: from,
        toSeq: to,
        payload: snapshot
          ? { kind: "snapshot", snapshot: { logEpoch: "synthetic-epoch" } }
          : { kind: "deltas", deltas: [] },
      };
      frames.set(logicalFrameId, { frame, deliveryKind });
      owner.receive({
        ...frame,
        logicalFrameId,
        logicalFrameOrdinal: ordinal,
      } as unknown as TopicWire);
      return frame;
    }
    return { owner, pending, resyncs, unsubscribed, applied, send, assembled: () => assembled };
  }

  await t.test(
    "notifications preceding the ACK continuation are drained only for the accepted identity",
    async () => {
      const f = fixture();
      const subscribing = f.owner.subscribe("initial", false);
      f.send("foreign", 0, 1, "initial", true);
      const initial = f.send("owned", 0, 1, "initial", true);
      assert.equal(f.assembled(), 0);
      assert.ok(f.pending[0]);
      f.pending[0].resolve(ack("owned"));
      await subscribing;
      assert.deepEqual(f.applied, [initial]);
      assert.equal(f.assembled(), 1);
      f.send("foreign", 1, 2, "online");
      assert.equal(f.assembled(), 1);
      f.owner.reset(false);
    },
  );

  await t.test(
    "a sibling's pending ACK remains valid during a topic-local recovery replacement",
    async () => {
      const a = fixture();
      const b = fixture("workspace-config");
      const pa = a.owner.subscribe("initial", false);
      const pb = b.owner.subscribe("initial", false);
      a.send("a", 0, 1, "initial", true);
      assert.ok(a.pending[0]);
      a.pending[0].resolve(ack("a"));
      await pa;
      a.send("a", 5, 6, "online");
      assert.ok(a.resyncs[0]);
      a.resyncs[0].gate.resolve(ack("mismatched"));
      const initialB = b.send("b", 0, 7, "initial", true);
      assert.ok(b.pending[0]);
      b.pending[0].resolve(ack("b"));
      await pb;
      assert.deepEqual(b.applied, [initialB]);
      assert.deepEqual(b.unsubscribed, []);
      assert.equal(b.owner.generation, 1);
      a.owner.reset(false);
      b.owner.reset(false);
    },
  );

  await t.test(
    "a recovery frame before ACK is applied, and newer online deltas request one follow-up",
    async () => {
      const f = fixture();
      const start = f.owner.subscribe("initial", false);
      f.send("owned", 0, 1, "initial", true);
      assert.ok(f.pending[0]);
      f.pending[0].resolve(ack("owned"));
      await start;
      f.send("owned", 7, 8, "online");
      assert.ok(f.resyncs[0]);
      assert.deepEqual(f.resyncs[0].input, {
        subscriptionId: "owned",
        base: { logEpoch: "synthetic-epoch", seq: 1 },
      });
      const recovered = f.send("owned", 1, 2, "recovery");
      f.send("owned", 2, 3, "online");
      assert.equal(f.applied.at(-1), recovered);
      f.resyncs[0].gate.resolve({
        ack: { subscriptionId: "owned", logEpoch: "synthetic-epoch", mode: "resume" },
      });
      await f.resyncs[0].gate.promise;
      assert.equal(f.resyncs.length, 2);
      assert.deepEqual(f.resyncs[1]?.input, {
        subscriptionId: "owned",
        base: { logEpoch: "synthetic-epoch", seq: 2 },
      });
      f.owner.reset(false);
    },
  );

  await t.test("late old ACK cannot unsubscribe a newer route reusing the same ID", async () => {
    const f = fixture();
    const older = f.owner.subscribe("initial", false);
    const newer = f.owner.subscribe("runtime-restart", false);
    assert.ok(f.pending[1]);
    f.pending[1].resolve(ack("reused"));
    await newer;
    assert.ok(f.pending[0]);
    f.pending[0].resolve(ack("reused"));
    await older;
    assert.deepEqual(f.unsubscribed, []);
    f.owner.reset(false);
  });

  await t.test(
    "pre-ACK overflow drains no partial baseline and starts a fresh subscription",
    async () => {
      const f = fixture();
      const start = f.owner.subscribe("initial", false);
      for (let i = 0; i < 1_025; i++) f.send("overflow", 0, 1, "initial", true);
      assert.ok(f.pending[0]);
      f.pending[0].resolve(ack("overflow"));
      await start;
      assert.equal(f.pending.length, 2);
      assert.deepEqual(f.unsubscribed, ["overflow"]);
      assert.equal(f.applied.length, 0);
      f.owner.reset(false);
    },
  );
});
