// SPDX-License-Identifier: Apache-2.0
// B7–B10、B15：端口签名、下沉路径、零运行期状态、引用面、与实现者的类型对应。
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { importModule, moduleFilePath, entryLabel, repoRoot } from "./entry.mjs";
import { extractExports } from "./exports-ast.mjs";
import { PORTS, contractDir, portFiles, SR_DIR, srcPrefix } from "./scope.mjs";
import { assertLoadable, loadDeclaredExports } from "./runtime-guard.mjs";

const interfaceText = readFileSync(`${contractDir}/interface.md`, "utf8");
const SPEC_RE = /\bfrom\s+["']([^"']+)["']/gu;

function sectionOfPort(name) {
  const heading = `### \`${srcPrefix}${SR_DIR}${name}.ts\``;
  const start = interfaceText.indexOf(heading);
  if (start === -1) return undefined;
  const next = interfaceText.indexOf("\n### ", start + 1);
  return interfaceText.slice(start, next === -1 ? undefined : next);
}

describe(`B7 端口签名不变（${entryLabel}）`, () => {
  it("4 个端口都在 interface.md 中成节，且导出数与源码一致", async () => {
    await assertLoadable(portFiles);
    assert.equal(portFiles.length, 4);
    for (const name of PORTS) {
      const section = sectionOfPort(name);
      assert.ok(section !== undefined, `interface.md 缺少端口小节：${name}`);
      assert.ok(/表示端口|端口/.test(section), `${name} 小节应标注端口身份`);
    }
  });

  it("端口导出数量守恒：ports 8 / storePort 7 / imagePort 2 / workspaceRuntimePort 3", async () => {
    const expected = { ports: 8, storePort: 7, imagePort: 2, workspaceRuntimePort: 3 };
    for (const [name, count] of Object.entries(expected)) {
      const row = portFiles.find((entry) => entry.modulePath === name);
      assert.ok(row !== undefined, `${name} 应在范围内`);
      // 端口基线仍在 app/ 下
      const { exports: declaredExports } = await loadDeclaredExports(row);
      assert.equal(declaredExports.length, count, `${name} 导出数应为 ${count}`);
    }
  });
});

describe(`B8 端口下沉后的路径（${entryLabel}）`, () => {
  it("端口文件当前位于基线路径 app/ 下（替换阶段才下沉）", async () => {
    await assertLoadable(portFiles);
    for (const row of portFiles) {
      assert.ok(existsSync(moduleFilePath(row)), `端口基线文件缺失：${row.modulePath}`);
      assert.equal(row.path, `${srcPrefix}${SR_DIR}app/${row.modulePath}.ts`);
    }
  });

  it("interface.md 记录了每个端口的原路径与下沉后新路径", async () => {
    await assertLoadable(portFiles);
    for (const name of PORTS) {
      const section = sectionOfPort(name);
      assert.ok(section !== undefined);
      assert.ok(
        section.includes(`app/${name}.ts`) && section.includes(`${name}.ts\`（端口`),
        `${name} 小节应同时记录原路径与下沉说明`,
      );
    }
  });
});

describe(`B9 端口不含运行期状态（${entryLabel}）`, () => {
  it("4 个端口文件没有模块级可变绑定（无顶层 let / var）", async () => {
    await assertLoadable(portFiles);
    for (const name of PORTS) {
      const text = readFileSync(`${repoRoot}/${srcPrefix}${SR_DIR}app/${name}.ts`, "utf8");
      const offenders = [];
      for (const rawLine of text.split("\n")) {
        const line = rawLine.trim();
        if (line.startsWith("//") || line.startsWith("*")) continue;
        if (/^(?:export\s+)?(?:let|var)\s+[A-Za-z_$]/u.test(line)) offenders.push(line);
      }
      assert.deepEqual(offenders, [], `${name} 不应有模块级可变绑定：${offenders.join("; ")}`);
    }
  });

  it("端口的运行时导出只有纯函数与只读常量", async () => {
    // imagePort 有 1 项运行时导出（validateStudioTurnImages，纯函数）；
    // 其余 3 个端口零运行时导出。
    const runtimeCounts = {};
    for (const name of PORTS) {
      const row = portFiles.find((entry) => entry.modulePath === name);
      assert.ok(row !== undefined);
      const { exports: declaredExports } = await loadDeclaredExports(row);
      runtimeCounts[name] = declaredExports.filter((entry) => entry.runtime).length;
    }
    assert.deepEqual(runtimeCounts, {
      imagePort: 1,
      ports: 0,
      storePort: 0,
      workspaceRuntimePort: 0,
    });
  });
});

describe(`B10 端口引用面守恒（${entryLabel}）`, () => {
  it("4 个端口合计 94 处引用，全部在 packages/services 内", async () => {
    await assertLoadable(portFiles);
    const raw = JSON.parse(
      readFileSync(`${repoRoot}/specs/contracts/services-02/callers-raw.json`, "utf8"),
    );
    const byModule = Object.fromEntries(
      raw.filter((item) => item.role === "port").map((item) => [item.module, item.total]),
    );
    assert.deepEqual(byModule, { imagePort: 5, ports: 29, storePort: 55, workspaceRuntimePort: 5 });
    assert.equal(
      Object.values(byModule).reduce((sum, count) => sum + count, 0),
      94,
    );
  });
});

describe(`B15 端口与实现者的类型对应（${entryLabel}）`, () => {
  it("4 个端口都能被动态导入（纯类型端口运行期为空对象，属正常）", async () => {
    for (const row of portFiles) {
      const loaded = await importModule(row);
      assert.equal(typeof loaded, "object", `${row.modulePath} 应可导入`);
      const declared = extractExports(repoRoot, `${SR_DIR}app/${row.modulePath}.ts`);
      assert.ok(declared.length > 0, `${row.modulePath} 声明面不应为空`);
    }
  });

  it("端口的类型导出（接口）在运行时不出现，只有函数/常量可用", async () => {
    // ports / storePort / workspaceRuntimePort 是纯类型端口：运行期导出面的键数为 0
    for (const name of ["ports", "storePort", "workspaceRuntimePort"]) {
      const row = portFiles.find((entry) => entry.modulePath === name);
      assert.ok(row !== undefined);
      const loaded = await importModule(row);
      assert.deepEqual(Object.keys(loaded), [], `${name} 应为纯类型端口`);
    }
  });
});

void SPEC_RE;
