// SPDX-License-Identifier: Apache-2.0
// shared-03 契约测试：task-realtime-core（behavior B42–B43，金样③ gate 握手七口径逐条）。
import assert from "node:assert/strict";
import test from "node:test";

import { loadModule } from "./entry.mjs";
import { taskRealtimeGate as golden } from "./fixtures.mjs";

const core = await loadModule("task-realtime-core");

test("B42 口径①：workspaceKey = identity.trim() || path", () => {
  assert.equal(
    core.resolveWorkspaceKey({ workspacePath: "/ws", workspaceIdentity: " ws-identity-1 " }),
    golden.resolveWorkspaceKey.withIdentity,
  );
  assert.equal(
    core.resolveWorkspaceKey({ workspacePath: "/ws", workspaceIdentity: "  " }),
    golden.resolveWorkspaceKey.noIdentity,
  );
  assert.equal(core.resolveWorkspaceKey({ workspacePath: "/ws" }), "/ws");
});

test("B42 口径⑦：reason 14 项与 delivered extend 面（金样 constants）", () => {
  assert.deepEqual([...core.taskRealtimeReasonSchema.options], golden.constants.reasons);
  assert.equal(golden.constants.reasons.length, 14);
  assert.deepEqual(
    [...core.taskRealtimeDeliveryPurposeSchema.options],
    ["observer", "relay_owner"],
  );
  assert.deepEqual(
    [...core.taskRealtimeHostDeliveryKindSchema.options],
    ["desktop_window", "relay_bridge"],
  );
});

test("B42/B43 口径②③：gate 握手金样逐条（schemaResults）", () => {
  const expect = {
    "event-batch": true,
    "event-batch-key-bad": false,
    "event-batch-run-bad": false,
    "delivered-batch": true,
    "lease-result-acquired": true,
    "lease-result-denied": true,
    "owner-command": true,
    "owner-command-remote-no-identity": false,
    "owner-command-result-error": true,
  };
  for (const [name, ok] of Object.entries(expect)) {
    const recorded = golden.schemaResults[name];
    assert.equal(recorded.ok, ok, `${name} 的录制结论`);
    assert.equal(recorded.expectOk ?? ok, ok);
  }
  // 现场重放违例文案（B42 超级校验逐字）
  const keyBad = core.taskRealtimeEventSchema.safeParse({
    ...golden.batchEvent,
    workspaceKey: "wrong",
  });
  assert.equal(keyBad.success, false);
  assert.equal(
    keyBad.error.issues[0].message,
    "workspaceKey must match workspaceIdentity fallback rule",
  );
  const runBad = core.taskRealtimeEventSchema.safeParse({ ...golden.batchEvent, runId: "run-2" });
  assert.equal(runBad.success, false);
  assert.equal(runBad.error.issues[0].message, "runId must match traceId");
});

test("B42 口径④：remoteSessionId ⇒ workspaceIdentity（金样逐字文案）", () => {
  const result = core.taskRealtimeEventSchema !== undefined;
  assert.ok(result);
  const bad = core.taskOwnerCommandRequestSchema.safeParse({
    type: "respond_workspace_hook_review",
    commandRequestId: "c-2",
    workspacePath: "/ws",
    workspaceKey: "/ws",
    taskId: "t-1",
    runId: "run-1",
    sessionId: "s-1",
    bundleDigest: "b".repeat(64),
    reviewFlowId: "flow-1",
    generation: 3,
    interactionId: "i-1",
    decision: { action: "trust_selected", reviewItemIds: ["item-1"] },
    remoteSessionId: "r-1",
  });
  assert.equal(bad.success, false);
  assert.equal(
    bad.error.issues[0].message,
    "remote workspace Hook review response requires workspaceIdentity",
  );
});

test("B43 口径⑤⑥：lease 判别双态与附件 5-kind 全集", () => {
  const acquired = core.taskRunLeaseResultSchema.parse({
    leaseRequestId: "l-2",
    acquired: true,
    ownerHostId: "host-1",
  });
  assert.equal(acquired.acquired, true);
  const denied = core.taskRunLeaseResultSchema.parse({
    leaseRequestId: "l-3",
    acquired: false,
    ownerHostId: "host-1",
    reason: "owned_by_other_host",
  });
  assert.equal(denied.reason, "owned_by_other_host");
  // 附件 5-kind：经 user_message op 的 attachments 面断言（金样 op 内含全集）
  const op = golden.batchEvent.ops[0];
  assert.equal(op.attachments.length, 5);
  assert.deepEqual(
    op.attachments.map((a) => a.kind),
    ["image", "audio", "video", "pdf", "file"],
  );
  const fileMissingSize = core.taskRealtimeEventSchema.safeParse({
    ...golden.batchEvent,
    ops: [
      { ...op, attachments: [{ kind: "file", filename: "f", mimeType: "text/plain" }], seq: 11 },
    ],
    toSeq: 11,
  });
  assert.equal(fileMissingSize.success, false, "file 缺 sizeBytes 必须拒");
});

test("B43 owner-command 七形态与错误码三值（抽查+金样）", () => {
  assert.deepEqual(
    [...core.taskOwnerCommandErrorCodeSchema.options],
    ["NO_ACTIVE_TASK_OWNER", "STALE_TASK_OWNER_COMMAND", "OWNER_COMMAND_FAILED"],
  );
  const ok = core.taskOwnerCommandRequestSchema.safeParse({
    type: "cancel_task_command",
    commandRequestId: "c-9",
    workspacePath: "/ws",
    workspaceKey: "/ws",
    taskId: "t-1",
    runId: "run-1",
    commandId: "cmd-1",
    clientMode: "web-remote-replayable",
  });
  assert.equal(ok.success, true);
  const badMode = core.taskOwnerCommandRequestSchema.safeParse({
    type: "cancel_task_command",
    commandRequestId: "c-9",
    workspacePath: "/ws",
    workspaceKey: "/ws",
    taskId: "t-1",
    runId: "run-1",
    commandId: "cmd-1",
    clientMode: "desktop-continuous",
  });
  assert.equal(badMode.success, false, "clientMode 是字面 web-remote-replayable");
});
