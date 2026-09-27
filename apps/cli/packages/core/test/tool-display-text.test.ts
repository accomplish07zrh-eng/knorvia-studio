// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { toolResultDisplayPayloadSchema } from "@knorvia/contracts";
import {
  createMcpToolDisplay,
  createToolResultDisplay,
} from "../src/tool/executor/result-display.js";
import { createBashResultDisplay } from "../src/tool/executor/bash-result-display.js";
import { boundDisplayText } from "../src/tool/executor/display-text.js";

const mcp = { serverName: "fixture", toolName: "action" };
const hunk = (lines: string[]) => ({ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines });
const patch = { filePath: "fixture.txt", structuredPatch: [hunk(["+new", "-old", " same"])] };
const bash = (options: Record<string, unknown> = {}) => ({
  stdout: "out",
  stderr: "err",
  interrupted: false,
  ...options,
});

test("display dispatch preserves terminal routes, candidate fallback and MCP priority", () => {
  assert.equal(createToolResultDisplay("Bash", patch, { mcp }), undefined);
  assert.equal(createToolResultDisplay("mcp__COMPUTER-USE__click", null, { mcp })?.kind, "cua");
  assert.equal(createToolResultDisplay("js", patch, { mcp })?.kind, "mcp_tool");
  assert.equal(createToolResultDisplay("js", patch)?.kind, "file_diff");
  assert.equal(createToolResultDisplay("SendMessage", patch), undefined);
  assert.equal(createToolResultDisplay("TaskStop", patch), undefined);
  assert.equal(createToolResultDisplay("TaskOutput", patch), undefined);
  assert.equal(createToolResultDisplay("RespondToCoordinator", patch), undefined);
  assert.equal(
    createToolResultDisplay("Other", patch, { mcp: { serverName: " ", toolName: "x" } }),
    undefined,
  );
  assert.equal(createToolResultDisplay("constructor", patch)?.kind, "file_diff");
  const created = createToolResultDisplay(
    "CreateWorkflow",
    { ok: true, diagnostics: [], response: "created" },
    { mcp },
  );
  assert.equal(created?.kind, "create_workflow");
  assert.equal(createToolResultDisplay("CreateWorkflow", patch, { mcp })?.kind, "mcp_tool");
});

test("MCP names and descriptions are trimmed and avoid a trailing high surrogate", () => {
  assert.equal(createMcpToolDisplay(undefined), undefined);
  assert.deepEqual(
    createMcpToolDisplay({ serverName: " s ", toolName: "t\ud800", description: "  " }),
    { kind: "mcp_tool", serverName: "s", toolName: "t" },
  );
  const actual = createMcpToolDisplay({
    serverName: "a".repeat(255) + "😀",
    toolName: " x ",
    description: "a".repeat(4095) + "😀",
  });
  assert.deepEqual(actual, {
    kind: "mcp_tool",
    serverName: "a".repeat(255),
    toolName: "x",
    description: "a".repeat(4095),
  });
  assert.ok(toolResultDisplayPayloadSchema.safeParse(actual).success);
  assert.throws(
    () => createMcpToolDisplay({ serverName: null as unknown as string, toolName: "x" }),
    TypeError,
  );
});

test("MCP unavailable status requires the explicit source flag and a structured error code", () => {
  const output = {
    isError: true,
    content: [
      { type: "text", text: "quota_exceeded" },
      { type: "text", text: '{"error_code":"quota_exceeded"}' },
      { type: "text", text: '{"error_code":"coding_plan_required"}' },
    ],
  };
  const regular = createMcpToolDisplay(mcp, output);
  assert.deepEqual(regular, { kind: "mcp_tool", ...mcp });
  assert.deepEqual(createMcpToolDisplay({ ...mcp, official: true }, output), {
    ...regular,
    unavailable: { code: "quota_exceeded" },
  });
  for (const value of [
    { ...output, isError: "true" },
    { isError: true, content: [{ type: "text", text: '{"error_code":"other"}' }] },
  ]) {
    assert.deepEqual(createMcpToolDisplay({ ...mcp, official: true }, value), regular);
  }
});

test("display text uses UTF-8 but retains the complete truncation marker at tiny budgets", () => {
  const suffix = "\n...[truncated]";
  assert.deepEqual(boundDisplayText("中😀", 7), { value: "中😀", truncated: false });
  assert.deepEqual(boundDisplayText("a中😀".repeat(8), Buffer.byteLength(suffix) + 4), {
    value: "a中" + suffix,
    truncated: true,
  });
  for (const max of [0, -1, NaN])
    assert.deepEqual(boundDisplayText("x", max), { value: suffix, truncated: true });
  assert.equal(boundDisplayText("\ud800", 3).value, "\ud800");
});

