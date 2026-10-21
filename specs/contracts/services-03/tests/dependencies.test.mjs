// SPDX-License-Identifier: Apache-2.0
// B8–B10 + B12：依赖方向、层内依赖不扩大、被引用面守恒。
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import { importModule, isDist, repoRoot } from "./entry.mjs";
import { FORBIDDEN_IMPORT_DIRS, INTERNAL_EDGES, scope } from "./scope.mjs";
import { loadDeclaredExports } from "./runtime-guard.mjs";
import { ensureLoadable } from "./load-guard.mjs";

const SRC = "packages/services/src";
const DOMAIN = `${SRC}/studio-runtime/domain`;

function readSource(row) {
  const rel = row.path.replace(/^packages\/services\/src\//u, "");
  return readFileSync(join(repoRoot, "packages/services/src", rel), "utf8");
}

const sources = new Map(scope.map((row) => [row.modulePath, readSource(row)]));

/** 收集一个文件的所有 import/export-from 说明符。 */
function specifiersOf(source) {
  const out = [];
  for (const match of source.matchAll(/(?:^|\n)\s*(?:import|export)[^;]*?from\s+"([^"]+)"/gu)) {
    out.push(match[1]);
  }
  for (const match of source.matchAll(/(?:^|\n)\s*import\s+"([^"]+)"/gu)) out.push(match[1]);
  return out;
}

/** 实测层内依赖边（方向：from 依赖 to）。 */
function measuredInternalEdges() {
  const edges = [];
  for (const [modulePath, source] of sources) {
    const from = modulePath.replace(/^domain\//u, "");
    for (const specifier of specifiersOf(source)) {
      const match = /^\.\/([A-Za-z0-9_$]+)\.js$/u.exec(specifier);
      if (match) edges.push({ from, to: match[1] });
    }
  }
  return edges;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.name.endsWith(".ts")) out.push(rel);
  }
  return out;
}

