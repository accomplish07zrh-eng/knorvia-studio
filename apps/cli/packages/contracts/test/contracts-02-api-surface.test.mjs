// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// contracts-02 契约测试：公开入口的导出面（B1）。
// 断言依据 interface.md：每个范围内文件列出的运行时可导出名必须能从对应公开入口取到。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { load, loadFile } from "./entry.mjs";

const interfaceText = readFileSync(
  fileURLToPath(new URL("../interface.md", import.meta.url)),
  "utf8",
);

function parseInterface() {
  const files = new Map();
  let current = null;
  for (const line of interfaceText.split("\n")) {
    const header = /^### `([^`]+)`$/u.exec(line);
    if (header) {
      current = header[1];
      files.set(current, []);
      continue;
    }
    const entry = /^- `([^`]+)` \(([^)]+)\)/u.exec(line);
    if (entry && current) files.get(current).push({ name: entry[1], kinds: entry[2] });
  }
  return files;
}

const RUNTIME_KINDS = /VariableDeclaration|FunctionDeclaration|ClassDeclaration|EnumDeclaration/u;

// 公开入口映射：tools/workflow/rewind 各有子路径 barrel，tracing 经包根入口；
// 单文件子路径（tools/websearch）用 loadFile。
const entryFor = (file) => {
  if (file === "tools/websearch.ts") return ["file:tools/websearch", "subpath:tools", "subpath:"];
  if (file.startsWith("tools/")) return ["subpath:tools", "subpath:"];
  if (file.startsWith("workflow/")) return ["subpath:workflow", "subpath:"];
  if (file.startsWith("rewind/")) return ["subpath:rewind", "subpath:"];
  if (file.startsWith("tracing/")) return ["subpath:"];
  return ["subpath:"];
};

// 包内私有模块（不经任何公开入口导出）：由行为条目经公开路径间接覆盖，不在此断言导出面。
const INTERNAL_FILES = new Set(["tracing/span-residence.ts"]);

test("每个公开子路径都能载入并导出 interface.md 列出的运行时名字", async () => {
  const files = parseInterface();
  const cache = new Map();
  const namespaceFor = async (key) => {
    if (!cache.has(key)) {
      const [kind, value] = key.split(":");
      cache.set(key, kind === "file" ? await loadFile(value) : await load(value));
    }
    return cache.get(key);
  };
  const uncovered = [];
  let checked = 0;
  for (const [file, entries] of files) {
    if (INTERNAL_FILES.has(file)) continue;
    const namespaces = await Promise.all(entryFor(file).map(namespaceFor));
    const runtimeEntries = entries.filter((entry) => RUNTIME_KINDS.test(entry.kinds));
    const missing = runtimeEntries
      .map((entry) => entry.name)
      .filter((name) => !namespaces.some((namespace) => name in namespace));
    checked += 1;
    if (missing.length > 0)
      uncovered.push({ file, missing: missing.slice(0, 6), total: missing.length });
  }
  assert.deepEqual(
    uncovered,
    [],
    `以下文件的运行时导出未出现在公开入口：${JSON.stringify(uncovered)}`,
  );
  assert.ok(checked >= 50, `应覆盖绝大多数范围文件，实际 ${checked}`);
});

test("包根入口覆盖本包四个区的关键导出", async () => {
  const root = await load();
  for (const name of [
    "READ_DEFAULT_MAX_LINES",
    "READ_MAX_OUTPUT_TOKENS",
    "parseReadPdfPageRange",
    "getReadPdfPagesValidationFailure",
    "ReadErrorCode",
    "GoalStatus",
    "GoalStatusSchema",
    "SessionGoalSchema",
    "CREATE_WORKFLOW_TOOL_NAME",
    "CreateWorkflowInputSchema",
    "WorkflowStrategySchema",
    "ExpertWorkflowStrategySchema",
    "RewindScope",
    "RewindStrategy",
    "RewindTargetStatus",
    "evaluateRewindTarget",
    "selectActiveConversationBranch",
    "createTracer",
    "createRootTraceContext",
    "createChildTraceContext",
    "createSpan",
    "runWithContext",
    "traceContextToLogContext",
  ]) {
    assert.ok(name in root, `包根入口缺少 ${name}`);
  }
  const tools = await load("tools");
  assert.equal(tools.CREATE_WORKFLOW_TOOL_NAME, "CreateWorkflow");
  const websearch = await loadFile("tools/websearch");
  assert.ok(Object.keys(websearch).length > 0);
});
