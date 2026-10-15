// SPDX-License-Identifier: Apache-2.0
// ResolveWorkflowQuestion：端口门、成功输出、失败码 21–24、message 原样透传（B-qs-1..5）。
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
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/resolve-workflow-question.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/resolve-workflow-question.js");

const entry = module.resolveWorkflowQuestionToolEntry;
const handler = entry.handler;

const CODES = {
  ANSWERING_UNAVAILABLE: 21,
  UNKNOWN_QUESTION: 22,
  ALREADY_RESOLVED: 23,
  RUN_NOT_IN_FLIGHT: 24,
} as const;

test("B-qs-1 port gate: missing port or resolveQuestion -> unavailable (21), zero port calls", async () => {
  const noPort = await handler({ question_id: "q", answer: "a" }, makeContext(undefined));
  assert.ok(isFailure(noPort));
  assert.equal(failureCode(noPort), CODES.ANSWERING_UNAVAILABLE);
  assert.match(failureMessage(noPort), /^workflow_question_answering_unavailable:/u);
  const { calls, port } = makePort({});
  assert.ok(isFailure(await handler({ question_id: "q", answer: "a" }, makeContext(port))));
  assertCallSequence({ calls, port }, []);
});

test("B-qs-2 success: exactly one resolveQuestion with (qid, answer) verbatim; response pins both facts", async () => {
  const { calls, port } = makePort({ resolveQuestion: () => ({ ok: true, qid: "dwfq-7" }) });
  const output = (await handler(
    { question_id: "dwfq-7", answer: "keep the newer shard" },
    makeContext(port),
  )) as Record<string, unknown>;
  assert.equal(output.ok, true);
  assert.equal(output.qid, "dwfq-7");
  assert.equal(
    output.response,
    "Answer delivered for question dwfq-7. The subagent that asked has resumed its turn with your answer; the run keeps going as before.",
  );
  assertCallSequence({ calls, port }, ["resolveQuestion"]);
  assert.deepEqual(callsOf({ calls, port }, "resolveQuestion")[0]!.args, [
    "dwfq-7",
    "keep the newer shard",
  ]);
});

test("B-qs-3 reason table: three reasons map to 22/23/24; default -> 22 with raw word appended", async () => {
  for (const [reason, code] of [
    ["unknown_question", CODES.UNKNOWN_QUESTION],
    ["already_resolved", CODES.ALREADY_RESOLVED],
    ["run_not_in_flight", CODES.RUN_NOT_IN_FLIGHT],
  ] as const) {
    const { calls, port } = makePort({
      resolveQuestion: () => ({ ok: false, reason, message: "server words" }),
    });
    const result = await handler({ question_id: "q", answer: "a" }, makeContext(port));
    assert.equal(failureCode(result), code, reason);
    assertCallSequence({ calls, port }, ["resolveQuestion"]);
  }
  const { calls, port } = makePort({
    resolveQuestion: () => ({ ok: false, reason: "mystery", message: "server words" }),
  });
  const result = await handler({ question_id: "q", answer: "a" }, makeContext(port));
  assert.equal(failureCode(result), CODES.UNKNOWN_QUESTION);
  assert.equal(failureMessage(result), "server words (reason: mystery)");
  assertCallSequence({ calls, port }, ["resolveQuestion"]);
});

test("B-qs-4 rejection messages pass through byte-identical (no local rewriting)", async () => {
  const serverMessage = "question dwfq-1 was already answered with 'x' at 12:00.";
  for (const reason of ["unknown_question", "already_resolved", "run_not_in_flight"] as const) {
    const { calls, port } = makePort({
      resolveQuestion: () => ({ ok: false, reason, message: serverMessage }),
    });
    const result = await handler({ question_id: "q", answer: "a" }, makeContext(port));
    assert.equal(failureMessage(result), serverMessage, reason);
    assertCallSequence({ calls, port }, ["resolveQuestion"]);
  }
});

test("B-qs-5 formatModelContent: invalid -> fixed sentence; success -> response verbatim", () => {
  assert.equal(entry.formatModelContent({}), "ResolveWorkflowQuestion returned an invalid result.");
  const response = "Answer delivered for question q. …";
  assert.equal(entry.formatModelContent({ ok: true, qid: "q", response }), response);
});

test("gate handshake: resolveQuestion held mid-call settles after open without timers", async () => {
  const held = gate();
  const { calls, port } = makePort({
    resolveQuestion: async () => {
      await held.opened;
      return { ok: true, qid: "dwfq-gate" };
    },
  });
  const pending = handler({ question_id: "dwfq-gate", answer: "yes" }, makeContext(port));
  held.open();
  const output = (await pending) as Record<string, unknown>;
  assert.equal(output.qid, "dwfq-gate");
  assertCallSequence({ calls, port }, ["resolveQuestion"]);
});
