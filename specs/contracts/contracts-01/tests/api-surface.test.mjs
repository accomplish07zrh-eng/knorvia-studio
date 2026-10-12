// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// contracts-01 契约测试：公开入口的导出面（B1 / B8 / B23 / B24）。
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

// 只通过公开入口可达的文件 → 入口映射；events 的 projection 内部文件由 ./events 的 apply/reduce 间接覆盖。
const entryFor = (file) => {
  if (file === "capabilities/index.ts") return ["capabilities"];
  if (file.startsWith("events/")) return ["events", "."];
  if (file.startsWith("compact/")) return ["compact", "."];
  if (file.startsWith("config/")) return ["config", "."];
  if (file.startsWith("hooks/")) return ["hooks", "."];
  if (file.startsWith("model/")) return ["model", "."];
  if (file.startsWith("plugins/")) return ["plugins", "."];
  return ["."];
};

const INTERNAL_EVENT_FILES = new Set([
  "events/event-reducer-helpers.ts",
  "events/session-event-journal.ts",
  "events/session-projection-ledgers.ts",
  "events/session-projection-queue.ts",
  "events/session-projection-transition.ts",
]);

test("每个公开子路径都能载入，空 capabilities 允许零导出", async () => {
  const capabilities = await load("capabilities");
  assert.equal(typeof capabilities, "object");
  assert.equal(Object.keys(capabilities).length, 0, "capabilities 目前没有导出");
  for (const subpath of [
    "",
    "commands",
    "compact",
    "config",
    "events",
    "hooks",
    "interfaces",
    "model",
    "plugins",
  ]) {
    const namespace = await load(subpath);
    assert.ok(Object.keys(namespace).length > 0, `@knorvia/contracts/${subpath} 应有导出`);
  }
});

test("interface.md 列出的运行时导出都能从公开入口取到", async () => {
  const files = parseInterface();
  const cache = new Map();
  const namespaceFor = async (key) => {
    if (!cache.has(key)) cache.set(key, await load(key === "." ? "" : key));
    return cache.get(key);
  };
  let checkedFiles = 0;
  for (const [file, entries] of files) {
    if (INTERNAL_EVENT_FILES.has(file)) continue;
    const namespaces = await Promise.all(entryFor(file).map(namespaceFor));
    const runtimeEntries = entries.filter((entry) => RUNTIME_KINDS.test(entry.kinds));
    for (const entry of runtimeEntries) {
      assert.ok(
        namespaces.some((namespace) => entry.name in namespace),
        `${file} 的运行时导出 ${entry.name} 未出现在公开入口`,
      );
    }
    checkedFiles += 1;
  }
  assert.ok(checkedFiles > 40, `应覆盖绝大多数范围文件，实际 ${checkedFiles}`);
});

test("事件投影内部文件通过 ./events 的 reduce/apply 间接可达", async () => {
  const events = await load("events");
  assert.equal(typeof events.reduce, "function");
  assert.equal(typeof events.apply, "function");
  assert.equal(typeof events.EventReducer, "function");
  const projection = events.reduce([]);
  assert.equal(projection.mode, "build");
  assert.equal(projection.status, "idle");
});

test("包根入口覆盖 logging / network / path / interfaces-shared / model 媒体策略", async () => {
  const root = await load();
  for (const name of [
    "LogLevel",
    "LogLevelName",
    "getPublicEgressIpBlockReason",
    "normalizeIpAddressLiteral",
    "getIpAddressVersion",
    "windowsPathToGitBashPath",
    "gitBashPathToWindowsPath",
    "createSessionId",
    "createTraceId",
    "isProviderVisibleModelInputMediaBlock",
    "getUnsupportedModelInputMediaKind",
    "createUnsupportedModelInputMediaText",
  ]) {
    assert.ok(name in root, `包根入口缺少 ${name}`);
  }
  const logger = await loadFile("logging/logger");
  assert.equal(logger.LogLevel.Debug, 0);
  const egress = await loadFile("network/public-egress-ip");
  assert.equal(egress.getIpAddressVersion("127.0.0.1"), 4);
  const gitBash = await loadFile("path/git-bash");
  assert.equal(gitBash.windowsPathToGitBashPath("C:\\tmp"), "/c/tmp");
});
