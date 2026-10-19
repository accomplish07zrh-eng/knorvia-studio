// SPDX-License-Identifier: Apache-2.0
// B20 兼容面与 B30 projections 桶。
//
// 这一份是**关于合同文件自身**的测试：范围清单、interface.md 的逐文件导出声明块、
// interface.md 声明的深层模块路径、两个入口桶的运行时形状。它存在的理由是一条常见的
// 失效模式——重写方把源码改对了，但合同的 oracle（interface.md / 桩 / 范围）没跟上，
// 于是门在一份过期文档上放行。所以断言方向永远是「源码 ↔ 文档」两两相等，而不是各自
// 与一个手抄常数相等：文档由 gen-interface.mjs 从源码抽取生成，任何一侧单独变动都会让
// 本文件变红。
//
// 只读公开入口与合同文件：运行时面一律 `Object.keys(桶)`，声明面一律 interface.md 的
// ```ts 块与 `tests/exports-ast.mjs` 的抽取结果。
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";

import {
  dw,
  entryBucketFiles,
  entryLabel,
  entryRootDir,
  importDeep,
  isDist,
  projections,
  repoRoot,
} from "./entry.mjs";
import { extractExports } from "./exports-ast.mjs";
import {
  BUCKETS,
  classificationCounts,
  contractDir,
  rewriteTargets,
  scope,
  srcPrefix,
  unreviewed,
} from "./scope.mjs";

/** 本包的四个子目录桶（`""` 是 src 根，只有两个入口桶文件，不构成归属面）。 */
const OWNED_BUCKETS = ["engine", "facade", "lowering", "schema"];

const srcRoot = resolve(repoRoot, srcPrefix);
const packageRoot = resolve(repoRoot, "apps/cli/packages/dynamic-workflow");

function read(file) {
  return readFileSync(file, "utf8");
}

/** interface.md 的逐文件节（标题到下一个 `### ` 之间）。缺节返回 undefined。 */
function sectionOf(interfaceText, modulePath) {
  const heading = `### \`${srcPrefix}${modulePath}\``;
  const start = interfaceText.indexOf(heading);
  if (start === -1) return undefined;
  const next = interfaceText.indexOf("\n### ", start + 1);
  return interfaceText.slice(start, next === -1 ? undefined : next);
}

/**
 * 从一个 ```ts 声明块里取导出名。两种形状都要认：`export const x …` 这类声明，以及
 * 入口桶那种 `export { A, B as C } from "./x.js"` 再导出——只用声明正则的话 index.ts 的
 * 节会被判成"什么都没声明"，于是覆盖检查在那里静默失效。
 */
function declaredNames(blockText) {
  const names = new Set();
  for (const match of blockText.matchAll(
    /^export\s+(?:type\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|interface|function|const|let|var|type|enum|namespace)\s+([A-Za-z0-9_$]+)/gm,
  )) {
    names.add(match[1]);
  }
  for (const match of blockText.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}\s+from/gm)) {
    for (const spec of match[1].split(",")) {
      const name = spec
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (name !== "") names.add(name);
    }
  }
  return names;
}

/** 静态 import / export / require 的说明符：行锚定、跳过 `import type`，不吃正文里的引号。 */
function specifiersOf(text) {
  const out = [];
  for (const match of text.matchAll(
    /^[ \t]*(?:import|export)(?!\s+type\b)[^\n;]*?\bfrom\s*["']([^"']+)["']/gm,
  )) {
    out.push(match[1]);
  }
  for (const match of text.matchAll(/^[ \t]*import\s*["']([^"']+)["']/gm)) out.push(match[1]);
  for (const match of text.matchAll(/\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    out.push(match[1]);
  }
  return out;
}

/**
 * 入口文件的传递依赖图，返回 `{files, bare}`。`bare` 是裸包说明符集合——浏览器安全
 * 不变式判的就是它：`typescript` 出现在 projections 的图里，等于把整个编译器拖进浏览器包，
 * 而那正是那两个调用文件绕道 `/projections` 子路径要避免的事。
 */
function importGraph(entryFile) {
  const extension = entryFile.slice(entryFile.lastIndexOf("."));
  const seen = new Set();
  const bare = new Set();
  const queue = [entryFile];
  while (queue.length > 0) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of specifiersOf(read(file))) {
      if (!spec.startsWith(".")) {
        bare.add(spec);
        continue;
      }
      const base = resolve(dirname(file), spec).replace(/\.(js|ts)$/, extension);
      for (const candidate of [base, resolve(base, `index${extension}`)]) {
        if (existsSync(candidate)) {
          queue.push(candidate);
          break;
        }
      }
    }
  }
  return { files: [...seen], bare };
}

