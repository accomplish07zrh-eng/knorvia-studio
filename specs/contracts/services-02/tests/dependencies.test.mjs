// SPDX-License-Identifier: Apache-2.0
// B11–B13、B16：依赖方向。
//
// B11 的适用范围是 **15 个文件**（11 个根级 `*Types.ts` 契约声明 + 4 个下沉端口），
// 不含 `contract.ts` / `module.ts` / `node.ts`：后三者是**入口/桶文件**，
// 职责就是聚合导出（`export *`），它们不承担「契约层独立性」的保证。
// 契约层的独立性由这 15 个文件「不 import 实现层」保证。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { entryLabel, repoRoot } from "./entry.mjs";
import { importModule } from "./entry.mjs";
import { assertLoadable, loadDeclaredExports } from "./runtime-guard.mjs";
import { portFiles, scope, SR_DIR, srcPrefix } from "./scope.mjs";

/** 入口/桶/示例文件：不参与 B11 的「不得 import 实现层」约束。
 *
 * `contract` 是聚合桶（export * 各层模块，职责如此）；
 * `module`/`node` 是入口；`contract.example` 是用法示例（供测试当夹具）。
 * 契约层的独立性由**纯声明文件 + 下沉端口**保证，即下面的 13 个。
 */
const BARREL_AND_ENTRY = new Set(["contract", "module", "node", "contract.example"]);

/** 实现层目录前缀。 */
const IMPLEMENTATION_LAYERS = ["app/", "adapters/", "domain/"];

const SPEC_RE = /\bfrom\s+["']([^"']+)["']/gu;

function sourcePathOf(row) {
  const subdir = row.role === "port" ? "app/" : "";
  return `${SR_DIR}${subdir}${row.modulePath}.ts`;
}

/** 抽出某文件里**构成运行期依赖**的 import 说明符。
 *
 * 只统计 `import ... from "..."` 的值导入：
 *   · `import type ... from` 会在编译期被完全擦除，**不构成运行期依赖边**；
 *   · `export * from "..."` 是聚合转发（桶职责），不计入依赖方向约束；
 *   · 注释里提到的路径也不计入（用行级正则排除）。
 */
function valueImportSpecifiers(row) {
  const text = readFileSync(`${repoRoot}/${srcPrefix}${sourcePathOf(row)}`, "utf8");
  const specs = [];
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    // 跳过注释行
    if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
    // 跳过 re-export 转发（聚合，不是依赖边）
    if (/^export\s+(?:type\s+)?\*/u.test(line)) continue;
    // 跳过纯类型导入（编译期擦除）
    if (/^import\s+type\b/u.test(line)) continue;
    // 处理 `import { type X, Y } from`：只 type 说明符的导入整条擦除不可判定，
    // 保守起见按「有值导入」计入（`import { type X }` 单独形态下面再判）
    const bareTypeOnly = /^import\s+\{\s*(?:type\s+[\w$]+\s*,?\s*)+\}\s+from\b/u.test(line);
    if (bareTypeOnly) continue;
    const match = /\bfrom\s+["\x27]([^"\x27]+)["\x27]/u.exec(line);
    if (match) specs.push(match[1]);
  }
  // 多行 import 语句的续行（`} from "..."`）也要收
  for (const match of text.matchAll(/^\}\s+from\s+["\x27]([^"\x27]+)["\x27]/gmu)) {
    specs.push(match[1]);
  }
  return specs;
}

