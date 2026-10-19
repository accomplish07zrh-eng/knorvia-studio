// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 合同 B3–B7：CommandInbox 的 ACK 状态、CAS、幂等与查询。
// 全部经 v4 公开协议入口驱动，不 import 任何内部模块。
import assert from "node:assert/strict";
import test from "node:test";
import {
  commandEnvelope,
  createDraftSession,
  expectedAccepted,
  expectedAckStatus,
  makeTempDir,
  newCommandId,
  removeTempDir,
  spawnBridgeApp,
  subscribeConversation,
  waitForFrame,
  workspaceRef,
} from "./_protocol.mjs";

test("kernel-bridge-01 · CommandInbox 经 v4 公开入口保持既有裁决", async (t) => {
  const home = await makeTempDir("bridge01-inbox-home-");
  const workspace = await makeTempDir("bridge01-inbox-ws-");
  const app = await spawnBridgeApp({ cwd: workspace, home });
  t.after(async () => {
    await app.close();
    await removeTempDir(home);
    await removeTempDir(workspace);
  });

  let connectionSeq = 0;
  async function readSnapshot(sessionId) {
    const connectionId = `inbox-reader-${(connectionSeq += 1)}`;
    const ack = await subscribeConversation(app, {
      topic: `conversation/${sessionId}`,
      connectionId,
      clientMode: "desktop-continuous",
      workspace: workspaceRef(workspace),
    });
    const { message } = await waitForFrame(
      app,
      { topic: `conversation/${sessionId}`, subscriptionId: ack.subscriptionId },
      { label: "reader snapshot" },
    );
    assert.equal(message.params.wireVersion, 3);
    assert.equal(message.params.frame.payload.kind, "snapshot");
    return message.params.frame.payload.snapshot;
  }

  await t.test("createSession 使用全局幂等桶；重复 commandId 返回同一会话", async () => {
    const commandId = newCommandId("create-global");
    const envelope = commandEnvelope({
      commandId,
      type: "createSession",
      payload: { workspaceId: workspace },
    });
    const first = expectedAccepted(await app.request("v4/command", envelope));
    const second = expectedAckStatus(await app.request("v4/command", envelope), "duplicate");
    assert.equal(second.commandId, commandId);
    assert.equal(second.result?.type, "createSession");
    assert.equal(second.result?.sessionId, first.result?.sessionId);
    assert.equal(second.revisionAtDecision, 0);

    const query = await app.request("v4/commands/query", {
      commands: [{ sessionId: null, commandId }],
    });
    assert.equal(query.error, undefined);
    const [item] = query.result.results;
    assert.equal(item.key.sessionId, null);
    assert.notEqual(item.result, "unknown");
    assert.equal(item.result.status, "accepted");
  });

  await t.test("CAS 命令缺 baseRevision → rejected proto.invalidPayload", async () => {
    const { sessionId } = await createDraftSession(app, workspace);
    const envelope = commandEnvelope({
      commandId: newCommandId("missing-base"),
      sessionId,
      type: "setFollowupMode",
      payload: { mode: "guide" },
    });
    const ack = expectedAckStatus(await app.request("v4/command", envelope), "rejected");
    assert.equal(ack.reasonCode, "proto.invalidPayload");

    // 拒绝类 ACK 不进入 settled 缓存：同 commandId 重试重新裁决，不返回 duplicate。
    const retry = expectedAckStatus(await app.request("v4/command", envelope), "rejected");
    assert.equal(retry.reasonCode, "proto.invalidPayload");
  });

  await t.test("过期 baseRevision → stale proto.staleRevision 且不落状态", async () => {
    const { sessionId } = await createDraftSession(app, workspace);
    expectedAccepted(
      await app.request(
        "v4/command",
        commandEnvelope({
          commandId: newCommandId("bump"),
          sessionId,
          type: "setFollowupMode",
          payload: { mode: "guide" },
          baseRevision: 0,
        }),
      ),
    );
    const staleEnvelope = commandEnvelope({
      commandId: newCommandId("stale-base"),
      sessionId,
      type: "setFollowupMode",
      payload: { mode: "queue" },
      baseRevision: 0,
    });
    const stale = expectedAckStatus(await app.request("v4/command", staleEnvelope), "stale");
    assert.equal(stale.reasonCode, "proto.staleRevision");
    assert.equal(stale.revisionAtDecision, 1);

    const staleRetry = expectedAckStatus(await app.request("v4/command", staleEnvelope), "stale");
    assert.equal(staleRetry.reasonCode, "proto.staleRevision");
    assert.equal(staleRetry.revisionAtDecision, 1);

    const snapshot = await readSnapshot(sessionId);
    assert.equal(snapshot.revision, 1);
    assert.equal(snapshot.config.followupMode, "guide");
  });

  await t.test("重复 commandId 回放首次 ACK，不按新 payload 重放", async () => {
    const { sessionId } = await createDraftSession(app, workspace);
    const commandId = newCommandId("idempotent");
    expectedAccepted(
      await app.request(
        "v4/command",
        commandEnvelope({
          commandId,
          sessionId,
          type: "setFollowupMode",
          payload: { mode: "guide" },
          baseRevision: 0,
        }),
      ),
    );
    const duplicate = expectedAckStatus(
      await app.request(
        "v4/command",
        commandEnvelope({
          commandId,
          sessionId,
          type: "setFollowupMode",
          payload: { mode: "queue" },
          baseRevision: 0,
        }),
      ),
      "duplicate",
    );
    assert.equal(duplicate.revisionAtDecision, 0);

    const snapshot = await readSnapshot(sessionId);
    assert.equal(snapshot.revision, 1);
    assert.equal(snapshot.config.followupMode, "guide");

    const query = await app.request("v4/commands/query", {
      commands: [{ sessionId, commandId }],
    });
    assert.equal(query.error, undefined);
    const [item] = query.result.results;
    assert.equal(item.result.status, "accepted");
    assert.equal(item.result.revisionAtDecision, 0);
  });

  await t.test("未知会话与非法 payload 在边界被拒绝", async () => {
    const unknown = await app.request(
      "v4/command",
      commandEnvelope({
        commandId: newCommandId("unknown-session"),
        sessionId: "sess_missing",
        type: "setFollowupMode",
        payload: { mode: "guide" },
        baseRevision: 0,
      }),
    );
    const unknownAck = expectedAckStatus(unknown, "rejected");
    assert.equal(unknownAck.reasonCode, "proto.sessionNotFound");

    const { sessionId } = await createDraftSession(app, workspace);
    const invalid = await app.request(
      "v4/command",
      commandEnvelope({
        commandId: newCommandId("invalid-payload"),
        sessionId,
        type: "setFollowupMode",
        payload: { mode: "invalid-mode" },
        baseRevision: 0,
      }),
    );
    const invalidAck = expectedAckStatus(invalid, "rejected");
    assert.equal(invalidAck.reasonCode, "proto.invalidPayload");
  });

  await t.test("行定位命令的过期 baseLogEpoch → stale proto.staleLogEpoch", async () => {
    const { sessionId } = await createDraftSession(app, workspace);
    const ack = expectedAckStatus(
      await app.request(
        "v4/command",
        commandEnvelope({
          commandId: newCommandId("stale-epoch"),
          sessionId,
          type: "retryTurn",
          payload: { target: { rowId: 1, entityId: "row-1" } },
          baseRevision: 0,
          baseLogEpoch: "not-the-current-epoch",
        }),
      ),
      "stale",
    );
    assert.equal(ack.reasonCode, "proto.staleLogEpoch");
    assert.equal(ack.revisionAtDecision, 0);
  });
});
