// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// contracts-03 契约测试：公开入口的导出面（B1）。
// 断言依据 interface.md：每个范围内文件列出的运行时可导出名必须能从对应公开入口取到；
// 包根 `index.ts` 是纯再导出桶，逐个模块路径都要能载入且命名空间非空。
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

// interface.md 的「种类」在运行时的对应形态：名字存在还不够，形态也要对，否则空壳也能通过。
const EXPECTED_TYPEOF = {
  TELEMETRY_SCHEMA_VERSION: "number",
  AgentTelemetryOperation: "object",
  ModelApiOperation: "object",
  ModelApiActorKind: "object",
  ModelFailureExceptionKind: "object",
  mapModelApiOperationToAgentOperation: "function",
  resolveModelApiCallObservation: "function",
  formatLocalIsoDate: "function",
};

// 公开入口映射：skills 与 telemetry 有独立子路径，time/local-date.ts 与
// telemetry/agent-execution.ts 经包根与 ./telemetry 再导出。
const entryFor = (file) => {
  if (file === "index.ts") return ["subpath:"];
  if (file.startsWith("skills/")) return ["subpath:skills", "subpath:"];
  if (file.startsWith("telemetry/")) return ["subpath:telemetry", "subpath:"];
  return ["subpath:"];
};

test("每个公开子路径都能载入并导出 interface.md 列出的运行时名字", async () => {
  const files = parseInterface();
  assert.deepEqual(
    [...files.keys()],
    [
      "index.ts",
      "skills/index.ts",
      "telemetry/agent-execution.ts",
      "telemetry/index.ts",
      "time/local-date.ts",
    ],
    "interface.md 必须覆盖本包 5 个继承文件",
  );
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
    const namespaces = await Promise.all(entryFor(file).map(namespaceFor));
    for (const entry of entries) {
      if (!RUNTIME_KINDS.test(entry.kinds)) continue;
      checked += 1;
      const namespace = namespaces.find((item) => entry.name in item);
      if (!namespace) {
        uncovered.push(`${file}: ${entry.name}`);
        continue;
      }
      const expected = EXPECTED_TYPEOF[entry.name];
      if (expected && typeof namespace[entry.name] !== expected)
        uncovered.push(
          `${file}: ${entry.name} 形态应为 ${expected}，实际 ${typeof namespace[entry.name]}`,
        );
    }
  }
  assert.deepEqual(uncovered, [], `以下运行时导出未出现在公开入口：${uncovered.join(", ")}`);
  // 本包五个文件里只有 telemetry 两份与 time/local-date 有运行时导出（skills 与包根是纯声明/纯再导出），
  // 因此运行时断言数是 8：少于它就说明 interface.md 或入口映射漏了东西。
  assert.ok(checked >= 8, `运行时导出断言数量应覆盖本包全部运行时表面，实际 ${checked}`);
});

test("包根再导出的每个模块路径都能载入", async () => {
  const files = parseInterface();
  const specifiers = files
    .get("index.ts")
    .filter((entry) => entry.kinds === "ExportDeclaration" && entry.name.startsWith("./"))
    .map((entry) => entry.name);
  assert.ok(specifiers.length >= 50, `包根再导出模块应覆盖整包，实际 ${specifiers.length}`);
  const empty = [];
  const nonEmpty = [];
  for (const specifier of specifiers) {
    const relative = specifier.replace(/^\.\//u, "").replace(/\.js$/u, "");
    const namespace = await loadFile(relative);
    if (Object.keys(namespace).length === 0) empty.push(specifier);
    else nonEmpty.push(specifier);
  }
  // 纯类型模块（多数 interfaces/*.port 与 skills/index）载入后命名空间为空是正常的；
  // 这里要求"载入不抛错"是硬条件，"有运行时导出的模块数量"和"空命名空间数量"设上下界，
  // 用来发现桶漏项或整包类型化那种结构性回归。
  assert.ok(
    nonEmpty.length >= 30,
    `有 30 个以上再导出模块应暴露运行时可导出名，实际 ${nonEmpty.length}`,
  );
  assert.ok(
    empty.length <= 20,
    `只有纯类型模块允许空命名空间，实际 ${empty.length} 个：${empty.join(", ")}`,
  );
  for (const required of ["./telemetry/index.js", "./skills/index.js", "./time/local-date.js"])
    assert.ok(specifiers.includes(required), `包根必须再导出 ${required}`);
  // 桶里指过来的必须是真实模块：再导出路径下的取值要与契约一致（占位实现会在这里失败）。
  const telemetry = await loadFile("telemetry/index");
  assert.equal(telemetry.ModelApiOperation.WebSearch, "web_search");
  assert.equal(telemetry.TELEMETRY_SCHEMA_VERSION, 6);
});

test("包根对本包自有导出与 @knorvia/shared 转发都是真实取值", async () => {
  const root = await load();
  // 本包自有运行时表面（来自 skills / telemetry / time 三个区）。
  assert.equal(root.TELEMETRY_SCHEMA_VERSION, 6);
  assert.equal(root.ModelApiOperation.WebSearch, "web_search");
  assert.equal(typeof root.formatLocalIsoDate, "function");
  assert.equal(root.AgentTelemetryOperation.AgentStep, "agent_step");
  // 外部再导出：必须是真实取值，不能是空壳。
  assert.equal(typeof root.VIDEO_INPUT_MAX_BYTES, "number");
  assert.ok(root.VIDEO_INPUT_MAX_BYTES > 0);
  for (const name of [
    "MEDIA_BUDGET_CURRENT_ATTACHMENT_TOO_LARGE_ERROR_CODE",
    "MEDIA_BUDGET_CURRENT_IMAGE_TOO_LARGE_ERROR_CODE",
    "MEDIA_BUDGET_CURRENT_VIDEO_TOO_LARGE_ERROR_CODE",
  ]) {
    assert.equal(typeof root[name], "string", `${name} 应转发 @knorvia/shared 的字符串错误码`);
    assert.ok(root[name].length > 0, `${name} 不应为空串`);
  }
  const skills = await load("skills");
  assert.equal(
    typeof skills,
    "object",
    "./skills 子路径必须可载入（本区只有类型导出，命名空间可为空）",
  );
  const telemetry = await load("telemetry");
  assert.equal(
    telemetry.ModelApiOperation,
    root.ModelApiOperation,
    "子路径与包根必须指向同一模块实例",
  );
});