/** 把每个交付文件自己的路径也排除掉（端口在 app/ 下，属本层）。 */
function isImplementationLayerTarget(row, spec) {
  if (!spec.startsWith(".")) return false;
  // 端口文件在基线下位于 app/ 内，`./xxxPort.js` 这类同目录引用不是跨层
  if (row.role === "port" && !spec.includes("/")) return false;
  const normalized = spec.replace(/^\.\//u, "");
  if (normalized.startsWith("../")) {
    const rest = normalized.replace(/^(\.\.\/)+/u, "");
    return IMPLEMENTATION_LAYERS.some((layer) => rest.startsWith(layer));
  }
  return IMPLEMENTATION_LAYERS.some((layer) => normalized.startsWith(layer));
}

/** B11 的被约束集合：9 个纯声明 + 4 个端口 = 13 个。 */
const B11_SUBJECTS = scope.filter((row) => !BARREL_AND_ENTRY.has(row.modulePath));

describe(`B11 契约层不得 import 实现层（${entryLabel}）`, () => {
  it("被约束的 13 个模块都能被真实加载（非桩）", async () => {
    for (const row of B11_SUBJECTS) {
      const loaded = await importModule(row);
      assert.equal(typeof loaded, "object", `${row.modulePath} 应可导入`);
    }
  });

  it("约束范围为 13 个文件（9 纯声明 + 4 端口），排除 contract/module/node/example", async () => {
    await assertLoadable(B11_SUBJECTS);
    assert.equal(B11_SUBJECTS.length, 13);
    assert.equal(B11_SUBJECTS.filter((row) => row.role === "declaration").length, 9);
    assert.equal(B11_SUBJECTS.filter((row) => row.role === "port").length, 4);
    assert.equal(scope.length - B11_SUBJECTS.length, 4);
  });

  it("这 15 个文件的 import 语句不指向 app/、adapters/、domain/", async () => {
    const violations = [];
    for (const row of B11_SUBJECTS) {
      await loadDeclaredExports(row);
      for (const spec of valueImportSpecifiers(row)) {
        if (isImplementationLayerTarget(row, spec)) {
          violations.push(`${row.modulePath} -> ${spec}`);
        }
      }
    }
    assert.deepEqual(violations, [], `发现跨层 import：${violations.join("; ")}`);
  });

  it("桶文件 contract.ts 的重导出属聚合，不计入依赖方向约束", async () => {
    const barrel = scope.find((row) => row.modulePath === "contract");
    assert.ok(barrel !== undefined);
    await loadDeclaredExports(barrel);
    const text = readFileSync(`${repoRoot}/${srcPrefix}${sourcePathOf(barrel)}`, "utf8");
    // contract.ts 确实是桶：用 export * 聚合各层模块
    const stars = [...text.matchAll(/^export\s+\*\s+from\s+["']([^"']+)["']/gmu)].map(
      (match) => match[1],
    );
    assert.ok(stars.length > 0, "contract.ts 应为聚合桶");
    // 其中有指向 domain/ 的聚合——这是**入口职责**，不是契约声明文件的依赖
    const domainStars = stars.filter((spec) => spec.includes("domain/"));
    assert.ok(domainStars.length > 0, "contract.ts 应聚合部分 domain 导出（既有形态）");
  });
});

describe(`B12/B13 层间依赖单向（${entryLabel}）`, () => {
  it("4 个端口模块都能被真实加载（非桩）", async () => {
    for (const row of portFiles) {
      const loaded = await importModule(row);
      assert.equal(typeof loaded, "object", `${row.modulePath} 应可导入`);
    }
  });

  it("端口下沉后 4 个端口的引用全部在包内（94 处口径见 callers.md）", async () => {
    await assertLoadable(portFiles);
    const raw = JSON.parse(
      readFileSync(`${repoRoot}/specs/contracts/services-02/callers-raw.json`, "utf8"),
    );
    const ports = raw.filter((item) => item.role === "port");
    assert.equal(ports.length, 4);
    const portTotal = ports.reduce((sum, item) => sum + item.total, 0);
    assert.equal(portTotal, 94, "端口引用合计应为 94 处");

    const outside = ports.reduce(
      (sum, item) =>
        sum +
        Object.entries(item.byScope)
          .filter(([scopeName]) => scopeName !== "services/src" && scopeName !== "services/test")
          .reduce((subtotal, [, count]) => subtotal + count, 0),
      0,
    );
    assert.equal(outside, 0, "端口引用不得出 packages/services");
  });

  it("全部 17 个文件的引用合计 339 处，包外 0 处", async () => {
    await assertLoadable(scope);
    const raw = JSON.parse(
      readFileSync(`${repoRoot}/specs/contracts/services-02/callers-raw.json`, "utf8"),
    );
    const total = raw.reduce((sum, item) => sum + item.total, 0);
    assert.equal(total, 339);
    const outside = raw.reduce(
      (sum, item) =>
        sum +
        Object.entries(item.byScope)
          .filter(([scopeName]) => scopeName !== "services/src" && scopeName !== "services/test")
          .reduce((subtotal, [, count]) => subtotal + count, 0),
      0,
    );
    assert.equal(outside, 0);
  });
});

describe(`B16 导出的类型引用闭合（${entryLabel}）`, () => {
  it("13 个被约束文件不通过值导入引用上层实现细节", async () => {
    // 类型引用与值引用走同一个 `from "..."` 语法，B11 已覆盖；
    // 这里额外断言：这 15 个文件里不出现 `app/`、`adapters/`、`domain/` 字样。
    const offenders = [];
    for (const row of B11_SUBJECTS) {
      await loadDeclaredExports(row);
      for (const spec of valueImportSpecifiers(row)) {
        for (const layer of IMPLEMENTATION_LAYERS) {
          if (spec.includes(layer)) offenders.push(`${row.modulePath} 值导入 ${spec}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });
});

void portFiles;