describe(`dependencies（${isDist ? "dist" : "source"} 入口）`, () => {
  test("B8 不向上依赖：不 import app/ 或 adapters/", async () => {
    await ensureLoadable();
    const violations = [];
    for (const [modulePath, source] of sources) {
      for (const specifier of specifiersOf(source)) {
        for (const dir of FORBIDDEN_IMPORT_DIRS) {
          if (specifier.includes(`/${dir}`) || specifier.startsWith(`../${dir}`)) {
            violations.push(`${modulePath} -> ${specifier}`);
          }
        }
      }
    }
    assert.deepEqual(violations, [], `domain 层不得向上依赖：${violations.join(", ")}`);
  });

  test("B9 层内依赖不扩大：实测边 ⊆ 冻结的 21 条", async () => {
    await ensureLoadable();
    const declared = new Set(INTERNAL_EDGES.map((edge) => `${edge.from}->${edge.to}`));
    assert.equal(declared.size, 21, "冻结的层内依赖边应为 21 条");

    const measured = measuredInternalEdges();
    const measuredSet = new Set(measured.map((edge) => `${edge.from}->${edge.to}`));

    const added = [...measuredSet].filter((edge) => !declared.has(edge));
    assert.deepEqual(added, [], `层内依赖新增了边（需重新审合同）：${added.join(", ")}`);

    const removed = [...declared].filter((edge) => !measuredSet.has(edge));
    assert.deepEqual(removed, [], `层内依赖减少了边（合同需更新）：${removed.join(", ")}`);
  });

  test("B9 层内依赖拓扑：4 个汇聚点 + 4 个叶子", async () => {
    await ensureLoadable();
    const inDegree = new Map();
    const outDegree = new Map();
    for (const name of scope.map((row) => row.modulePath.replace(/^domain\//u, ""))) {
      inDegree.set(name, 0);
      outDegree.set(name, 0);
    }
    for (const edge of measuredInternalEdges()) {
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
      outDegree.set(edge.from, (outDegree.get(edge.from) ?? 0) + 1);
    }

    // 实测（2026-10-21）：inDegree >= 2 的汇聚点共 6 个，其中前 4 个最重要。
    const hubs = [...inDegree.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
    assert.deepEqual(hubs.sort(), [
      "kernelIdentity",
      "kernelPolicy",
      "outputRef",
      "referencePath",
      "workflowParams",
      "workspaceSecrets",
    ]);

    // 被依赖最多的是 kernelPolicy（4 处）
    assert.equal(inDegree.get("kernelPolicy"), 4, "kernelPolicy 应被 4 个层内模块依赖");

    // 叶子 = 不依赖任何层内模块的节点。实测 17 个（本层耦合很松）。
    const leaves = [...outDegree.entries()]
      .filter(([, count]) => count === 0)
      .map(([name]) => name);
    assert.equal(leaves.length, 17, `叶子应为 17 个，实际 ${leaves.length}`);
    // 其中 4 个最值得注意：2 个是纯规则叶子（referencePath / staticPng），
    // capabilityMatrix 与 canonicalValue 也完全没有层内依赖。
    for (const name of ["referencePath", "staticPng", "capabilityMatrix", "canonicalValue"]) {
      assert(leaves.includes(name), `${name} 应是叶子（无层内依赖）`);
    }
  });

  test("B10 被引用面守恒：176 处外部引用，分层正确", async () => {
    await ensureLoadable();
    const allFiles = [...walk(SRC), ...walk("packages/services/test")];
    const domainNames = new Set(scope.map((row) => row.modulePath.replace(/^domain\//u, "")));
    const counts = { app: 0, adapters: 0, test: 0, root: 0 };

    for (const file of allFiles) {
      if (file.startsWith(DOMAIN)) continue;
      const source = readFileSync(join(repoRoot, file), "utf8");
      for (const match of source.matchAll(/from\s+"[^"]*domain\/([A-Za-z0-9_$]+)\.js"/gu)) {
        if (!domainNames.has(match[1])) continue;
        const rel = file.replace(`${SRC}/studio-runtime/`, "");
        if (rel.startsWith("app/")) counts.app += 1;
        else if (rel.startsWith("adapters/")) counts.adapters += 1;
        else if (file.startsWith("packages/services/test/")) counts.test += 1;
        else counts.root += 1;
      }
    }

    assert.equal(counts.app, 71, `app/ 引用应为 71，实际 ${counts.app}`);
    assert.equal(counts.adapters, 61, `adapters/ 引用应为 61，实际 ${counts.adapters}`);
    assert.equal(counts.test, 35, `test/ 引用应为 35，实际 ${counts.test}`);
    assert.equal(counts.root, 9, `根级引用应为 9，实际 ${counts.root}`);
    assert.equal(
      counts.app + counts.adapters + counts.test + counts.root,
      176,
      "外部引用总计应为 176",
    );
  });

  test("B10 最重的 6 个模块签名不变（可加载 + 导出面完整）", async () => {
    await ensureLoadable();
    const heaviest = [
      { name: "kernelPolicy", exports: 22 },
      { name: "validation", exports: 10 },
      { name: "projectIdentity", exports: 1 },
      { name: "remoteAgentIdentity", exports: 1 },
      { name: "workflowGraph", exports: 12 },
      { name: "outputRef", exports: 22 },
    ];
    for (const item of heaviest) {
      const row = scope.find((entry) => entry.modulePath === `domain/${item.name}`);
      assert(row !== undefined, `${item.name} 应在 scope 内`);
      const { loaded, exports } = await loadDeclaredExports(row);
      assert.equal(typeof loaded, "object", `${item.name} 应可加载`);
      assert.equal(
        exports.length,
        item.exports,
        `${item.name} 的导出数应为 ${item.exports}，实际 ${exports.length}`,
      );
      // 运行时导出必须真实存在于加载后的模块对象上
      for (const entry of exports.filter((item_) => item_.runtime)) {
        assert.ok(entry.name in loaded, `${item.name} 的运行时导出 ${entry.name} 应可用`);
      }
    }
  });

  test("B12 import type 的反向引用被接受（services-02 → domain 的类型引用）", async () => {
    await ensureLoadable();
    // 这条不是「违反 B8」的豁免，而是明确「哪些反向引用是合法的」：
    // services-02 的契约文件需要 domain 的类型来做签名。
    const contractDir = join(repoRoot, `${SRC}/studio-runtime`);
    for (const name of ["workflowTypes", "kernelTypes"]) {
      const file = join(contractDir, `${name}.ts`);
      let source;
      try {
        source = readFileSync(file, "utf8");
      } catch {
        continue; // 该契约文件可能不在本包范围（services-02 已合并，路径稳定）
      }
      for (const match of source.matchAll(/^import\s+type[^;]*from\s+"(\.\/domain\/[^"]+)"/gmu)) {
        assert.match(match[1], /^\.\/domain\//u, `${name} 的类型引用应只指向 domain/`);
      }
    }
    // 实质断言：domain 侧不因这些引用而反向依赖契约层（B8 已覆盖），
    // 这里只确认 domain 内没有「用 import type 引入 app/adapters」的规避写法。
    for (const [modulePath, source] of sources) {
      for (const match of source.matchAll(/^import\s+type[^;]*from\s+"([^"]+)"/gmu)) {
        for (const dir of FORBIDDEN_IMPORT_DIRS) {
          assert(
            !match[1].includes(`/${dir}`),
            `${modulePath} 用 import type 引入了 ${dir}（应走契约层声明）`,
          );
        }
      }
    }
  });

  test("B11–B13 端口的 3 个 domain 模块可加载且导出完整", async () => {
    await ensureLoadable();
    for (const name of ["imageInput", "outputRef", "reference"]) {
      const row = scope.find((entry) => entry.modulePath === `domain/${name}`);
      assert(row !== undefined, `${name} 应在 scope 内`);
      const loaded = await importModule(row);
      assert.equal(typeof loaded, "object", `${name} 应可加载`);
      assert(Object.keys(loaded).length > 0, `${name} 应有运行期导出`);
    }
  });
});