describe(`B20 范围清单（analysis/ 与 compiler/ 之外，${entryLabel}）`, () => {
  it("40 个文件：五桶分布与三类分类计数", () => {
    assert.equal(scope.length, 40, "范围文件数变了：先改 behavior.md 与 README 的口径，再动这里");
    assert.deepEqual(
      BUCKETS.map((bucket) => [
        bucket === "" ? "(src 根)" : bucket,
        scope.filter((row) => row.bucket === bucket).length,
      ]),
      [
        ["(src 根)", 2],
        ["engine", 24],
        ["facade", 5],
        ["lowering", 2],
        ["schema", 7],
      ],
    );
    assert.deepEqual(classificationCounts(), {
      "upstream-unchanged": 24,
      "upstream-modified": 13,
      unreviewed: 3,
    });
    assert.equal(rewriteTargets.length, 37, "重写目标 = 40 - 3 unreviewed");
    assert.deepEqual(
      unreviewed.map((row) => row.modulePath).sort(),
      [
        "engine/ask-journal-projection.ts",
        "engine/scheduler-helpers.ts",
        "engine/workflow-error.ts",
      ],
      "unreviewed 三文件不重写也不删；名单变动 = 审计范围变动，必须先改合同",
    );
  });

  it("每个范围文件的模块路径在两侧都可用", () => {
    for (const row of scope) {
      assert.ok(existsSync(resolve(repoRoot, row.path)), `源码缺少 ${row.modulePath}`);
      if (!isDist) continue;
      const js = row.modulePath.replace(/\.ts$/, ".js");
      assert.ok(existsSync(resolve(packageRoot, "dist", js)), `dist 缺少 ${js}`);
      assert.ok(
        existsSync(resolve(packageRoot, "dist", `${js.replace(/\.js$/, ".d.ts")}`)),
        `dist 缺少声明文件 ${js}`,
      );
    }
  });
});

