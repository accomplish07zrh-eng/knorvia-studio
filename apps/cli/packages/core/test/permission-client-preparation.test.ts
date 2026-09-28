// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  CREATE_WORKFLOW_TOOL_NAME,
  AMEND_WORKFLOW_TOOL_NAME,
  type PermissionBrokerRequest,
} from "@knorvia/contracts";
import { createTuiPermissionRequester } from "../../tui/src/app-permission.js";
import type { ApprovalPrompt } from "../../tui/src/app-model.js";
import { createHeadlessPermissionBroker } from "../../cli/src/headless-workflow.js";
import { createTuiPermissionBroker } from "../../cli/src/tui-permission-broker.js";
import { ManualPermissionBroker } from "../src/permission/broker.js";
import { createSubagentInteractionBroker } from "../src/runtime/helpers/subagent-interaction-broker.js";

function request(toolName = "Fixture"): PermissionBrokerRequest {
  return {
    requestId: "fixture",
    sessionId: "fixture-session" as PermissionBrokerRequest["sessionId"],
    traceId: "fixture-trace" as PermissionBrokerRequest["traceId"],
    toolCallId: "fixture-call" as PermissionBrokerRequest["toolCallId"],
    toolName,
    input: {},
    mode: "build",
    ruleId: "fixture",
    reason: "fixture approval",
    riskLevel: "low",
    requestedAt: new Date(0),
  };
}
function tui() {
  let queue: ApprovalPrompt[] = [];
  const statuses: string[] = [];
  const requester = createTuiPermissionRequester({
    setApprovalQueue(next) {
      queue = typeof next === "function" ? next(queue) : next;
    },
    setStatus(value) {
      statuses.push(value);
    },
  });
  return {
    requester,
    statuses,
    get queue() {
      return queue;
    },
  };
}

test("TUI preparation does not paint an approval until activation and preserves keyboard completion", async () => {
  const f = tui();
  const handle = await f.requester.preparePermission(request());
  assert.equal(f.queue.length, 0);
  assert.equal(f.statuses.length, 0);
  assert.equal(handle.activate(), true);
  handle.activate();
  assert.equal(f.queue.length, 1);
  assert.equal(f.statuses.length, 1);
  const prompt = f.queue[0];
  prompt.cleanup();
  prompt.resolve({ decision: "allow" });
  assert.equal((await handle.result).decision, "allow");
  assert.equal(f.queue.length, 0);
  assert.equal(handle.activate(), false);
});

test("TUI cancellation removes only its own prompt and cold cancellation stays invisible", async () => {
  const f = tui();
  const cold = await f.requester.preparePermission(request());
  cold.dispose();
  await assert.rejects(cold.result, /Permission request cancelled/);
  assert.equal(cold.activate(), false);
  assert.equal(f.queue.length, 0);
  const first = await f.requester.preparePermission(request());
  first.activate();
  const abort = new AbortController();
  const next = await f.requester.preparePermission(request(), { signal: abort.signal });
  next.activate();
  const survivor = f.queue[0];
  abort.abort();
  await assert.rejects(next.result, /Permission request cancelled/);
  assert.deepEqual(f.queue, [survivor]);
  next.dispose();
  assert.deepEqual(f.queue, [survivor]);
  first.dispose();
  await assert.rejects(first.result);
  assert.equal(f.queue.length, 0);
});

test("workflow exemptions and invalid questions still pass through quiet preparation", async () => {
  const f = tui();
  for (const toolName of [CREATE_WORKFLOW_TOOL_NAME, AMEND_WORKFLOW_TOOL_NAME, "AskUserQuestion"]) {
    const handle = await f.requester.preparePermission(request(toolName));
    let resolved = false;
    void handle.result.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    assert.equal(resolved, false);
    assert.equal(handle.activate(), true);
    const result = await handle.result;
    assert.equal(result.decision, toolName === "AskUserQuestion" ? "deny" : "allow");
    assert.equal(result.permissionUpdates, undefined);
  }
  assert.equal(f.queue.length, 0);
  assert.equal(f.statuses.length, 0);
});

test("headless preparation preserves workflow exceptions and default denial with cancellation", async () => {
  const broker = createHeadlessPermissionBroker();
  for (const toolName of [CREATE_WORKFLOW_TOOL_NAME, AMEND_WORKFLOW_TOOL_NAME, "Fixture"]) {
    const handle = await broker.preparePermission(request(toolName));
    let resolved = false;
    void handle.result.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    assert.equal(resolved, false);
    assert.equal(handle.activate(), true);
    const result = await handle.result;
    assert.equal(result.decision, toolName === "Fixture" ? "deny" : "allow");
    assert.equal(result.permissionUpdates, undefined);
    const abort = new AbortController();
    const cancelled = await broker.preparePermission(request(toolName), { signal: abort.signal });
    abort.abort();
    await assert.rejects(cancelled.result);
    assert.equal(cancelled.activate(), false);
    assert.equal((await broker.requestPermission(request(toolName))).decision, result.decision);
  }
});

test("CLI TUI forwarding binds the prepared handler while later turns may choose another", async () => {
  const first = tui(),
    next = tui();
  let active = first.requester;
  const broker = createTuiPermissionBroker(() => active);
  const handle = await broker.preparePermission(request());
  active = next.requester;
  handle.activate();
  assert.equal(first.queue.length, 1);
  assert.equal(next.queue.length, 0);
  first.queue[0].resolve({ decision: "allow" });
  assert.equal((await handle.result).decision, "allow");
  const missing = createTuiPermissionBroker(() => undefined);
  assert.equal((await missing.requestPermission(request())).decision, "deny");
});

test("nested subagents forward the same lifecycle to the root while preserving original origin", async () => {
  const parent = new ManualPermissionBroker();
  const root = "root" as PermissionBrokerRequest["sessionId"],
    middle = "middle" as typeof root,
    child = "child" as typeof root;
  const outer = createSubagentInteractionBroker(parent, {
    agentId: "middle-agent",
    agentType: "fixture",
    parentSessionId: root,
    childSessionId: middle,
    description: "middle",
  });
  const inner = createSubagentInteractionBroker(outer, {
    agentId: "child-agent",
    agentType: "fixture",
    parentSessionId: middle,
    childSessionId: child,
    description: "child",
  });
  const handle = await inner.preparePermission(request());
  const routed = parent.getPendingRequest("fixture");
  assert.equal(routed?.sessionId, root);
  assert.equal(routed?.origin?.kind, "subagent");
  assert.equal(routed?.origin?.childSessionId, child);
  assert.equal(routed?.origin?.parentSessionId, middle);
  parent.resolvePermission("fixture", { decision: "allow" });
  assert.equal((await handle.result).decision, "allow");
  assert.equal(handle.activate(), false);
  assert.deepEqual(parent.listPendingRequests(), []);
});
