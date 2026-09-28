// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  SessionEventType,
  type TraceContext,
  type ToolResultDisplayPayload,
} from "@knorvia/contracts";
import { resolveToolApproval } from "../src/tool/executor/approval-gate.js";
import { invocation, eventPayload } from "./tool-invocation-fixture.js";

const trace: TraceContext = {
  traceId: "fixture-trace" as TraceContext["traceId"],
  spanId: "fixture-span",
};
const display: ToolResultDisplayPayload = {
  kind: "bash_output",
  output: "preview",
  truncated: false,
};
function preview() {
  const f = invocation();
  return { ...f, resolve: () => resolveToolApproval(f.deps, f.call, f.entry, f.call.input, trace) };
}

test("ask policy translates strict false and session while omitting an absent option", () => {
  for (const choice of [undefined, false, "session"] as const) {
    const f = preview();
    if (choice !== undefined) f.entry.permission.askOptions = { allowAlways: choice };
    const result = f.resolve();
    assert.deepEqual(
      result,
      choice === undefined
        ? { gate: "ask" }
        : {
            gate: "ask",
            optionsPolicy: choice === false ? "no-always-allow" : "session-always-allow",
          },
    );
    assert.deepEqual(f.observed.logs, []);
  }
  const partial = preview();
  Object.defineProperty(partial.entry, "permission", { value: undefined });
  assert.deepEqual(partial.resolve(), { gate: "ask" });
});

test("prepare callback uses entry receiver and original input; proceed never reads display", () => {
  const f = preview();
  f.entry.permission.askOptions = { allowAlways: false };
  f.entry.prepareApproval = function (input) {
    assert.equal(this, f.entry);
    assert.equal(input, f.call.input);
    return {
      gate: "proceed",
      get display() {
        assert.fail("proceed read display");
        return display;
      },
    };
  };
  assert.deepEqual(f.resolve(), { gate: "proceed" });
});

test("ask captures options before callback and preserves display reread, identity and key order", () => {
  const f = preview(),
    replacement = { ...display, output: "replacement" };
  let reads = 0;
  f.entry.permission.askOptions = { allowAlways: false };
  f.entry.prepareApproval = () => {
    f.entry.permission.askOptions = { allowAlways: "session" };
    return {
      gate: "ask",
      get display() {
        return ++reads === 1 ? display : replacement;
      },
    };
  };
  const result = f.resolve();
  assert.equal(reads, 2);
  assert.equal(result.display, replacement);
  assert.equal(result.optionsPolicy, "no-always-allow");
  assert.deepEqual(Object.keys(result), ["gate", "display", "optionsPolicy"]);
});

test("preview failure still asks with original policy and emits structured warning", () => {
  for (const failure of [new Error("preview failed"), "non-error failure"]) {
    const f = preview();
    f.entry.permission.askOptions = { allowAlways: "session" };
    f.entry.prepareApproval = () => {
      throw failure;
    };
    assert.deepEqual(f.resolve(), { gate: "ask", optionsPolicy: "session-always-allow" });
    const [level, message, raw] = f.observed.logs[0];
    const fields = raw as Record<string, unknown>;
    assert.equal(level, "warn");
    assert.equal(message, "Tool approval preview failed; asking without a preview");
    assert.equal(fields.error, failure instanceof Error ? failure.message : failure);
    assert.equal(fields.traceId, trace.traceId);
    assert.equal(fields.spanId, trace.spanId);
    assert.equal(fields.event, "tool.permission.approval_preview_failed");
    assert.equal(fields.toolCallId, f.call.id);
    assert.equal(fields.toolName, f.call.name);
  }
});

test("policy and first method getters escape, while second method lookup is caught", () => {
  for (const property of ["permission", "prepareApproval"] as const) {
    const f = preview(),
      failure = { property };
    Object.defineProperty(f.entry, property, {
      get() {
        throw failure;
      },
    });
    assert.throws(f.resolve, (error) => error === failure);
    assert.deepEqual(f.observed.logs, []);
  }
  const f = preview();
  let reads = 0;
  Object.defineProperty(f.entry, "prepareApproval", {
    get() {
      if (++reads === 1) return () => ({ gate: "proceed" });
      throw new Error("second method lookup");
    },
  });
  assert.deepEqual(f.resolve(), { gate: "ask" });
  assert.equal(reads, 2);
  assert.equal(f.observed.logs.length, 1);
});

test("display getter failure still asks and absent logger does not evaluate warning fields", () => {
  const f = preview();
  f.entry.prepareApproval = () => ({
    gate: "ask",
    get display(): ToolResultDisplayPayload {
      throw new Error("preview accessor");
    },
  });
  assert.deepEqual(f.resolve(), { gate: "ask" });
  f.deps.logger = undefined;
  Object.defineProperty(f.call, "name", {
    get() {
      assert.fail("unexpected logging read");
    },
  });
  assert.deepEqual(f.resolve(), { gate: "ask" });
});

test("warning adapter failure propagates instead of granting permission", () => {
  const f = preview(),
    failure = { logger: "failed" };
  f.entry.prepareApproval = () => {
    throw new Error("preview failed");
  };
  f.deps.logger!.warn = () => {
    throw failure;
  };
  assert.throws(f.resolve, (error) => error === failure);
});

test("actual invocation sends preview and constrained options, with refusal never reaching handler", async () => {
  const f = invocation();
  f.behavior.decision = "ask";
  f.behavior.reply = { decision: "deny", reason: "fixture refusal" };
  f.entry.permission.askOptions = { allowAlways: false };
  f.entry.prepareApproval = () => ({ gate: "ask", display });
  const result = await f.run();
  assert.equal(result.success, false);
  assert.equal(f.observed.inputs.length, 0);
  const event = f.events.find((item) => item.type === SessionEventType.PermissionRequested);
  assert.ok(event);
  const payload = eventPayload(event);
  assert.equal(payload.optionsPolicy, "no-always-allow");
  assert.equal(payload.display, display);
});

test("actual invocation proceeds without broker only when preview explicitly proceeds", async () => {
  const f = invocation();
  f.behavior.decision = "ask";
  f.entry.prepareApproval = () => ({ gate: "proceed" });
  assert.equal((await f.run()).success, true);
  assert.equal(f.observed.inputs.length, 1);
  assert.equal(f.timeline.includes("broker"), false);
  assert.equal(
    f.events.some((event) => event.type === SessionEventType.PermissionRequested),
    false,
  );
});
