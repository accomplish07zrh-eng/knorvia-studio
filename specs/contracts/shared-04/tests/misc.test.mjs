// SPDX-License-Identifier: Apache-2.0
// shared-04 合同测试：服务端远控 schema 与会话创建遥测（B9、B40）。
import assert from "node:assert/strict";
import { test } from "node:test";

import { loadModule, entryLabel } from "./entry.mjs";
import { assertJsonEqual, readFixture } from "./fixtures.mjs";

const remoteFixture = readFixture("remote-identity.json");
const diagnosticsFixture = readFixture("diagnostics.json");
const serverRemote = await loadModule("server-remote.ts");
const sessionTelemetry = await loadModule("sessionCreateTelemetry.ts");

test(`B9 server-remote：协议版本 1、strict 工作区与 host capability（${entryLabel}）`, () => {
  assert.equal(
    serverRemote.SERVER_REMOTE_PROTOCOL_VERSION,
    remoteFixture.serverRemote.protocolVersion,
  );
  assert.equal(serverRemote.SERVER_REMOTE_PROTOCOL_VERSION, 1);
  for (const entry of remoteFixture.serverRemote.info) {
    assert.equal(
      serverRemote.serverRemoteInfoSchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input),
    );
  }
  for (const entry of remoteFixture.serverRemote.hostCapability) {
    assert.equal(
      serverRemote.serverRemoteHostCapabilitySchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input),
    );
  }
  for (const entry of remoteFixture.serverRemote.workspace) {
    assert.equal(
      serverRemote.serverRemoteWorkspaceInfoSchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input),
    );
  }
});

test("B40 sessionCreateTelemetry：手机只报 mobile、自动化只报 desktop", () => {
  for (const entry of diagnosticsFixture.sessionCreateTelemetry.mobile) {
    assert.equal(
      sessionTelemetry.sessionCreateTelemetrySchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input.eventExtraDetail),
    );
  }
  for (const entry of diagnosticsFixture.sessionCreateTelemetry.automation) {
    assert.equal(
      sessionTelemetry.automationSessionCreateTelemetrySchema.safeParse(entry.input).success,
      entry.success,
      JSON.stringify(entry.input.eventExtraDetail),
    );
  }
});
