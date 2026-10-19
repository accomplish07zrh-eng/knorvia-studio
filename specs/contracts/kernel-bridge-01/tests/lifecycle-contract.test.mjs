// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 合同 B16：v4 入口的进程生命周期与 stdout 纯净性。
// 先完成一次真实 v4 交互再关 stdin，避免 transport 桩仅凭退出行为通过。
import assert from "node:assert/strict";
import test from "node:test";
import { createDraftSession, makeTempDir, removeTempDir, spawnBridgeApp } from "./_protocol.mjs";

test("kernel-bridge-01 · stdin 结束后正常退出，stdout 只有协议行", async (t) => {
  const home = await makeTempDir("bridge01-life-home-");
  const workspace = await makeTempDir("bridge01-life-ws-");
  const app = await spawnBridgeApp({ cwd: workspace, home });
  t.after(async () => {
    await app.close();
    await removeTempDir(home);
    await removeTempDir(workspace);
  });

  const { sessionId } = await createDraftSession(app, workspace);
  assert.equal(typeof sessionId, "string");

  const exit = await app.close();
  assert.deepEqual(exit, { code: 0, signal: null });
  assert.deepEqual(app.state.invalidLines, [], "stdout must stay NDJSON-only");
  for (const message of app.state.lines) {
    assert.ok(
      message.method !== undefined || message.id !== undefined,
      `non-protocol stdout object: ${JSON.stringify(message)}`,
    );
  }
});
