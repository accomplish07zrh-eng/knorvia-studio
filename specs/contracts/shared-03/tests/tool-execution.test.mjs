// SPDX-License-Identifier: Apache-2.0
// shared-03 契约测试：tool/execution 八件（behavior B30–B36）。
import assert from "node:assert/strict";
import test from "node:test";

import { loadModule } from "./entry.mjs";

const outPreview = await loadModule("execution-output-preview");
const state = await loadModule("execution-state");
const runtime = await loadModule("runtime-tool-runtime");
const identity = await loadModule("tool-identity");
const summary = await loadModule("tool-call-summary");
const streaming = await loadModule("streaming-tool-input-preview");
const planAdapter = await loadModule("tool-plan-adapter");
const permission = await loadModule("permission-request-preview");

test("B30 输出预览 schema strict 边界", () => {
  const ok = outPreview.executionOutputPreviewSchema.safeParse({
    text: "x",
    fullText: "x",
    totalLines: 1,
    totalBytes: 1,
    linesEstimated: false,
  });
  assert.equal(ok.success, true);
  const bad = outPreview.executionOutputPreviewSchema.safeParse({
    text: "x",
    fullText: "x",
    totalLines: 1,
    totalBytes: 1,
    linesEstimated: false,
    extra: true,
  });
  assert.equal(bad.success, false);
});

test("B31 执行状态：接纳边界固定旧语义", () => {
  assert.deepEqual(state.resolveExecutionState({ mode: "plan" }), {
    mode: "build",
    planEnabled: true,
  });
  assert.deepEqual(state.resolveExecutionState({ mode: "yolo" }), {
    mode: "yolo",
    planEnabled: false,
  });
  assert.deepEqual(state.resolveExecutionState({ mode: "unknown" }, { mode: "edit", planEnabled: true }), {
    mode: "edit",
    planEnabled: true,
  });
  assert.deepEqual(state.resolveExecutionState({}, { mode: "yolo", planEnabled: false }), {
    mode: "yolo",
    planEnabled: false,
  });
  assert.deepEqual([...state.executionPermissionModeSchema.options], ["build", "edit", "yolo", "auto"]);
});

test("B32 运行时工具表逐字冻结", () => {
  assert.deepEqual(runtime.RUNTIME_TOOL_RUNTIME.bfs, {
    binaryEnvVar: "KNORVIA_BFS_BINARY",
    bundledResourceDir: "bfs",
    resolveEntrySegments: runtime.RUNTIME_TOOL_RUNTIME.bfs.resolveEntrySegments,
  });
  assert.deepEqual(runtime.RUNTIME_TOOL_RUNTIME.bfs.resolveEntrySegments("win32"), ["bfs.exe"]);
  assert.deepEqual(runtime.RUNTIME_TOOL_RUNTIME.ripgrep.resolveEntrySegments("linux"), ["rg"]);
  const linux = runtime.getRemoteRuntimeToolsForPlatform("linux").map((t) => t.toolId);
  assert.deepEqual(linux, ["bfs", "ripgrep", "ugrep"]);
  const darwin = runtime.getRemoteRuntimeToolsForPlatform("darwin").map((t) => t.toolId);
  assert.deepEqual(darwin, ["ripgrep"], "Darwin 只有 legacy rg13");
  assert.equal(runtime.getRemoteRuntimeToolsForPlatform("linux")[1].version, "v14.1.1-1");
});

test("B33 工具身份 32 项与 family 映射", () => {
  assert.equal(identity.KNORVIA_KNOWN_TOOL_NAMES.length, 31);
  assert.equal(identity.normalizeKnorviaToolName(" bash "), "Bash");
  assert.equal(identity.normalizeKnorviaToolName("submit_result"), "submit_result");
  assert.equal(identity.normalizeKnorviaToolName("unknown_tool"), null);
  assert.equal(identity.getKnorviaToolFamilyForName("mcp__node_repl__js"), "node-repl");
  assert.equal(identity.getKnorviaToolFamilyForName("AmendWorkflow"), "workflow");
  assert.equal(identity.isKnorviaToolFamily("Edit", "file-write"), true);
  assert.equal(identity.isKnorviaFileContentWriteToolName("Write"), true);
  assert.equal(identity.isKnorviaFileContentWriteToolName("Edit"), false);
});

test("B34 摘要与变更行计数", () => {
  const s = summary.getCompactToolCallSummary({
    title: "Edit file",
    kind: "edit",
    input: { file_path: "/a", old_string: "x\ny", new_string: "x\ny\nz" },
  });
  assert.equal(s.primaryText, "Edit file");
  assert.ok(s.changeStat, "edit 形态给出变更统计");
  assert.equal(s.changeStat.removed, 2);
  assert.equal(s.changeStat.added, 3);
  const none = summary.getCompactToolCallSummary({ title: "Read", kind: "read", input: { file_path: "/a" } });
  assert.equal(none.changeStat, undefined);
  const plain = summary.getCompactToolCallSummary({ kind: "bash", input: "just text" });
  assert.equal(plain.primaryText, "tool");
});

test("B35 流式预览：部分字段解析与节流常量", () => {
  assert.equal(streaming.KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_EAGER_DELTA_COUNT, 1);
  assert.equal(streaming.KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_PREVIEW_MIN_INTERVAL_MS, 750);
  assert.equal(streaming.KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_PREVIEW_MIN_RAW_GROWTH, 8 * 1024);
  assert.equal(streaming.KNORVIA_FILE_STREAMING_TOOL_INPUT_PREVIEW_MIN_INTERVAL_MS, 1000);
  const preview = streaming.buildKnorviaStreamingToolInputPreview('{"file_path": "/a/b.ts", "content": "x');
  assert.equal(preview.complete, false);
  assert.equal(preview.input.file_path, "/a/b.ts", "未闭合串也能出预览");
  const complete = streaming.buildKnorviaStreamingToolInputPreview('{"a":1}');
  assert.equal(complete.complete, true);
  const state0 = streaming.appendKnorviaStreamingToolInputDelta(undefined, "{");
  assert.equal(state0.rawInput, "{");
  assert.equal(state0.deltaCount, 1);
  assert.equal(streaming.isKnorviaFileStreamingToolInputPreviewTool("Write"), true);
  assert.equal(
    streaming.shouldMaterializeKnorviaStreamingToolInputPreview(
      { rawInput: "{", deltaCount: 1 },
      { mode: "active-live" },
    ),
    true,
    "前 1 个 delta 立即物化",
  );
  assert.equal(
    streaming.shouldMaterializeKnorviaStreamingToolInputPreview(
      { rawInput: "{", deltaCount: 5, lastPreviewAt: 1000 },
      { mode: "background-summary" },
    ),
    false,
  );
});

test("B36 权限预览：scope 三值与单条 fileChange", () => {
  const p1 = permission.getPermissionRequestPreview({
    title: "Run",
    kind: "bash",
    raw: { command: "rm -rf x" },
  });
  assert.equal(p1.scope, "command");
  assert.equal(p1.command, "rm -rf x");
  const p2 = permission.getPermissionRequestPreview({
    kind: "edit",
    raw: { input: { path: "/a.txt", content: "new", state: "active" } },
  });
  assert.equal(p2.scope, "file");
  assert.ok(p2.filePaths.includes("/a.txt"));
  assert.equal(p2.fileChange?.path ?? p2.fileChange, p2.fileChange, "单条导出");
  const p3 = permission.getPermissionRequestPreview({ kind: "x", raw: { foo: 1 } });
  assert.equal(p3.scope, "generic");
  assert.equal(p3.title, "x", "kind 回退即标题值");
});
