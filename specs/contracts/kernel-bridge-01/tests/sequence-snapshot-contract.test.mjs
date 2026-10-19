// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 合同 B8–B11：快照身份、区间序号、resume/resync/unsubscribe 的公开语义。
import assert from "node:assert/strict";
import test from "node:test";
import {
  commandEnvelope,
  createDraftSession,
  expectedAccepted,
  frameMatches,
  makeTempDir,
  newCommandId,
  removeTempDir,
  spawnBridgeApp,
  subscribeConversation,
  waitForFrame,
  workspaceRef,
} from "./_protocol.mjs";

const PROFILE = "desktop-continuous";

test("kernel-bridge-01 · 快照与序号在 v4 公开入口上可重建", async (t) => {
  const home = await makeTempDir("bridge01-seq-home-");
  const workspace = await makeTempDir("bridge01-seq-ws-");
  const app = await spawnBridgeApp({ cwd: workspace, home });
  t.after(async () => {
    await app.close();
    await removeTempDir(home);
    await removeTempDir(workspace);
  });

  const { sessionId } = await createDraftSession(app, workspace);
  const topic = `conversation/${sessionId}`;
  const connectionId = "seq-link";
  const workspaceInfo = workspaceRef(workspace);

  const ack = await subscribeConversation(app, {
    topic,
    connectionId,
    clientMode: PROFILE,
    workspace: workspaceInfo,
  });
  assert.equal(ack.mode, "snapshot");
  const initial = await waitForFrame(
    app,
    { topic, subscriptionId: ack.subscriptionId, deliveryKind: "initial" },
    { label: "initial frame" },
  );
  const initialWire = initial.message.params;
  const initialFrame = initialWire.frame;

  await t.test("initial snapshot 的区间起点、身份与草稿形态", () => {
    assert.equal(initialWire.wireVersion, 3);
    assert.equal(initialWire.kind, "complete");
    assert.equal(initialWire.subscriptionId, ack.subscriptionId);
    assert.equal(initialFrame.topic, topic);
    assert.equal(initialFrame.subscriptionId, ack.subscriptionId);
    assert.equal(initialFrame.fromSeq, 0);
    assert.equal(initialFrame.payload.kind, "snapshot");

    const snapshot = initialFrame.payload.snapshot;
    assert.equal(snapshot.protocolVersion, 1);
    assert.equal(snapshot.sessionId, sessionId);
    assert.equal(snapshot.logEpoch, ack.logEpoch);
    assert.equal(snapshot.seq, initialFrame.toSeq);
    assert.equal(snapshot.revision, 0);
    assert.equal(snapshot.control.phase, "draft");
    assert.equal(snapshot.control.sessionEnded, false);
    assert.deepEqual(snapshot.rows, { window: [], totalCount: 0, firstRowId: null });
    assert.equal(snapshot.goal, null);
    assert.equal(snapshot.plan, null);
    assert.equal(snapshot.workspaceHookAdmission ?? null, null);
    assert.equal(snapshot.config.followupMode, "queue");
  });

  let cursor = initial.index + 1;
  let stateSeq = initialFrame.toSeq;
  let revision = 0;

  await t.test("帧区间按事件序号连续，revision 只随可见状态变更递增", async () => {
    expectedAccepted(
      await app.request(
        "v4/command",
        commandEnvelope({
          commandId: newCommandId("seq-followup"),
          sessionId,
          type: "setFollowupMode",
          payload: { mode: "guide" },
          baseRevision: revision,
        }),
      ),
    );
    const first = await waitForFrame(
      app,
      { topic, subscriptionId: ack.subscriptionId, payloadKind: "deltas" },
      { after: cursor, label: "first delta" },
    );
    cursor = first.index + 1;
    const firstFrame = first.message.params.frame;
    assert.equal(first.message.params.deliveryKind, "online");
    assert.equal(firstFrame.fromSeq, stateSeq);
    assert.equal(firstFrame.toSeq, stateSeq + 1);
    assert.equal(firstFrame.payload.deltas.length, 1);
    const [patch] = firstFrame.payload.deltas;
    assert.equal(patch.op, "state.updated");
    assert.equal(patch.patch.revision, 1);
    assert.equal(patch.patch.config.followupMode, "guide");
    stateSeq = firstFrame.toSeq;
    revision = 1;

    // 同值配置命令仍 accepted；plan 继续带 baseRevision=1，证明 no-op 不递增 revision。
    // no-op 占一个事件序号：可能先出现空 deltas 帧，也可能与 plan 合并进同一帧。
    expectedAccepted(
      await app.request(
        "v4/command",
        commandEnvelope({
          commandId: newCommandId("seq-noop"),
          sessionId,
          type: "setFollowupMode",
          payload: { mode: "guide" },
          baseRevision: revision,
        }),
      ),
    );
    expectedAccepted(
      await app.request(
        "v4/command",
        commandEnvelope({
          commandId: newCommandId("seq-mode"),
          sessionId,
          type: "switchCollaborationMode",
          payload: { mode: "plan" },
          baseRevision: revision,
        }),
      ),
    );

    let planSeen = false;
    while (!planSeen) {
      const next = await waitForFrame(
        app,
        { topic, subscriptionId: ack.subscriptionId, payloadKind: "deltas" },
        { after: cursor, label: "frame covering noop/plan" },
      );
      cursor = next.index + 1;
      const frame = next.message.params.frame;
      assert.equal(frame.fromSeq, stateSeq);
      assert.ok(frame.toSeq > frame.fromSeq);
      const last = frame.payload.deltas.at(-1);
      if (last !== undefined) {
        // plan 是正交开关：collaboration mode 仍是 build，planEnabled 翻为 true。
        assert.equal(last.patch.revision, 2);
        assert.equal(last.patch.config.planEnabled, true);
        planSeen = true;
      } else {
        assert.deepEqual(frame.payload.deltas, [], "no-op event carries no visible delta");
      }
      stateSeq = frame.toSeq;
    }
    revision = 2;
  });

  await t.test("base 有效时 resume，只续传水位后的增量", async () => {
    const resumed = await subscribeConversation(app, {
      topic,
      connectionId: "seq-resume-link",
      clientMode: PROFILE,
      base: { logEpoch: ack.logEpoch, seq: stateSeq },
      workspace: workspaceInfo,
    });
    assert.equal(resumed.mode, "resume");
    assert.equal(resumed.logEpoch, ack.logEpoch);

    expectedAccepted(
      await app.request(
        "v4/command",
        commandEnvelope({
          commandId: newCommandId("seq-resume-bump"),
          sessionId,
          type: "switchCollaborationMode",
          payload: { mode: "edit" },
          baseRevision: revision,
        }),
      ),
    );
    const { message } = await waitForFrame(
      app,
      {
        topic,
        subscriptionId: resumed.subscriptionId,
        payloadKind: "deltas",
        fromSeq: stateSeq,
      },
      { label: "resume delta" },
    );
    assert.equal(message.params.frame.toSeq, stateSeq + 1);
    assert.equal(message.params.frame.payload.deltas.at(-1).patch.revision, 3);
    stateSeq += 1;
    revision = 3;
  });

  await t.test("base 无效时回落 snapshot，客户端据此替换状态", async () => {
    const fallback = await subscribeConversation(app, {
      topic,
      connectionId: "seq-bad-base",
      clientMode: PROFILE,
      base: { logEpoch: "stale-epoch", seq: 4096 },
      workspace: workspaceInfo,
    });
    assert.equal(fallback.mode, "snapshot");
    const { message } = await waitForFrame(
      app,
      { topic, subscriptionId: fallback.subscriptionId, deliveryKind: "initial" },
      { label: "fallback snapshot" },
    );
    const snapshot = message.params.frame.payload.snapshot;
    assert.equal(snapshot.seq, stateSeq);
    assert.equal(snapshot.revision, revision);
  });

  await t.test("resync forceSnapshot 在同一订阅上回到新快照", async () => {
    const response = await app.request("v4/conversation/resync", {
      topic,
      connectionId,
      subscriptionId: ack.subscriptionId,
      base: { logEpoch: ack.logEpoch, seq: stateSeq },
      forceSnapshot: true,
    });
    assert.equal(response.error, undefined, JSON.stringify(response));
    assert.equal(response.result.ack.mode, "snapshot");
    assert.equal(response.result.ack.subscriptionId, ack.subscriptionId);

    const { message } = await waitForFrame(
      app,
      { topic, subscriptionId: ack.subscriptionId, deliveryKind: "recovery" },
      { after: cursor, label: "recovery slice" },
    );
    const frame = message.params.frame;
    assert.equal(frame.payload.kind, "snapshot");
    assert.equal(frame.fromSeq, 0);
    assert.equal(frame.toSeq, stateSeq);
    assert.equal(frame.payload.snapshot.seq, frame.toSeq);
    assert.equal(frame.payload.snapshot.revision, revision);
  });

  await t.test("unsubscribe 只终止本订阅，其他链路继续收帧", async () => {
    const other = await subscribeConversation(app, {
      topic,
      connectionId: "seq-other-link",
      clientMode: PROFILE,
      workspace: workspaceInfo,
    });
    await waitForFrame(
      app,
      { topic, subscriptionId: other.subscriptionId, deliveryKind: "initial" },
      { label: "other initial" },
    );
    const unsubscribe = await app.request("v4/conversation/unsubscribe", {
      topic,
      connectionId,
      subscriptionId: ack.subscriptionId,
    });
    assert.equal(unsubscribe.error, undefined, JSON.stringify(unsubscribe));

    const before = app
      .messages()
      .filter((message) =>
        frameMatches(message, { topic, subscriptionId: ack.subscriptionId }),
      ).length;
    expectedAccepted(
      await app.request(
        "v4/command",
        commandEnvelope({
          commandId: newCommandId("seq-after-unsub"),
          sessionId,
          type: "switchCollaborationMode",
          payload: { mode: "yolo" },
          baseRevision: revision,
        }),
      ),
    );
    const { message } = await waitForFrame(
      app,
      { topic, subscriptionId: other.subscriptionId, payloadKind: "deltas" },
      { label: "other delta" },
    );
    assert.equal(message.params.frame.fromSeq, stateSeq);
    stateSeq = message.params.frame.toSeq;
    revision = 4;
    await app.sleep(400);
    const after = app
      .messages()
      .filter((msg) => frameMatches(msg, { topic, subscriptionId: ack.subscriptionId })).length;
    assert.equal(after, before, "unsubscribed link must not receive frames");
  });
});
