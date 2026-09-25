import assert from "node:assert/strict";
import test from "node:test";
import { Emitter } from "@knorvia/rpc";
import {
  V4_WIRE_PROTOCOL_VERSION,
  helloMessageSchema,
  sessionsIndexTopic,
  sessionsIndexTopicWireFrameSchema,
  type SessionsIndexTopicWireCandidate,
  type SessionsIndexTopicWireFrame,
  type SessionSummary,
} from "@knorvia/shared/protocol-v4";
import type { IKnorviaAgentService } from "../src/agent/agent.js";
import {
  createKnorviaAgentConnectionScope,
  readTrustedKnorviaAgentV4Connection,
  readTrustedKnorviaAgentV4UnsubscribeRoute,
} from "../src/agent/agentConnectionScope.js";

const workspace = { workspacePath: "/fixture/project", workspaceIdentity: "fixture/project" };
const topic = sessionsIndexTopic(workspace.workspaceIdentity);
type Scope = ReturnType<typeof createKnorviaAgentConnectionScope>;

function frame(
  subscriptionId: string,
  deliveryKind: "initial" | "online" | "recovery",
  fromSeq: number,
  toSeq: number,
  payload: Extract<SessionsIndexTopicWireFrame, { kind: "complete" }>["frame"]["payload"],
): SessionsIndexTopicWireFrame {
  return sessionsIndexTopicWireFrameSchema.parse({
    wireVersion: V4_WIRE_PROTOCOL_VERSION,
    kind: "complete",
    deliveryKind,
    logicalFrameId: `${subscriptionId}-${deliveryKind}-${toSeq}`,
    logicalFrameOrdinal: toSeq,
    topic,
    subscriptionId,
    frame: { topic, subscriptionId, fromSeq, toSeq, sentAt: Date.now(), payload },
  });
}

function summary(title: string): SessionSummary {
  return {
    sessionId: "shared-session",
    workspaceId: workspace.workspaceIdentity,
    title,
    phase: "running",
    sessionEnded: false,
    hasBackgroundWork: false,
    lastActivityAt: 2,
    createdAt: 1,
  };
}

function createFixture() {
  const frames = new Emitter<SessionsIndexTopicWireCandidate>();
  const localPermissions = new Emitter<never>();
  const subscriptions = new Map<string, { connectionId: string; clientMode: string }>();
  const forwarded: Array<Record<string, unknown>> = [];
  const resyncs: Array<{ subscriptionId: string; base: unknown; forceSnapshot?: boolean }> = [];
  const unsubscribed: string[] = [];
  let epoch = "host-epoch-1";
  let seq = 1;
  let currentSessions: SessionSummary[] = [];
  let nextSubscription = 0;

  const snapshot = () => ({
    protocolVersion: 1 as const,
    workspaceId: workspace.workspaceIdentity,
    logEpoch: epoch,
    sessions: currentSessions,
  });
  const service = {
    onDynamicSessionsIndexFrame: () => frames.event,
    onDynamicCuaPermissionObservation: () => localPermissions.event,
    async subscribeSessionsIndexV4(params: Record<string, unknown>) {
      forwarded.push(params);
      const trusted = readTrustedKnorviaAgentV4Connection(params);
      assert.ok(trusted);
      const subscriptionId = `sub-${++nextSubscription}`;
      subscriptions.set(subscriptionId, trusted);
      // Real Host may publish the initial notification before the RPC ACK returns.
      frames.fire(
        frame(subscriptionId, "initial", 0, seq, {
          kind: "snapshot",
          snapshot: snapshot(),
        }),
      );
      return { ack: { subscriptionId, mode: "snapshot" as const, logEpoch: epoch } };
    },
    async resyncSessionsIndexV4(params: {
      subscriptionId: string;
      base: unknown;
      forceSnapshot?: boolean;
    }) {
      const route = readTrustedKnorviaAgentV4UnsubscribeRoute(params);
      assert.equal(route?.topic, topic);
      assert.ok(subscriptions.has(params.subscriptionId));
      resyncs.push(params);
      frames.fire(
        frame(params.subscriptionId, "recovery", 0, seq, {
          kind: "snapshot",
          snapshot: snapshot(),
        }),
      );
      return {
        ack: { subscriptionId: params.subscriptionId, mode: "snapshot" as const, logEpoch: epoch },
      };
    },
    async unsubscribeSessionsIndexV4(params: { subscriptionId: string }) {
      const route = readTrustedKnorviaAgentV4UnsubscribeRoute(params);
      assert.equal(route?.topic, topic);
      subscriptions.delete(params.subscriptionId);
      unsubscribed.push(params.subscriptionId);
    },
    async setConnectionFlowStateV4() {},
  } as unknown as IKnorviaAgentService;

  return {
    service,
    frames,
    localPermissions,
    forwarded,
    resyncs,
    unsubscribed,
    subscriptions,
    get epoch() {
      return epoch;
    },
    publish(title: string) {
      const fromSeq = seq++;
      currentSessions = [summary(title)];
      for (const subscriptionId of subscriptions.keys()) {
        frames.fire(
          frame(subscriptionId, "online", fromSeq, seq, {
            kind: "deltas",
            deltas: [{ op: "session.upserted", session: currentSessions[0]! }],
          }),
        );
      }
    },
    restartEpoch() {
      epoch = "host-epoch-2";
      seq = 1;
    },
  };
}