describe("B20 interface.md 与源码同步", () => {
  const interfaceText = read(resolve(contractDir, "interface.md"));

  it("逐文件节的清单与范围一致，没有孤儿节", () => {
    const headings = [
      ...interfaceText.matchAll(/^### `(apps\/cli\/packages\/dynamic-workflow\/src\/[^`]+)`$/gm),
    ];
    assert.deepEqual(
      headings.map((match) => match[1].slice(srcPrefix.length)).sort(),
      scope.map((row) => row.modulePath).sort(),
    );
  });

  it("每个文件的 ```ts 块覆盖其源码导出名，计数行与抽取一致", () => {
    const drift = [];
    for (const row of scope) {
      const section = sectionOf(interfaceText, row.modulePath);
      if (section === undefined) {
        drift.push(`${row.modulePath}: 缺节`);
        continue;
      }
      const blocks = [...section.matchAll(/```ts\r?\n([\s\S]*?)```/g)]
        .map((block) => block[1])
        .join("\n");
      if (blocks === "") {
        drift.push(`${row.modulePath}: 缺声明块`);
        continue;
      }
      const exports = extractExports(repoRoot, row.modulePath);
      const names = declaredNames(blocks);
      for (const entry of exports) {
        if (!names.has(entry.name)) drift.push(`${row.modulePath}:${entry.name}`);
      }
      const runtime = exports.filter((entry) => entry.runtime).length;
      const counted = section.match(/导出 (\d+) 项（运行时 (\d+) \/ 纯类型 (\d+)）/);
      assert.ok(counted !== null, `${row.modulePath}: 缺计数行`);
      assert.deepEqual(
        [Number(counted[1]), Number(counted[2]), Number(counted[3])],
        [exports.length, runtime, exports.length - runtime],
        `${row.modulePath}: 计数行与源码抽取不一致`,
      );
    }
    assert.deepEqual(drift, [], "interface.md 已过期：重跑 tests/gen-interface.mjs");
  });

  it("深层模块路径逐个可解析（类型名不上运行时面）", async () => {
    // 兼容面上的深路径是包外/测试侧按**相对路径** import 的那批模块；重写方重组内部文件时
    // 最容易整条删掉，而删掉的破坏要到别人 import 时才可见，所以这里逐条真导入一次。
    // 只取「深层模块路径」那一条子清单（`## 兼容入口面` 的开头两条讲的是两个入口桶本身，
    // 它们也写成 `dist/index.js` 这种形态，扫进来会把桶当成深路径）。
    const compat = interfaceText.slice(
      interfaceText.indexOf("- **深层模块路径**"),
      interfaceText.indexOf("- 因此**只有 facade"),
    );
    const entries = [...compat.matchAll(/`([A-Za-z0-9_.\-/]+\.js)`(?:（([^）]*)）)?/g)].map(
      (match) => ({
        modulePath: match[1],
        names:
          match[2] === undefined ? [] : [...match[2].matchAll(/`([^`]+)`/g)].map((name) => name[1]),
      }),
    );
    const listed = entries.map((entry) => entry.modulePath);
    assert.deepEqual(listed, [
      "facade/dts.js",
      "facade/registry.js",
      "facade/artifact-caps.js",
      "engine/scheduler.js",
      "engine/scheduler-types.js",
      "engine/journal-memory.js",
      "engine/hash.js",
      "engine/imported-cache.js",
      "engine/types.js",
    ]);
    for (const entry of entries) {
      const sourcePath = entry.modulePath.replace(/\.js$/, ".ts");
      assert.ok(existsSync(resolve(srcRoot, sourcePath)), `深层路径缺源码：${sourcePath}`);
      const module = await importDeep(entry.modulePath);
      const kinds = new Map(
        extractExports(repoRoot, sourcePath).map((row) => [row.name, row.kind]),
      );
      for (const name of entry.names) {
        assert.ok(kinds.has(name), `${entry.modulePath} 的清单里写了源码没有的导出名 ${name}`);
        if (kinds.get(name) === "interface" || kinds.get(name) === "type") {
          assert.equal(Object.hasOwn(module, name), false, `${name} 是类型，不该出现在运行时面`);
        } else {
          assert.notEqual(module[name], undefined, `${entry.modulePath} 缺运行时导出 ${name}`);
        }
      }
    }
  });
});

describe("B20 根桶的归属面", () => {
  const barrel = extractExports(repoRoot, "index.ts");
  const bucketOf = (row) => (row.source ?? "").replace(/^\.\//, "").split("/")[0];
  const runtimeKeys = Object.keys(dw);

  it("再导出行 200 项、运行时面 84 项，两侧互相覆盖", () => {
    assert.equal(barrel.length, 200);
    assert.equal(new Set(barrel.map((row) => row.name)).size, 200, "再导出名不得重复");
    const declared = new Set(barrel.map((row) => row.name));
    assert.deepEqual(
      runtimeKeys.filter((key) => !declared.has(key)).sort(),
      [],
      "运行时面上出现了声明里没有的名字",
    );
    assert.equal(runtimeKeys.length, 84, `运行时面 ${runtimeKeys.length} 项（${entryLabel}）`);
  });

  it("四个自有桶：运行时 44 项按桶计数，其余全是 interface/type", () => {
    // 「声明了却没上运行时面」只有一种正当理由：那是类型。剩下的任何一种都意味着
    // 一个**值**导出在再导出时被漏掉或改名——调用方要等到运行时才发现问题，所以在这里拦。
    const typeNames = new Set();
    for (const row of scope) {
      if (!OWNED_BUCKETS.includes(row.bucket)) continue;
      for (const entry of extractExports(repoRoot, row.modulePath)) {
        if (entry.kind === "interface" || entry.kind === "type") typeNames.add(entry.name);
      }
    }
    const owned = barrel.filter((row) => OWNED_BUCKETS.includes(bucketOf(row)));
    assert.equal(owned.length, 107);
    const perBucket = {};
    const unexplained = [];
    for (const row of owned) {
      const bucket = bucketOf(row);
      if (Object.hasOwn(dw, row.name)) {
        perBucket[bucket] = (perBucket[bucket] ?? 0) + 1;
        assert.notEqual(dw[row.name], undefined, `${row.name} 在运行时面上是 undefined`);
      } else if (!typeNames.has(row.name)) {
        unexplained.push(`${bucket}:${row.name}`);
      }
    }
    assert.deepEqual(perBucket, { engine: 19, facade: 10, lowering: 3, schema: 12 });
    assert.deepEqual(unexplained, []);
  });

  it("运行时面恰由自有 44 项 + dw01 的 40 项拼成", () => {
    const owned = new Set(
      barrel.filter((row) => OWNED_BUCKETS.includes(bucketOf(row))).map((row) => row.name),
    );
    const onRuntime = runtimeKeys.filter((key) => owned.has(key));
    assert.equal(onRuntime.length, 44);
    assert.equal(
      runtimeKeys.length - onRuntime.length,
      40,
      "其余 40 项必须来自 analysis/compiler（dw01 的范围）",
    );
  });
});

describe(`B30 projections 桶：浏览器安全子集（${entryLabel}）`, () => {
  it("projections 的传递图里没有任何裸包说明符", () => {
    const graph = importGraph(entryBucketFiles.projections);
    assert.deepEqual([...graph.bare].sort(), []);
    assert.ok(graph.files.length >= 2, "依赖图只有入口自己，说明抽取没跑起来");
    assert.ok(
      graph.files.every((file) => file.startsWith(entryRootDir)),
      "图跑出了包外",
    );
  });

  it("对照组：根桶的传递图确实拖入 typescript（否则上一条是空断言）", () => {
    const graph = importGraph(entryBucketFiles.index);
    assert.ok(graph.bare.has("typescript"), "根桶应当确实依赖 typescript");
  });

  it("两个入口桶的运行时集合与 dw01 的录制逐字一致", () => {
    // 录制只有 dw01 那一份：本合同读它而不是复制它（复制出的两份冻结集迟早分叉，
    // 分叉那天同一处改名只有一侧的 gate 会报警）。
    const recorded = JSON.parse(
      read(resolve(contractDir, "..", "dynamic-workflow-01", "fixtures", "entry-exports.json")),
    );
    assert.deepEqual(
      Object.keys(dw).sort((a, b) => a.localeCompare(b, "en")),
      recorded.index,
      "根桶运行时集合变了：调用方按名字导入，改名/删名要显式记进 known-differences",
    );
    assert.deepEqual(
      Object.keys(projections).sort((a, b) => a.localeCompare(b, "en")),
      recorded.projections,
      "projections 桶运行时集合变了",
    );
    assert.equal(recorded.index.length, 84);
    assert.equal(recorded.projections.length, 32);
  });
});