test("Bash only produces a text card for truncated or saved non-background output", () => {
  for (const output of [
    undefined,
    bash(),
    bash({ status: "backgrounded", stdoutTruncated: true }),
    bash({ isImage: true, rawOutputPath: "p" }),
    bash({ structuredContent: [{}], rawOutputPath: "p" }),
    bash({ unexpected: true }),
  ])
    assert.equal(createBashResultDisplay(output), undefined);
  assert.deepEqual(
    createBashResultDisplay(bash({ persistedOutputPath: "saved", rawOutputPath: "raw" })),
    { kind: "bash_output", output: "out\nerr", truncated: false, outputPath: "saved" },
  );
  assert.equal(
    createBashResultDisplay(bash({ persistedOutputPath: "", rawOutputPath: "raw" })),
    undefined,
  );
  assert.deepEqual(
    createBashResultDisplay(bash({ stdout: "", stderr: "error", stdoutTruncated: true })),
    { kind: "bash_output", output: "error", truncated: true },
  );
});

test("Bash byte-limited decoding preserves BOM and malformed UTF-16 conversion behavior", () => {
  const leading = "\ufeff\ud800" + "a".repeat(149_993);
  const actual = createBashResultDisplay(
    bash({ stdout: leading + "😀tail", stderr: "", stdoutTruncated: true }),
  );
  assert.equal(actual?.kind, "bash_output");
  if (actual?.kind !== "bash_output") assert.fail("Bash display missing");
  assert.equal(actual.output, "\ufffd" + "a".repeat(149_993));
  assert.equal(actual.truncated, true);
  assert.ok(toolResultDisplayPayloadSchema.safeParse(actual).success);
  const exact = createBashResultDisplay(
    bash({ stdout: "a".repeat(150_000), stderr: "", rawOutputPath: "p" }),
  );
  assert.equal(exact?.kind === "bash_output" && exact.truncated, false);
});

test("SendMessage and coordinator projection use strict output contracts and retain optional empty strings", () => {
  assert.deepEqual(
    createToolResultDisplay("SendMessage", {
      status: "failed",
      messageId: "m",
      error: "",
      message: "",
    }),
    { kind: "local_agent_message", status: "failed", error: "", message: "" },
  );
  const output = createToolResultDisplay("SendMessage", {
    status: "success",
    messageId: "m",
    message: "中".repeat(2000),
  });
  assert.ok(output?.kind === "local_agent_message" && Buffer.byteLength(output.message!) <= 4096);
  assert.equal(
    createToolResultDisplay("SendMessage", { status: "success", messageId: "m", unrelated: 1 }),
    undefined,
  );
  const coordinator = createToolResultDisplay("RespondToCoordinator", {
    status: "success",
    responseId: "r",
    message: "raw",
  });
  assert.deepEqual(coordinator, { kind: "respond_to_coordinator", status: "success" });
});

test("TaskStop removes only an exact duplicate command message and bounds both fields", () => {
  const raw = {
    task_id: "task",
    task_type: "bash",
    command: "run x",
    message: "Successfully stopped task: task (run x)",
  };
  assert.deepEqual(createToolResultDisplay("TaskStop", raw), {
    kind: "task_stop",
    taskId: "task",
    taskType: "bash",
    command: "run x",
    message: "Successfully stopped task: task",
  });
  assert.equal(
    createToolResultDisplay("TaskStop", { ...raw, message: raw.message + "!" })?.kind,
    "task_stop",
  );
  const large = createToolResultDisplay("TaskStop", {
    ...raw,
    command: "中".repeat(6000),
    message: "message",
  });
  assert.ok(
    large?.kind === "task_stop" && large.truncated && Buffer.byteLength(large.command!) <= 16384,
  );
  assert.deepEqual(
    createToolResultDisplay("TaskStop", { task_id: "t", task_type: "agent", message: "" }),
    { kind: "task_stop", taskId: "t", taskType: "agent", message: "" },
  );
});

