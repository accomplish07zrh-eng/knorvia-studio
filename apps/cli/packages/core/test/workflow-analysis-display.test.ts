// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { toolResultDisplayPayloadSchema } from "@knorvia/contracts";
import { createCreateWorkflowDisplay } from "../src/tool/executor/create-workflow-display.js";
import { createWorkflowObservationDisplay } from "../src/tool/executor/workflow-observation-display.js";
import { createToolResultDisplay } from "../src/tool/executor/result-display.js";
import { diagnostic, graph } from "./workflow-display-fixture.js";

test("workflow routes preserve exact names, full validation and candidate fallbacks", () => {
  const failure = new Error("fixture getter");
  const raw = {
    ok: true,
    diagnostics: [],
    get response(): string {
      throw failure;
    },
  };
  assert.equal(createCreateWorkflowDisplay("createworkflow", raw), undefined);
  assert.equal(createWorkflowObservationDisplay("constructor", raw), undefined);
  assert.throws(
    () => createCreateWorkflowDisplay("CreateWorkflow", raw),
    (e) => e === failure,
  );
  assert.equal(
    createCreateWorkflowDisplay("CreateWorkflow", { ok: true, diagnostics: [] }),
    undefined,
  );
  const output = {
    ok: true,
    diagnostics: [],
    response: "created",
    status: "backgrounded",
    backgroundTaskId: "t",
  };
  const mcp = { serverName: "s", toolName: "t" };
  assert.equal(createToolResultDisplay("AmendWorkflow", output, { mcp })?.kind, "create_workflow");
  assert.equal(
    createToolResultDisplay("CreateWorkflow", { ...output, extra: true }, { mcp })?.kind,
    "mcp_tool",
  );
  assert.equal(
    createCreateWorkflowDisplay("CreateWorkflow", { ...output, backgroundTaskId: "" }),
    undefined,
  );
});

test("creation and amendment retain diagnostic character policy and a separate graph truncation flag", () => {
  const output = {
    ok: false,
    response: "failed",
    causalityGraph: graph,
    diagnostics: [diagnostic("x".repeat(2047) + "😀")],
  };
  const actual = createCreateWorkflowDisplay("CreateWorkflow", output);
  assert.deepEqual(actual, {
    kind: "create_workflow",
    ok: false,
    errorCount: 1,
    diagnostics: [diagnostic("x".repeat(2047) + "\ud83d")],
    causalityGraph: graph,
  });
  assert.deepEqual(createCreateWorkflowDisplay("AmendWorkflow", output), actual);
  assert.ok(toolResultDisplayPayloadSchema.safeParse(actual).success);
  const many = createCreateWorkflowDisplay("CreateWorkflow", {
    ...output,
    diagnostics: Array.from({ length: 101 }, () => diagnostic()),
  });
  assert.ok(
    many?.kind === "create_workflow" &&
      many.errorCount === 101 &&
      many.diagnostics.length === 100 &&
      many.truncated,
  );
  const exact = createCreateWorkflowDisplay("CreateWorkflow", {
    ...output,
    diagnostics: Array.from({ length: 100 }, () => diagnostic()),
  });
  assert.ok(exact?.kind === "create_workflow" && exact.truncated === undefined);
});

test("snippet logs keep the latest entries and use byte budgets independently of diagnostic characters", () => {
  const raw = {
    ok: true,
    diagnostics: [],
    logs: Array.from({ length: 41 }, (_, n) => `log${n}`),
    response: "中".repeat(1500),
    durationMs: 0,
  };
  const result = createWorkflowObservationDisplay("EvalWorkflowSnippet", raw);
  assert.ok(result?.kind === "eval_workflow_snippet");
  assert.equal(result.logs.length, 40);
  assert.equal(result.logs[0], "log1");
  assert.equal(result.logs.at(-1), "log40");
  assert.ok(Buffer.byteLength(result.response) <= 4000);
  assert.equal(result.durationMs, 0);
  assert.equal(result.truncated, true);
  assert.ok(toolResultDisplayPayloadSchema.safeParse(result).success);
  const longLog = createWorkflowObservationDisplay("EvalWorkflowSnippet", {
    ...raw,
    response: "",
    logs: ["中".repeat(600)],
  });
  assert.ok(
    longLog?.kind === "eval_workflow_snippet" &&
      longLog.truncated &&
      Buffer.byteLength(longLog.logs[0]) <= 1024,
  );
  assert.equal(
    createWorkflowObservationDisplay("EvalWorkflowSnippet", { ...raw, logs: ["x".repeat(2049)] }),
    undefined,
  );
});

test("snippet diagnostic-only shortening does not set the shared truncated flag", () => {
  const result = createWorkflowObservationDisplay("EvalWorkflowSnippet", {
    ok: false,
    diagnostics: [diagnostic("x".repeat(2050))],
    logs: [],
    response: "",
    durationMs: 1,
  });
  assert.ok(result?.kind === "eval_workflow_snippet" && result.truncated === undefined);
  assert.equal(result.diagnostics[0].message.length, 2048);
});

test("resume validates hidden fields but projects only the run identity", () => {
  const output = {
    ok: true,
    runId: "run-a",
    response: "resume",
    status: "backgrounded",
    backgroundTaskId: "task-b",
  };
  assert.deepEqual(createWorkflowObservationDisplay("ResumeWorkflowRun", output), {
    kind: "resume_workflow_run",
    runId: "run-a",
  });
  assert.equal(
    createWorkflowObservationDisplay("ResumeWorkflowRun", { ...output, response: undefined }),
    undefined,
  );
  assert.equal(
    createWorkflowObservationDisplay("ResumeWorkflowRun", { ...output, ok: false }),
    undefined,
  );
  assert.equal(createWorkflowObservationDisplay("resumeworkflowrun", output), undefined);
});