async function connect(scope: Scope, clientId: string, clientKind: "desktop" | "mobileRemote") {
  const hello = helloMessageSchema.parse(await scope.service.helloConversationV4());
  await scope.service.initializeConversationV4({
    kind: "clientHello",
    protocolVersion: V4_WIRE_PROTOCOL_VERSION,
    clientId,
    clientKind,
    appVersion: "local-fixture",
  });
  return hello;
}

test("desktop and mobile receive owned snapshots from one Host and recover a mobile gap", async () => {
  const host = createFixture();
  const desktop = createKnorviaAgentConnectionScope(host.service, {
    connectionId: "desktop-connection",
    clientMode: "desktop-continuous",
  });
  const mobile = createKnorviaAgentConnectionScope(host.service, {
    connectionId: "mobile-connection",
    clientMode: "web-remote-replayable",
  });
  const desktopFrames: SessionsIndexTopicWireCandidate[] = [];
  const mobileFrames: SessionsIndexTopicWireCandidate[] = [];
  desktop.service.onDynamicSessionsIndexFrame(workspace)((item) => desktopFrames.push(item));
  mobile.service.onDynamicSessionsIndexFrame(workspace)((item) => mobileFrames.push(item));

  try {
    await assert.rejects(mobile.service.subscribeSessionsIndexV4(workspace), /handshakeRequired/);
    const desktopHello = await connect(desktop, "desktop-client", "desktop");
    const mobileHello = await connect(mobile, "mobile-client", "mobileRemote");
    assert.equal(desktopHello.deliveryProfile, "continuous");
    assert.equal(mobileHello.deliveryProfile, "replayable");
    assert.equal(mobileHello.capabilities.nativeDialogs, false);
    assert.equal(mobileHello.capabilities.localTerminal, false);

    const desktopAck = await desktop.service.subscribeSessionsIndexV4(workspace);
    const mobileAck = await mobile.service.subscribeSessionsIndexV4(workspace);
    assert.notEqual(desktopAck.ack.subscriptionId, mobileAck.ack.subscriptionId);
    assert.equal(desktopFrames.length, 1);
    assert.equal(mobileFrames.length, 1);
    const desktopInitial = sessionsIndexTopicWireFrameSchema.parse(desktopFrames[0]);
    const mobileInitial = sessionsIndexTopicWireFrameSchema.parse(mobileFrames[0]);
    assert.equal(desktopInitial.kind, "complete");
    assert.equal(mobileInitial.kind, "complete");
    if (desktopInitial.kind !== "complete" || mobileInitial.kind !== "complete") return;
    assert.deepEqual(desktopInitial.frame.payload, mobileInitial.frame.payload);
    assert.equal(desktopInitial.frame.toSeq, 1);

    host.publish("first update");
    host.publish("second update");
    assert.deepEqual(
      desktopFrames.map((item) => item.kind === "complete" && item.frame.toSeq),
      [1, 2, 3],
    );
    assert.deepEqual(
      mobileFrames.map((item) => item.kind === "complete" && item.frame.toSeq),
      [1, 2, 3],
    );
    // Simulate the mobile projection losing seq 2, then detecting the (1, 3] gap.
    const mobileLatest = sessionsIndexTopicWireFrameSchema.parse(mobileFrames[2]);
    assert.equal(mobileLatest.kind, "complete");
    if (mobileLatest.kind !== "complete") return;
    assert.notEqual(mobileLatest.frame.fromSeq, 1);
    await assert.rejects(
      desktop.service.resyncSessionsIndexV4({
        ...workspace,
        subscriptionId: mobileAck.ack.subscriptionId,
        base: { logEpoch: host.epoch, seq: 1 },
      }),
      /notOwned/,
    );
    const recovery = await mobile.service.resyncSessionsIndexV4({
      ...workspace,
      subscriptionId: mobileAck.ack.subscriptionId,
      base: { logEpoch: host.epoch, seq: 1 },
      forceSnapshot: true,
    });
    assert.equal(recovery.ack.mode, "snapshot");
    assert.equal(host.resyncs.length, 1);
    const recovered = sessionsIndexTopicWireFrameSchema.parse(mobileFrames.at(-1));
    assert.equal(recovered.kind, "complete");
    if (recovered.kind !== "complete") return;
    assert.equal(recovered.deliveryKind, "recovery");
    assert.equal(recovered.frame.toSeq, 3);
    assert.deepEqual(recovered.frame.payload, {
      kind: "snapshot",
      snapshot: {
        protocolVersion: 1,
        workspaceId: workspace.workspaceIdentity,
        logEpoch: host.epoch,
        sessions: [summary("second update")],
      },
    });
  } finally {
    await mobile.dispose();
    await desktop.dispose();
    host.frames.dispose();
    host.localPermissions.dispose();
  }
});