test("TaskOutput trims only the end of output, uses character budgets and omits blank fields", () => {
  assert.deepEqual(
    createToolResultDisplay("TaskOutput", { retrieval_status: "timeout", task: null }),
    { kind: "task_output", retrievalStatus: "timeout" },
  );
  const task = {
    task_id: "t",
    task_type: "bash",
    status: " running ",
    description: "d",
    output: "  result \n",
  };
  assert.deepEqual(createToolResultDisplay("TaskOutput", { retrieval_status: "success", task }), {
    kind: "task_output",
    retrievalStatus: "success",
    taskStatus: "running",
    output: "  result",
  });
  assert.deepEqual(
    createToolResultDisplay("TaskOutput", {
      retrieval_status: "not_ready",
      task: { ...task, status: " ", output: "\n " },
    }),
    { kind: "task_output", retrievalStatus: "not_ready" },
  );
  const large = createToolResultDisplay("TaskOutput", {
    retrieval_status: "success",
    task: { ...task, output: "a".repeat(1999) + "😀" },
  });
  assert.ok(large?.kind === "task_output" && large.output?.endsWith("\ud83d") && large.truncated);
});

test("file diff counts the whole accepted patch before limiting hunks and lines", () => {
  const lines = Array.from({ length: 161 }, (_, i) => (i % 2 ? "-old" : "+new"));
  const first = { ...hunk(lines), extra: "keep" };
  const input = { filePath: "f", structuredPatch: [null, first, hunk(["+later"])] };
  const display = createToolResultDisplay("Edit", input);
  assert.ok(display?.kind === "file_diff");
  assert.equal(display.additions, 82);
  assert.equal(display.deletions, 80);
  assert.equal(display.structuredPatch.length, 1);
  assert.equal(display.structuredPatch[0].lines.length, 160);
  assert.equal((display.structuredPatch[0] as unknown as { extra: string }).extra, "keep");
  assert.equal(display.structuredPatch[0].oldLines, 1);
  assert.notEqual(display.structuredPatch[0].lines, lines);
  assert.equal(display.truncated, true);
  assert.equal(lines.length, 161);
  assert.equal(
    createToolResultDisplay("Edit", {
      filePath: "f",
      structuredPatch: [hunk(Array(160).fill(" same"))],
    })?.kind,
    "file_diff",
  );
});

test("file diff exact boundaries, empty hunks and numeric compatibility remain distinct from persistence validation", () => {
  const exact = createToolResultDisplay("Edit", {
    filePath: "f",
    structuredPatch: [hunk(Array(160).fill(" same"))],
  });
  assert.ok(exact?.kind === "file_diff" && exact.truncated === false);
  assert.ok(toolResultDisplayPayloadSchema.safeParse(exact).success);
  const more = createToolResultDisplay("Edit", {
    filePath: "f",
    structuredPatch: [hunk(Array(160).fill(" same")), hunk([])],
  });
  assert.ok(more?.kind === "file_diff" && more.truncated);
  const empty = createToolResultDisplay("Edit", {
    filePath: "",
    structuredPatch: Array.from({ length: 9 }, () => hunk([])),
  });
  assert.ok(empty?.kind === "file_diff" && empty.structuredPatch.length === 8 && empty.truncated);
  const nonfinite = createToolResultDisplay("Edit", {
    filePath: "f",
    structuredPatch: [{ ...hunk(["\\ No newline", "+++a", "---b"]), oldStart: NaN }],
  });
  assert.ok(nonfinite?.kind === "file_diff" && Number.isNaN(nonfinite.structuredPatch[0].oldStart));
  assert.equal(nonfinite.additions, 1);
  assert.equal(nonfinite.deletions, 1);
  const sparse: string[] = [];
  sparse.length = 1;
  assert.throws(
    () =>
      createToolResultDisplay("Edit", {
        filePath: "f",
        structuredPatch: [hunk(sparse)],
      }),
    TypeError,
  );
});

test("diff shallow-copy side effects do not mistake shortened input for discarded display lines", () => {
  const lines = ["+first", "+second"];
  const first = {
    ...hunk(lines),
    get extra() {
      lines.pop();
      return "evaluated";
    },
  };
  const result = createToolResultDisplay("Edit", {
    filePath: "f",
    structuredPatch: [first, hunk(["+third"])],
  });
  assert.ok(result?.kind === "file_diff");
  assert.equal(result.additions, 3);
  assert.equal(result.structuredPatch.length, 2);
  assert.deepEqual(result.structuredPatch[0].lines, ["+first", "+second"]);
  assert.equal(result.truncated, false);
  assert.deepEqual(lines, ["+first"]);
});
