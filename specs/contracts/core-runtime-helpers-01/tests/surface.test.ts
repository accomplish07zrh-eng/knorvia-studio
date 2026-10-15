// SPDX-License-Identifier: Apache-2.0
// core-runtime-helpers-01 契约测试：导出面与模块路径兼容面。
// 以 interface.md（机器生成的导出清单）为唯一事实源，逐模块比对源码入口与 dist 入口的运行时导出集合。
// 两个用例都会实际加载被测模块，因此桩替换下必须一起失败。
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { contractDir, entryLabel, helpers, helpersDir, repoRoot } from "./entry.mjs";

type InterfaceRow = {
  kind: string;
  module: string;
  name: string;
  runtime: boolean;
};

function parseInterfaceRows(): InterfaceRow[] {
  const text = readFileSync(join(contractDir, "interface.md"), "utf8");
  const rows: InterfaceRow[] = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*(\w+)\s*\|\s*(是|否)\s*\|$/u.exec(line);
    if (!match) continue;
    rows.push({
      kind: match[3],
      module: match[1],
      name: match[2],
      runtime: match[4] === "是",
    });
  }
  return rows;
}

const rows = parseInterfaceRows();
const byModule = new Map<string, InterfaceRow[]>();
for (const row of rows) {
  const bucket = byModule.get(row.module) ?? [];
  bucket.push(row);
  byModule.set(row.module, bucket);
}

const scope = JSON.parse(readFileSync(join(contractDir, "scope-files.json"), "utf8")) as {
  files: { classification: string; path: string }[];
};

async function loadModule(module: string) {
  return helpers(module === "index.ts" ? "index" : module.replace(/\.ts$/u, ""));
}

test("interface.md × 运行时导出：60 模块 / 316 导出逐名一致", async () => {
  assert.equal(rows.length, 316, "导出合计 316");
  assert.equal(byModule.size, 60, "模块数 60");
  assert.equal(rows.filter((row) => row.runtime).length, 296, "运行时值导出 296 个");
  assert.equal(rows.filter((row) => !row.runtime).length, 20, "纯类型导出 20 个");
  for (const module of byModule.keys()) {
    assert.ok(!module.includes("/../"), `interface.md 的模块路径必须是包内相对路径：${module}`);
  }

  assert.equal(scope.files.length, 60, "范围清单 60 个继承文件");
  const counts: Record<string, number> = {};
  for (const file of scope.files) {
    counts[file.classification] = (counts[file.classification] ?? 0) + 1;
    assert.ok(existsSync(join(repoRoot, file.path)), `继承模块缺失：${file.path}`);
  }
  assert.deepEqual(
    counts,
    { unreviewed: 7, "upstream-modified": 44, "upstream-unchanged": 9 },
    "继承分类分布是契约",
  );
  assert.ok(existsSync(helpersDir), `helpers 目录缺失：${helpersDir}`);

  if (entryLabel === "dist") {
    for (const file of scope.files) {
      const relative = file.path.slice(file.path.indexOf("src/") + 4);
      const artifact = join(
        repoRoot,
        "apps/cli/packages/core/dist",
        relative.replace(/\.ts$/u, ".js"),
      );
      assert.ok(existsSync(artifact), `dist 入口产物缺失：${artifact}`);
    }
  }

  for (const [module, moduleRows] of byModule) {
    const expected = moduleRows
      .filter((row) => row.runtime)
      .map((row) => row.name)
      .sort();
    const namespace = await loadModule(module);
    const actual = Object.keys(namespace).sort();
    assert.deepEqual(
      actual,
      expected,
      `${module} 的运行时导出必须与 interface.md 一致（entry=${entryLabel}）`,
    );
    for (const name of expected) {
      assert.notEqual(
        namespace[name],
        undefined,
        `${module}#${name} 必须是可取到的运行时绑定（entry=${entryLabel}）`,
      );
    }
  }
  assert.equal(scope.files.length, byModule.size, "范围清单与接口清单模块数一致");
});

test("桶入口与单模块入口互相覆盖，且入口取值受控", async () => {
  assert.ok(
    entryLabel === "source" || entryLabel === "dist",
    `入口环境变量取值必须是 source 或 dist：${entryLabel}`,
  );

  const barrel = await loadModule("index.ts");
  const barrelNames = new Set(Object.keys(barrel));
  const barrelRows = (byModule.get("index.ts") ?? []).filter((row) => row.runtime);
  assert.equal(
    barrelNames.size,
    barrelRows.length,
    "桶入口的运行时导出数与 interface.md 的 index.ts 行一致",
  );

  // 桶再导出的 26 个模块：它们的运行时导出必须都能从桶里取到。
  const reExported = [
    "attachments.ts",
    "media-budget.ts",
    "steering.ts",
    "runtime-reminders.ts",
    "compact.ts",
    "rewind.ts",
    "conversation.ts",
    "commands.ts",
    "permission-broker.ts",
    "child-client-ports.ts",
    "model-errors.ts",
    "turn-errors.ts",
    "project.ts",
    "tool-result.ts",
    "streaming-tool-ledger.ts",
    "media-capability.ts",
    "media-attachment-path.ts",
    "media-observability.ts",
    "provider-request-messages.ts",
    "model-tool-call-validation.ts",
    "runtime-provider-request-messages.ts",
    "plan-file-continuity.ts",
    "turn-file-changes.ts",
    "compact-media.ts",
    "model-anomaly.ts",
    "data.ts",
  ];
  assert.equal(reExported.length, 26, "桶入口再导出 26 个模块");
  for (const module of reExported) {
    const namespace = await loadModule(module);
    const names = Object.keys(namespace);
    assert.ok(names.length > 0, `${module} 应有运行时导出`);
    for (const name of names) {
      assert.ok(barrelNames.has(name), `桶入口缺少 ${module} 的导出 ${name}`);
    }
  }

  // 不在桶里的模块（例如纯分派模块）同样可按模块路径导入。
  const standalone = await loadModule("attachment-media-resolver.ts");
  assert.equal(typeof standalone.resolveInlineMediaAttachment, "function");
  assert.equal(typeof standalone.resolveLocalMediaAttachment, "function");
});