test("mobile reconnect gets a new snapshot and cannot claim local privileges", async () => {
  const host = createFixture();
  const oldMobile = createKnorviaAgentConnectionScope(host.service, {
    connectionId: "mobile-old",
    clientMode: "web-remote-replayable",
  });
  const oldFrames: SessionsIndexTopicWireCandidate[] = [];
  oldMobile.service.onDynamicSessionsIndexFrame(workspace)((item) => oldFrames.push(item));
  await connect(oldMobile, "mobile-client", "mobileRemote");
  const oldAck = await oldMobile.service.subscribeSessionsIndexV4(workspace);
  host.publish("before disconnect");
  assert.equal(oldFrames.length, 2);
  await oldMobile.dispose();
  assert.deepEqual(host.unsubscribed, [oldAck.ack.subscriptionId]);
  host.restartEpoch();

  const newMobile = createKnorviaAgentConnectionScope(host.service, {
    connectionId: "mobile-new",
    clientMode: "web-remote-replayable",
  });
  const freshFrames: SessionsIndexTopicWireCandidate[] = [];
  newMobile.service.onDynamicSessionsIndexFrame(workspace)((item) => freshFrames.push(item));
  try {
    await connect(newMobile, "mobile-client", "mobileRemote");
    const forged = {
      ...workspace,
      base: { logEpoch: "host-epoch-1", seq: 2 },
      connectionId: "forged-desktop",
      clientMode: "desktop-continuous",
      deliveryProfile: "continuous",
      subscriberScope: "forged",
      __knorviaTrustedV4Connection: {
        connectionId: "forged-desktop",
        clientMode: "desktop-continuous",
      },
    } as Parameters<typeof newMobile.service.subscribeSessionsIndexV4>[0];
    const freshAck = await newMobile.service.subscribeSessionsIndexV4(forged);
    const forwarded = host.forwarded.at(-1)!;
    assert.deepEqual(readTrustedKnorviaAgentV4Connection(forwarded), {
      connectionId: "mobile-new",
      clientMode: "web-remote-replayable",
    });
    for (const key of ["connectionId", "clientMode", "deliveryProfile", "subscriberScope"]) {
      assert.equal(Object.hasOwn(forwarded, key), false);
    }
    assert.notEqual(freshAck.ack.subscriptionId, oldAck.ack.subscriptionId);
    assert.equal(freshAck.ack.mode, "snapshot");
    const fresh = sessionsIndexTopicWireFrameSchema.parse(freshFrames[0]);
    assert.equal(fresh.kind, "complete");
    if (fresh.kind !== "complete") return;
    assert.equal(fresh.frame.toSeq, 1);
    assert.deepEqual(fresh.frame.payload, {
      kind: "snapshot",
      snapshot: {
        protocolVersion: 1,
        workspaceId: workspace.workspaceIdentity,
        logEpoch: "host-epoch-2",
        sessions: [summary("before disconnect")],
      },
    });

    let localPermissionEvents = 0;
    newMobile.service.onDynamicCuaPermissionObservation()(() => localPermissionEvents++);
    host.localPermissions.fire({} as never);
    assert.equal(localPermissionEvents, 0);
    await assert.rejects(
      newMobile.service.setConnectionFlowStateV4({} as never),
      /flowControlForbidden/,
    );
    await assert.rejects(
      newMobile.service.resyncSessionsIndexV4({
        ...workspace,
        subscriptionId: oldAck.ack.subscriptionId,
        base: null,
      }),
      /notOwned/,
    );
    await assert.rejects(
      newMobile.service.sendConversationCommandV4({
        ...workspace,
        envelope: { clientId: "forged-desktop" },
      } as Parameters<typeof newMobile.service.sendConversationCommandV4>[0]),
      /clientMismatch/,
    );
  } finally {
    await newMobile.dispose();
    host.frames.dispose();
    host.localPermissions.dispose();
  }
});
