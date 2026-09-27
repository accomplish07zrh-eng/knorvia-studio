// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { toolResultDisplayPayloadSchema } from "@knorvia/contracts";
import { createWorkflowObservationDisplay } from "../src/tool/executor/workflow-observation-display.js";
import { runSnapshot } from "./workflow-display-fixture.js";
const display = (value: unknown) => createWorkflowObservationDisplay("GetWorkflowRun", value);

test("run details keep leading actors and trailing logs without generating timestamps", () => {
  const raw = runSnapshot({
    actors: Array.from({ length: 33 }, (_, ordinal) => ({ siteId: "s", ordinal })),
    logTail: Array.from({ length: 41 }, (_, sequence) => ({
      sequence,
      message: "中".repeat(600),
      ...(sequence === 40 ? { at: 0 } : {}),
    })),
    result: "中".repeat(1500),
  });
  const result = display(raw);
  assert.ok(result?.kind === "get_workflow_run");
  assert.equal(result.actors.length, 32);
  assert.equal(result.actors.at(-1)?.ordinal, 31);
  assert.equal(result.logTail.length, 40);
  assert.equal(result.logTail[0].sequence, 1);
  assert.equal(Object.hasOwn(result.logTail[0], "at"), false);
  assert.equal(result.logTail.at(-1)?.at, 0);
  assert.equal(result.generatedAt, 10);
  assert.ok(Buffer.byteLength(result.logTail[0].message) <= 1024);
  assert.ok(Buffer.byteLength(result.result!) <= 4000);
  assert.equal(result.truncated, true);
  assert.ok(toolResultDisplayPayloadSchema.safeParse(result).success);
});

test("run detail optional fields retain empty results and omit empty phases and false interruption", () => {
  const result = display(runSnapshot({ result: "", phases: [], possiblyInterrupted: false }));
  assert.ok(result?.kind === "get_workflow_run");
  assert.equal(result.result, "");
  assert.equal(Object.hasOwn(result, "phases"), false);
  assert.equal(Object.hasOwn(result, "possiblyInterrupted"), false);
  assert.deepEqual(result.subagents, []);
  assert.equal(Object.hasOwn(result, "truncated"), false);
  const interrupted = display(
    runSnapshot({ possiblyInterrupted: true, stopReason: "interrupted", subagentsTruncated: true }),
  );
  assert.ok(
    interrupted?.kind === "get_workflow_run" &&
      interrupted.possiblyInterrupted &&
      interrupted.truncated,
  );
});

test("subagent projection retains zeros and filters wait and provider diagnostic details", () => {
  const subagent = {
    siteId: "s",
    ordinal: 0,
    name: "",
    state: "waiting" as const,
    phaseName: "",
    currentAsk: {
      siteId: "ask",
      ordinal: 7,
      actorSeq: 99,
      instructionsHead: "",
      startedAt: 0,
      turn: 0,
      toolCalls: 0,
      lastTool: { name: "Bash", target: "", at: 0 },
    },
    wait: { cause: "backoff" as const, reason: "private detail", retryAfterMs: 0, since: 0 },
    parkedOn: "",
    stepsSettled: 0,
    stepsFailed: 0,
    tokens: 0,
    lastProgressAt: 0,
  };
  const result = display(
    runSnapshot({
      subagents: [subagent],
      error: {
        code: "ProviderStop",
        message: "failed",
        providerStop: { kind: "quota", reason: "quota", rawMessage: "private" },
      },
    }),
  );
  assert.ok(result?.kind === "get_workflow_run");
  const expected = {
    siteId: "s",
    ordinal: 0,
    name: "",
    state: "waiting",
    phaseName: "",
    instructionsHead: "",
    startedAt: 0,
    turn: 0,
    toolCalls: 0,
    lastTool: { name: "Bash", target: "", at: 0 },
    waitCause: "backoff",
    retryAfterMs: 0,
    waitSince: 0,
    parkedOn: "",
    stepsSettled: 0,
    stepsFailed: 0,
    tokens: 0,
    lastProgressAt: 0,
  };
  assert.deepEqual(result.subagents, [expected]);
  assert.equal(JSON.stringify(result.subagents?.[0]), JSON.stringify(expected));
  assert.deepEqual(result.error, { code: "ProviderStop", message: "failed" });
  assert.ok(toolResultDisplayPayloadSchema.safeParse(result).success);
});

test("run output schema rejects excess roster rows before projection can slice them", () => {
  const subagent = {
    siteId: "s",
    ordinal: 0,
    state: "idle" as const,
    stepsSettled: 0,
    stepsFailed: 0,
    tokens: 0,
  };
  assert.equal(
    display(runSnapshot({ subagents: Array.from({ length: 65 }, () => subagent) })),
    undefined,
  );
  const phase = { name: "p", state: "ahead" as const, rounds: 0, nodesSettled: 0, nodesRunning: 0 };
  assert.equal(
    display(runSnapshot({ phases: Array.from({ length: 33 }, () => phase) })),
    undefined,
  );
  assert.equal(display({ ...runSnapshot(), generatedAt: undefined }), undefined);
});
