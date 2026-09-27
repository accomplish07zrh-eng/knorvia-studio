// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import { test } from "node:test";
import { callContext, textField } from "../src/ipc.js";

test("context strings are trimmed without coercing other value types", () => {
  for (const value of [undefined, null, true, false, 0, 42, {}, [], "", " \t\n"]) {
    assert.equal(textField({ sample: value }, "sample"), undefined);
  }
  assert.equal(textField({ sample: " \t工作区 / one \n" }, "sample"), "工作区 / one");
  assert.equal(textField({}, "missing"), undefined);
});

test("browser projection whitelists session, turn and trace and never forwards workspace assertions", () => {
  const meta = Object.freeze({
    session_id: " session ",
    turn_id: " turn ",
    trace_id: " trace ",
    span_id: " span ",
    parent_span_id: " parent ",
    workspace_key: "key",
    workspace_identity: "identity",
    workspace_path: "path",
    remote_session_id: "remote",
    runtime_scope: "subagent",
    client_mode: "web-remote-replayable",
    delivery_kind: "custom",
    extra: "private",
  });
  assert.deepEqual(callContext(meta), {
    sessionId: "session",
    runtimeScope: "main",
    turnId: "turn",
    trace: { traceId: "trace", spanId: "span", parentSpanId: "parent" },
  });
  assert.deepEqual(callContext({ session_id: "session", span_id: "orphan" }), {
    sessionId: "session",
    runtimeScope: "main",
  });
  assert.deepEqual(callContext({ session_id: "session", trace_id: "trace" }), {
    sessionId: "session",
    runtimeScope: "main",
    trace: { traceId: "trace", spanId: undefined, parentSpanId: undefined },
  });
});

test("Computer Use preserves remote identity and resolves workspace keys by declared priority", () => {
  const meta = {
    session_id: "session",
    workspace_key: " explicit ",
    workspace_identity: " ssh:host:root ",
    workspace_path: " /project ",
    remote_session_id: " remote ",
    turn_id: "turn",
    trace_id: "trace",
    client_mode: "web-remote-replayable",
    delivery_kind: " replay ",
  };
  assert.deepEqual(callContext(meta, true), {
    sessionId: "session",
    runtimeScope: "main",
    turnId: "turn",
    workspaceIdentity: "ssh:host:root",
    workspacePath: "/project",
    remoteSessionId: "remote",
    workspaceKey: "explicit",
    clientMode: "web-remote-replayable",
    deliveryKind: "replay",
    trace: { traceId: "trace", spanId: undefined, parentSpanId: undefined },
  });
  assert.equal(callContext({ ...meta, workspace_key: " " }, true).workspaceKey, "ssh:host:root");
  assert.equal(
    callContext({ ...meta, workspace_key: 1, workspace_identity: " " }, true).workspaceKey,
    "/project",
  );
});

test("Computer Use mode defaults do not override a supplied mode or delivery kind", () => {
  const base = { session_id: "session", workspace_path: "/project" };
  assert.deepEqual(callContext(base, true), {
    sessionId: "session",
    runtimeScope: "main",
    workspacePath: "/project",
    workspaceKey: "/project",
    clientMode: "desktop-continuous",
    deliveryKind: "desktop-continuous",
  });
  const custom = callContext({ ...base, client_mode: " custom-mode " }, true);
  assert.equal(custom.clientMode, "custom-mode");
  assert.equal(custom.deliveryKind, "custom-mode");
  assert.equal(
    callContext({ ...base, delivery_kind: "replay" }, true).clientMode,
    "desktop-continuous",
  );
});

test("missing identity fails at the correct boundary without leaking metadata", () => {
  for (const session_id of [undefined, "", " ", null, 7]) {
    assert.throws(
      () => callContext({ session_id, workspace_key: "present" }, true),
      /^Error: Request is missing session_id metadata$/,
    );
    assert.throws(() => callContext({ session_id }), /missing session_id/);
  }
  assert.throws(
    () => callContext({ session_id: "session", extra: "private" }, true),
    /^Error: Request is missing workspaceKey metadata$/,
  );
});

test("context results are independent snapshots and never mutate input metadata", () => {
  const input = Object.freeze({
    session_id: "session",
    workspace_identity: "identity",
    trace_id: "trace",
  });
  const first = callContext(input, true);
  const second = callContext(input, true);
  first.workspaceKey = "changed";
  (first.trace as Record<string, unknown>).traceId = "changed";
  assert.equal(second.workspaceKey, "identity");
  assert.deepEqual(second.trace, { traceId: "trace", spanId: undefined, parentSpanId: undefined });
  assert.equal(input.trace_id, "trace");
});
