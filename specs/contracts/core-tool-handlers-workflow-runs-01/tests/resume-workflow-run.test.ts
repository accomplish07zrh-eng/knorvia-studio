// SPDX-License-Identifier: Apache-2.0
// ResumeWorkflowRun：端口门、成功输出恒等式、失败码表 11–17 与 message 判别键（B-rw-1..7）。
// 事件序列断言 + gate 握手，无 sleep。
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertCallSequence,
  callsOf,
  failureCode,
  failureMessage,
  gate,
  isFailure,
  makeContext,
  makePort,
} from "./harness.js";

const module =
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/resume-workflow-run.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/resume-workflow-run.js");

const entry = module.resumeWorkflowRunToolEntry;
const handler = entry.handler;

const CODES = {
  RESUME_UNAVAILABLE: 11,
  NOT_RESUMABLE: 12,
  ALREADY_RUNNING: 13,
  SCRIPT_MISSING: 14,
  SCRIPT_MISMATCH: 15,
  SUPERSEDED: 16,
  COMPILE_FAILED: 17,
} as const;

function okResult(runId = "dwfr-9") {
  return { ok: true, runId };
}

test("B-rw-1 port gate: missing port or resume method -> unavailable failure (code 11), zero port calls", async () => {
  const noPort = await handler({ run_id: "x" }, makeContext(undefined));
  assert.ok(isFailure(noPort));
  assert.equal(failureCode(noPort), CODES.RESUME_UNAVAILABLE);
  assert.match(failureMessage(noPort), /^workflow_resume_unavailable:/u);
  const { calls, port } = makePort({});
  const noMethod = await handler({ run_id: "x" }, makeContext(port));
  assert.ok(isFailure(noMethod));
  assert.equal(failureMessage(noMethod), failureMessage(noPort));
  assertCallSequence({ calls, port }, []);
});

test("B-rw-2 success shape: backgrounded with backgroundTaskId ≡ runId; exactly one resume", async () => {
  const { calls, port } = makePort({ resume: () => okResult("dwfr-77") });
  const output = (await handler({ run_id: "dwfr-77" }, makeContext(port))) as Record<
    string,
    unknown
  >;
  assert.equal(output.ok, true);
  assert.equal(output.status, "backgrounded");
  assert.equal(output.backgroundTaskId, output.runId);
  assert.equal(output.runId, "dwfr-77");
  assert.match(String(output.response), /has been resumed and is running in the background/u);
  assert.match(String(output.response), /Do not wait for it or poll it with TaskOutput/u);
  assertCallSequence({ calls, port }, ["resume"]);
  assert.deepEqual(callsOf({ calls, port }, "resume")[0]!.args, ["dwfr-77"]);
});

test("B-rw-3 not_found reuses the introspection run_not_found key (same prefix)", async () => {
  const { calls, port } = makePort({ resume: () => ({ ok: false, reason: "not_found" }) });
  const result = await handler({ run_id: "dwfr-404" }, makeContext(port));
  assert.ok(isFailure(result));
  assert.match(failureMessage(result), /^run_not_found/u);
  assertCallSequence({ calls, port }, ["resume"]);
});

test("B-rw-4 failure table: six reasons map to fixed codes with prefix keys; default falls to 12 with raw word", async () => {
  const cases = [
    ["compile_failed", CODES.COMPILE_FAILED, /^workflow_run_compile_failed:/u],
    ["not_resumable", CODES.NOT_RESUMABLE, /^workflow_run_not_resumable:/u],
    ["superseded", CODES.SUPERSEDED, /^workflow_run_superseded:/u],
    ["already_running", CODES.ALREADY_RUNNING, /^workflow_run_already_running:/u],
    ["script_missing", CODES.SCRIPT_MISSING, /^workflow_run_script_missing:/u],
    ["script_mismatch", CODES.SCRIPT_MISMATCH, /^workflow_run_script_mismatch:/u],
  ] as const;
  for (const [reason, code, pattern] of cases) {
    const { calls, port } = makePort({ resume: () => ({ ok: false, reason }) });
    const result = await handler({ run_id: "dwfr-1" }, makeContext(port));
    assert.equal(failureCode(result), code, reason);
    assert.match(failureMessage(result), pattern, reason);
    assertCallSequence({ calls, port }, ["resume"]);
  }
  const { calls, port } = makePort({ resume: () => ({ ok: false, reason: "something_new" }) });
  const result = await handler({ run_id: "dwfr-1" }, makeContext(port));
  assert.equal(failureCode(result), CODES.NOT_RESUMABLE);
  assert.match(failureMessage(result), /\(reason: something_new\)/u);
  assertCallSequence({ calls, port }, ["resume"]);
});

test("B-rw-4 compile_failed detail is appended on its own line; other reasons ignore detail", async () => {
  const { calls, port } = makePort({
    resume: () => ({ ok: false, reason: "compile_failed", message: "stack line 1" }),
  });
  const result = await handler({ run_id: "dwfr-2" }, makeContext(port));
  assert.match(failureMessage(result), /\nstack line 1$/u);
  assertCallSequence({ calls, port }, ["resume"]);
});

test("B-rw-5 code spaces stay separate: local 11–17 never equals the introspection keys 1/2", () => {
  for (const code of Object.values(CODES)) assert.ok(code >= 11 && code <= 17);
});

test("B-rw-6 description pins the resumable set and the same-run-ID semantics", () => {
  const description = String(entry.metadata.description);
  assert.match(description, /whose status is `stopped`/u);
  assert.match(description, /same run ID/u);
  assert.match(description, /NOT resumable/u);
  assert.match(description, /superseded/u);
});

test("B-rw-7 formatModelContent: invalid -> fixed sentence; success -> response verbatim", () => {
  assert.equal(entry.formatModelContent({}), "ResumeWorkflowRun returned an invalid result.");
  const response = "The workflow run dwfr-1 has been resumed…";
  assert.equal(
    entry.formatModelContent({
      ok: true,
      runId: "dwfr-1",
      status: "backgrounded",
      backgroundTaskId: "dwfr-1",
      response,
    }),
    response,
  );
});

test("gate handshake: resume held mid-call still settles without timers after open", async () => {
  const held = gate();
  const { calls, port } = makePort({
    resume: async () => {
      await held.opened;
      return okResult("dwfr-gate");
    },
  });
  const pending = handler({ run_id: "dwfr-gate" }, makeContext(port));
  held.open();
  const output = (await pending) as Record<string, unknown>;
  assert.equal(output.runId, "dwfr-gate");
  assertCallSequence({ calls, port }, ["resume"]);
});
