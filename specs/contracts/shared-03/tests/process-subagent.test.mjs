// SPDX-License-Identifier: Apache-2.0
// shared-03 契约测试：process/subagent 五件（behavior B37–B41）。
import assert from "node:assert/strict";
import test from "node:test";

import { loadModule } from "./entry.mjs";

const diagnostic = await loadModule("process-diagnostic");
const names = await loadModule("process-names");
const telemetry = await loadModule("processResourceTelemetry");
const markdownSelection = await loadModule("subagent-markdown-selection");
const stateMigration = await loadModule("subagent-state-migration");

test("B37 进程诊断六常量与 parse fail-safe", () => {
  assert.equal(diagnostic.KNORVIA_PROCESS_DIAGNOSTIC_PREFIX, "[knorvia-process-exception] ");
  assert.equal(diagnostic.KNORVIA_PROCESS_DIAGNOSTIC_NAME_MAX_CHARS, 128);
  assert.equal(diagnostic.KNORVIA_PROCESS_DIAGNOSTIC_MESSAGE_MAX_CHARS, 4000);
  assert.equal(diagnostic.KNORVIA_PROCESS_DIAGNOSTIC_STACK_MAX_CHARS, 16000);
  assert.equal(diagnostic.KNORVIA_PROCESS_DIAGNOSTIC_MAX_LINE_CHARS, 131072);
  assert.equal(diagnostic.KNORVIA_AGENT_LIFECYCLE_LOG_MARKER, "[agent-lifecycle-reported]");
  const line = `${diagnostic.KNORVIA_PROCESS_DIAGNOSTIC_PREFIX}${JSON.stringify({
    version: 1,
    errorId: "0b2f6a10-0000-4000-8000-000000000000",
    kind: "uncaughtException",
    origin: "uncaughtException",
    name: "Error",
    message: "boom",
    occurredAt: 1700000000000,
  })}`;
  const parsed = diagnostic.parseKnorviaProcessDiagnostic(line);
  assert.equal(parsed?.name, "Error");
  assert.equal(diagnostic.parseKnorviaProcessDiagnostic("other line"), undefined);
  assert.equal(diagnostic.parseKnorviaProcessDiagnostic(`${diagnostic.KNORVIA_PROCESS_DIAGNOSTIC_PREFIX}{bad`), undefined, "损坏帧不打断");
});

test("B38 进程命名形态", () => {
  assert.equal(names.formatKnorviaMainProcessName(), "knorvia-main");
  assert.equal(names.formatKnorviaGpuProcessName(), "knorvia-gpu");
  assert.equal(names.formatKnorviaHostProcessName("Worker 2"), "knorvia-host-worker-2");
  assert.equal(names.formatKnorviaRendererProcessName(), "knorvia-renderer-main");
  assert.equal(names.formatKnorviaRendererProcessName("Resource Manager"), "knorvia-renderer-resource-manager");
  assert.equal(
    names.formatKnorviaRendererProcessName("Knorvia Studio - Alpha"),
    "knorvia-renderer-remote-alpha",
  );
  assert.equal(names.formatKnorviaAgentProcessName("Zai", "/home/u/my ws"), "knorvia-agent-zai-my-ws");
});

test("B39 遥测角色/车道/属性检查", () => {
  assert.deepEqual(telemetry.PROCESS_RESOURCE_CLI_LANES, ["chat", "plugin", "mcp-status"]);
  assert.equal(telemetry.PROCESS_RESOURCE_ROLES.length, 10);
  assert.equal(telemetry.KNORVIA_CLI_RESOURCE_SAMPLE_INTERVAL_MS, 60000);
  assert.equal(telemetry.resolveCliProcessResourceRole(undefined), "cli_chat");
  assert.equal(telemetry.resolveCliProcessResourceRole("chat"), "cli_chat");
  assert.equal(telemetry.resolveCliProcessResourceRole("mcp-status"), "cli_aux");
  const ok = telemetry.checkProcessResourceEventProperties("perf_tool_exec_resource", {
    platform: "win32",
    tool_name: "Bash",
  });
  assert.equal(ok.ok, true);
  const bad = telemetry.checkProcessResourceEventProperties("perf_tool_exec_resource", {
    platform: "win32",
    pid: 42,
    weird: 1,
  });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.forbiddenKeys, ["pid"]);
  assert.deepEqual(bad.unknownKeys, ["pid", "weird"], "禁词同时属未知键，两清单可重叠");
});

test("B40 subagent markdown 选择解析与迁移保真", () => {
  assert.equal(markdownSelection.parseSubagentMarkdownSelection({ model: "inherit" }), undefined);
  assert.equal(markdownSelection.parseSubagentMarkdownSelection({}), undefined);
  const sel = markdownSelection.parseSubagentMarkdownSelection({
    model: "anthropic/claude-3",
    thoughtLevel: "high",
  });
  assert.equal(sel?.providerId, "anthropic");
  assert.equal(sel?.options?.reasoningLevel, "high");
  const content = '---\nmodel: anthropic/claude-3\n---\nbody';
  assert.equal(markdownSelection.migrateSubagentMarkdownProvider(content), content, "未变化逐字节原样");
  const quoted = '---\nmodel: "anthropic/claude-3" # note\n---\nx';
  assert.equal(markdownSelection.migrateSubagentMarkdownProvider(quoted), quoted);
});

test("B41 状态导入：新字段在场即权威", () => {
  const input = {
    builtInModelOverrides: { Explore: "anthropic/old" },
    builtInThoughtLevelOverrides: { Explore: "high" },
    builtInModelSelectionOverrides: {},
    pluginAgentModelSelectionOverrides: {},
  };
  const result = stateMigration.importSubagentStateSelections(input);
  assert.deepEqual(result.builtInModelSelectionOverrides, {}, "空对象也是权威值，不回退");
  const legacyOnly = stateMigration.importSubagentStateSelections({
    builtInModelOverrides: { Explore: "builtin:anthropic/claude" },
    builtInThoughtLevelOverrides: {},
  });
  assert.ok(legacyOnly.builtInModelSelectionOverrides, "旧字段才参与导入");
  // builtInNames 不导出（模块内 const）；导入行为即口径。
});
