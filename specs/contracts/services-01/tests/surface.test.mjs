// SPDX-License-Identifier: Apache-2.0
// B1/B2/B3：范围、兼容面与双入口。断言方向是「源码 ↔ interface.md ↔ 产物」两两相等，
// 而不是各自与手抄常数相等。
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  cuaBroker,
  entryLabel,
  importDeep,
  moduleFilePath,
  repoRoot,
  services,
  servicesNode,
} from "./entry.mjs";
import { declaredNames, extractExports } from "./exports-ast.mjs";
import {
  FROZEN,
  classificationCounts,
  contractDir,
  dirCounts,
  documents,
  licensingDrift,
  rewriteTargets,
  scope,
  srcPrefix,
  typescriptFiles,
} from "./scope.mjs";

const interfaceText = readFileSync(`${contractDir}/interface.md`, "utf8");

function sectionOf(modulePath) {
  const heading = `### \`${srcPrefix}${modulePath}\``;
  const start = interfaceText.indexOf(heading);
  if (start === -1) return undefined;
  const next = interfaceText.indexOf("\n### ", start + 1);
  return interfaceText.slice(start, next === -1 ? undefined : next);
}

describe(`B1 范围清单（${entryLabel}）`, () => {
  it("60 个继承文件：7 目录分布与三类分类计数", () => {
    assert.equal(scope.length, FROZEN.count);
    assert.deepEqual(dirCounts(), FROZEN.byDir);
    assert.deepEqual(classificationCounts(), FROZEN.classification);
    assert.equal(rewriteTargets.length, FROZEN.count);
    assert.equal(documents.length, 2);
    assert.equal(typescriptFiles.length, 58);
  });

  it("行数与字节数冻结；两份继承文档在范围内", () => {
    assert.equal(
      scope.reduce((sum, row) => sum + row.lines, 0),
      FROZEN.lines,
    );
    assert.equal(
      scope.reduce((sum, row) => sum + row.bytes, 0),
      FROZEN.bytes,
    );
    assert.deepEqual(documents.map((row) => row.modulePath).sort(), [
      "agent/STDERR-OWNER-SPEC-20261003.md",
      "file/FILTER-SPEC-20261002.md",
    ]);
  });

  it("licensing 基线仍把 60 个路径记为继承文件", () => {
    assert.deepEqual(licensingDrift(), []);
  });
});

describe(`B2 兼容面：interface.md 与源码同步（${entryLabel}）`, () => {
  it("每个范围模块都有一节，且声明名集合与 AST 导出一致", () => {
    for (const row of typescriptFiles) {
      const section = sectionOf(row.modulePath);
      assert.ok(section, `interface.md 缺少 ${row.modulePath}`);
      const declared = declaredNames(section.split("```ts")[1] ?? "");
      const ast = extractExports(repoRoot, row.modulePath);
      const expected = new Set(
        ast.filter((entry) => entry.name !== "*").map((entry) => entry.name),
      );
      assert.deepEqual([...declared].sort(), [...expected].sort(), row.modulePath);
      for (const entry of ast.filter((value) => value.kind === "star-reexport")) {
        assert.match(section, new RegExp(entry.signature.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
      }
    }
  });

  it("interface.md 的模块路径在当前入口侧都存在", () => {
    for (const row of typescriptFiles) {
      assert.ok(existsSync(moduleFilePath(row.modulePath)), row.modulePath);
      assert.ok(sectionOf(row.modulePath), row.modulePath);
    }
  });

  it("58 个模块的运行时导出名都在产物里可用，且没有未登记的运行时键", async () => {
    for (const row of typescriptFiles) {
      const ast = extractExports(repoRoot, row.modulePath);
      const expected = new Set(
        ast.filter((entry) => entry.runtime && entry.name !== "*").map((entry) => entry.name),
      );
      const hasStar = ast.some((entry) => entry.kind === "star-reexport");
      const namespace = await importDeep(row.modulePath);
      const actual = Object.keys(namespace).filter((name) => name !== "default");
      for (const name of expected) {
        assert.ok(name in namespace, `${row.modulePath} 缺少运行时导出 ${name}`);
      }
      if (!hasStar) {
        assert.deepEqual(actual.sort(), [...expected].sort(), row.modulePath);
      }
    }
  });
});

describe(`B3 公开入口形状（${entryLabel}）`, () => {
  it("根桶暴露 descriptor 与浏览器安全类型面", () => {
    for (const name of [
      "ICredentialService",
      "IBroadcastService",
      "IFileService",
      "ICommandsService",
      "ICuaPermissionService",
      "ICuaPipSessionService",
      "createKnorviaAgentConnectionScope",
      "createConversationTelemetryService",
    ]) {
      assert.ok(name in services, name);
    }
  });

  it("Node 组合入口暴露装配函数", () => {
    for (const name of [
      "createKnorviaAgentService",
      "createKnorviaTaskServiceAdapter",
      "createKnorviaSessionService",
      "createBroadcastService",
      "createCredentialService",
      "createFileService",
      "createCommandsService",
      "KnorviaAgentProcessManager",
      "resolveDefaultKnorviaAgentCommand",
      "KnorviaProtocolClient",
      "KnorviaStdioTransport",
    ]) {
      assert.ok(name in servicesNode, name);
    }
  });

  it("cua-permission-broker 子路径保留委托面与本地描述符", () => {
    assert.equal(typeof cuaBroker.ICuaPermissionService, "object");
    assert.equal(typeof cuaBroker.CuaAgentAdmissionGate, "function");
    assert.equal(typeof cuaBroker.WindowsCuaHelperHost, "function");
  });
});
