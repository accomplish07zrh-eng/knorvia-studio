// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 合同 B12–B14：desktop-continuous 与 web-remote-replayable 两条链路同语义，
// 以及 connection flow 只影响投递、不改变帧内容。
import assert from "node:assert/strict";
import test from "node:test";
import {
  commandEnvelope,
  createDraftSession,
  expectedAccepted,
  makeTempDir,
  newCommandId,
  removeTempDir,
  spawnBridgeApp,
  subscribeConversation,
  waitForFrame,
  workspaceRef,
} from "./_protocol.mjs";

test("kernel-bridge-01 · 两条客户端链路共享同一 v4 语义", async (t) => {
  const home = await makeTempDir("bridge01-links-home-");
  const workspace = await makeTempDir("bridge01-links-ws-");
  const app = await spawnBridgeApp({ cwd: workspace, home });
  t.after(async () => {
    await app.close();
    await removeTempDir(home);
    await removeTempDir(workspace);
  });

  const { sessionId } = await createDraftSession(app, workspace);
  const topic = `conversation/${sessionId}`;
  const workspaceInfo = workspaceRef(workspace);

  const desktop = await subscribeConversation(app, {
    topic,
    connectionId: "desktop-link",
    clientMode: "desktop-continuous",
    workspace: workspaceInfo,
  });
  const replayable = await subscribeConversation(app, {
    topic,
    connectionId: "web-link",
    clientMode: "web-remote-replayable",
    workspace: workspaceInfo,
  });
  const desktopInitial = await waitForFrame(
    app,
    {
      topic,
      subscriptionId: desktop.subscriptionId,
      deliveryKind: "initial",
    },
    { label: "desktop initial" },
  );
  const replayableInitial = await waitForFrame(
    app,
    {
      topic,
      subscriptionId: replayable.subscriptionId,
      deliveryKind: "initial",
    },
    { label: "replayable initial" },
  );

  await t.test("两个 profile 的帧外壳与快照身份完全同构", () => {
    const desktopWire = desktopInitial.message.params;
    const replayableWire = replayableInitial.message.params;
    assert.deepEqual(Object.keys(desktopWire).sort(), Object.keys(replayableWire).sort());
    assert.equal(desktopWire.wireVersion, replayableWire.wireVersion);
    assert.equal(desktopWire.kind, "complete");
    assert.equal(replayableWire.kind, "complete");
    assert.equal(desktopWire.deliveryKind, "initial");
    assert.equal(replayableWire.deliveryKind, "initial");

    const desktopSnapshot = desktopWire.frame.payload.snapshot;
    const replayableSnapshot = replayableWire.frame.payload.snapshot;
    assert.equal(desktopSnapshot.sessionId, replayableSnapshot.sessionId);
    assert.equal(desktopSnapshot.logEpoch, replayableSnapshot.logEpoch);
    assert.equal(desktopSnapshot.seq, replayableSnapshot.seq);
    assert.equal(desktopSnapshot.revision, replayableSnapshot.revision);
    assert.equal(desktopSnapshot.control.phase, replayableSnapshot.control.phase);
  });

  await t.test("同一状态变更在两条链路上产生相同 seq 与相同 deltas", async () => {
    expectedAccepted(
      await app.request(
        "v4/command",
        commandEnvelope({
          commandId: newCommandId("links-followup"),
          sessionId,
          type: "setFollowupMode",
          payload: { mode: "guide" },
          baseRevision: 0,
        }),
      ),
    );
    const desktopDelta = await waitForFrame(
      app,
      { topic, subscriptionId: desktop.subscriptionId, payloadKind: "deltas" },
      { label: "desktop delta" },
    );
    const replayableDelta = await waitForFrame(
      app,
      { topic, subscriptionId: replayable.subscriptionId, payloadKind: "deltas" },
      { label: "replayable delta" },
    );
    const desktopFrame = desktopDelta.message.params.frame;
    const replayableFrame = replayableDelta.message.params.frame;
    assert.equal(desktopFrame.fromSeq, 0);
    assert.equal(desktopFrame.toSeq, 1);
    assert.equal(replayableFrame.fromSeq, desktopFrame.fromSeq);
    assert.equal(replayableFrame.toSeq, desktopFrame.toSeq);
    assert.deepEqual(replayableFrame.payload, desktopFrame.payload);
    assert.equal(desktopDelta.message.params.deliveryKind, "online");
    assert.equal(replayableDelta.message.params.deliveryKind, "online");
  });

  await t.test("connection flow saturated 暂停投递，drained 后原序补发", async () => {
    const paused = await subscribeConversation(app, {
      topic,
      connectionId: "paused-link",
      clientMode: "web-remote-replayable",
      workspace: workspaceInfo,
    });
    const pausedInitial = await waitForFrame(
      app,
      { topic, subscriptionId: paused.subscriptionId, deliveryKind: "initial" },
      { label: "paused initial" },
    );
    assert.equal(pausedInitial.message.params.frame.toSeq, 1);

    const saturated = await app.request("v4/connection/flow", {
      connectionId: "paused-link",
      state: "saturated",
    });
    assert.equal(saturated.error, undefined, JSON.stringify(saturated));

    expectedAccepted(
      await app.request(
        "v4/command",
        commandEnvelope({
          commandId: newCommandId("links-plan"),
          sessionId,
          type: "switchCollaborationMode",
          payload: { mode: "plan" },
          baseRevision: 1,
        }),
      ),
    );
    const otherDelta = await waitForFrame(
      app,
      { topic, subscriptionId: desktop.subscriptionId, payloadKind: "deltas", fromSeq: 1 },
      { label: "desktop delta while paused" },
    );
    assert.equal(otherDelta.message.params.frame.toSeq, 2);
    await app.sleep(500);
    assert.equal(
      app
        .messages()
        .filter(
          (message) =>
            message.method === "v4/conversation/frame" &&
            message.params?.subscriptionId === paused.subscriptionId &&
            message.params?.frame?.payload?.kind === "deltas",
        ).length,
      0,
      "saturated connection must not receive deltas",
    );

    const drained = await app.request("v4/connection/flow", {
      connectionId: "paused-link",
      state: "drained",
    });
    assert.equal(drained.error, undefined, JSON.stringify(drained));
    const resumed = await waitForFrame(
      app,
      { topic, subscriptionId: paused.subscriptionId, payloadKind: "deltas" },
      { label: "paused delta after drain" },
    );
    const frame = resumed.message.params.frame;
    assert.equal(frame.fromSeq, 1);
    assert.equal(frame.toSeq, 2);
    assert.equal(frame.payload.deltas.at(-1).patch.revision, 2);
  });

  await t.test("clientMode 是订阅期唯一链路选择，非法值在边界拒绝", async () => {
    const invalid = await app.request("v4/conversation/subscribe", {
      topic,
      connectionId: "invalid-link",
      clientMode: "desktop-realtime",
      workspace: workspaceInfo,
    });
    assert.notEqual(invalid.error, undefined, JSON.stringify(invalid));
  });
});
