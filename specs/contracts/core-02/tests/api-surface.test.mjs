// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// core-02 契约测试：公开入口的导出面（B1）。
// 断言依据 interface.md：每个范围内模块列出的运行时导出名必须能从该模块取到。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { loadArea, loadModule } from "./entry.mjs";

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

// 只有这些声明种类会产生运行时可取的名字；纯类型条目只参与声明模式剔除。
const RUNTIME_KINDS =
  /VariableDeclaration|FunctionDeclaration|ClassDeclaration|EnumDeclaration|ExportSpecifier/u;

test("interface.md 覆盖 58 个模块且条目数与声明种类齐全", async () => {
  const files = parseInterface();
  assert.equal(files.size, 58);
  const accepted = new Set([
    "VariableDeclaration",
    "FunctionDeclaration",
    "ClassDeclaration",
    "EnumDeclaration",
    "InterfaceDeclaration",
    "TypeAliasDeclaration",
  ]);
  let entries = 0;
  for (const [modulePath, list] of files) {
    assert.match(modulePath, /\.ts$/u, modulePath);
    for (const entry of list) {
      entries += 1;
      assert.ok(
        accepted.has(entry.kinds),
        `${modulePath}: ${entry.name} 的种类 ${entry.kinds} 未知`,
      );
    }
  }
  assert.ok(entries >= 287, `条目数 ${entries} 少于生成时的 287`);
  // 顺带确认入口解析确实指向真实实现：桩替换验证要求本文件也必须失败。
  const probe = await loadModule("session-context/utils");
  assert.equal(typeof probe.truncateText, "function");
});

test("每个模块列出的运行时名字都能从该模块取到", async () => {
  const files = parseInterface();
  const failures = [];
  for (const [modulePath, list] of files) {
    const relative = modulePath.replace(/\.ts$/u, "");
    let module;
    try {
      module = await loadModule(relative);
    } catch (error) {
      failures.push(`${modulePath}: 载入失败 ${String(error && error.message).slice(0, 120)}`);
      continue;
    }
    for (const entry of list) {
      if (!RUNTIME_KINDS.test(entry.kinds)) continue;
      if (typeof module[entry.name] === "undefined") {
        failures.push(`${modulePath}: 运行时缺少 ${entry.name} (${entry.kinds})`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test("区域桶都能载入并导出该区域的代表性名字", async () => {
  const permission = await loadArea("permission");
  assert.equal(typeof permission.createDenyPermissionBroker, "function");
  assert.equal(typeof permission.createManualPermissionBroker, "function");
  assert.equal(typeof permission.PermissionService, "function");

  const pluginReference = await loadArea("pluginReference");
  assert.equal(typeof pluginReference.extractPluginReferences, "function");
  assert.equal(typeof pluginReference.buildPluginReferenceCatalog, "function");
  assert.equal(typeof pluginReference.buildPluginReferenceReminderBody, "function");
  assert.equal(pluginReference.MAX_PLUGIN_REFERENCES_PER_TURN, 8);

  const runtimeTask = await loadArea("runtimeTask");
  assert.equal(typeof runtimeTask.InMemoryRuntimeTaskRegistry, "function");
  assert.equal(typeof runtimeTask.formatTaskNotification, "function");
  assert.equal(typeof runtimeTask.hasRunningBackgroundRuntimeTask, "function");

  const recall = await loadArea("memoryRecall");
  assert.equal(typeof recall.scanMemoryManifest, "function");
  assert.equal(typeof recall.formatMemoryManifest, "function");
});

test("subagent 区的模块与再导出桶都可用", async () => {
  const toolPolicy = await loadModule("subagent/tool-policy");
  assert.equal(typeof toolPolicy.buildSubagentChildDisallowRules, "function");
  assert.equal(typeof toolPolicy.filterSubagentChildToolNames, "function");

  const origin = await loadModule("subagent/interaction-origin");
  assert.equal(typeof origin.buildSubagentInteractionOrigin, "function");

  const generalPurpose = await loadModule("subagent/general-purpose");
  assert.equal(generalPurpose.GENERAL_PURPOSE_AGENT_TYPE, "general-purpose");
  assert.equal(typeof generalPurpose.buildGeneralPurposeSystemPrompt, "function");

  const reExport = await loadModule("subagent/runtime-task-registry");
  assert.equal(typeof reExport.InMemoryRuntimeTaskRegistry, "function");
});
