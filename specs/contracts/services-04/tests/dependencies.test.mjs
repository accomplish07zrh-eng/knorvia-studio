// SPDX-License-Identifier: Apache-2.0
// B7–B8 + B10：层内依赖不扩大、依赖方向、被引用面守恒。
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import { frozen, scopeRows } from "./scope.mjs";
import { isDist, repoRoot } from "./entry.mjs";
import { ensureLoadable } from "./load-guard.mjs";

const SRC = "packages/services/src";

function readSource(row) {
  return readFileSync(join(repoRoot, row.path), "utf8");
}

/** 一个文件的所有 import/export-from 说明符。 */
function specifiersOf(source) {
  const out = [];
  for (const m of source.matchAll(/(?:^|\n)\s*(?:import|export)[^;]*?from\s+"([^"]+)"/gu)) {
    out.push(m[1]);
  }
  for (const m of source.matchAll(/(?:^|\n)\s*import\s+"([^"]+)"/gu)) out.push(m[1]);
  return out;
}

/** 把相对说明符归一化成「相对 packages/services/src」的模块名（去掉 .js）。 */
function resolveSpecifier(fromName, spec) {
  const fromDir = fromName.includes("/") ? fromName.slice(0, fromName.lastIndexOf("/")) : "";
  const parts = `${fromDir === "" ? "" : fromDir + "/"}${spec}`.split("/");
  const stack = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/").replace(/\.js$/u, "");
}

/** 实测层内依赖边（方向：from 依赖 to）。 */
function measuredEdges() {
  const names = new Set(scopeRows().map((r) => r.name.replace(/\.ts$/u, "")));
  const edges = new Set();
  for (const row of scopeRows()) {
    const from = row.name.replace(/\.ts$/u, "");
    for (const spec of specifiersOf(readSource(row))) {
      if (!spec.startsWith(".")) continue;
      const target = resolveSpecifier(from, spec);
      if (names.has(target) && target !== from) edges.add(`${from}->${target}`);
    }
  }
  return [...edges].sort();
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(join(repoRoot, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

describe(`dependencies（${isDist ? "dist" : "source"} 入口）`, () => {
  test("B0 全部 46 个实现文件必须可加载（运行期守卫前置）", async () => {
    await ensureLoadable();
  });

  test("B7 层内依赖不扩大：实测边 ⊆ 冻结的 64 条", () => {
    const declared = new Set(frozen().edgeList);
    assert.equal(declared.size, 64, "冻结的层内依赖边应为 64 条");

    const measured = new Set(measuredEdges());
    const added = [...measured].filter((e) => !declared.has(e));
    const removed = [...declared].filter((e) => !measured.has(e));

    assert.deepEqual(added, [], `层内依赖新增了边（需重新审合同）：${added.join(", ")}`);
    assert.deepEqual(removed, [], `层内依赖减少了边（合同需更新）：${removed.join(", ")}`);
  });

  test("B7 层内依赖拓扑：汇聚点与叶子数量守恒", () => {
    const names = scopeRows().map((r) => r.name.replace(/\.ts$/u, ""));
    const inDeg = new Map(names.map((n) => [n, 0]));
    const outDeg = new Map(names.map((n) => [n, 0]));
    for (const edge of measuredEdges()) {
      const [from, to] = edge.split("->");
      inDeg.set(to, (inDeg.get(to) ?? 0) + 1);
      outDeg.set(from, (outDeg.get(from) ?? 0) + 1);
    }

    const hubs = [...inDeg.entries()].filter(([, c]) => c >= 2).map(([n]) => n).sort();
    const leaves = [...outDeg.entries()].filter(([, c]) => c === 0).map(([n]) => n).sort();

    assert.equal(hubs.length, 18, `汇聚点（入度≥2）应为 18 个，实际 ${hubs.length}`);
    assert.equal(leaves.length, 16, `叶子（无层内依赖）应为 16 个，实际 ${leaves.length}`);

    // 入度最高的是两个并列的 6：descriptors 与 terminal/terminalProfileTypes
    const top = [...inDeg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
    assert.deepEqual(
      top.map(([n, c]) => `${n}:${c}`).sort(),
      ["descriptors:6", "terminal/terminalProfileTypes:6"],
      `入度最高的两个应为 descriptors(6) 与 terminal/terminalProfileTypes(6)，实际 ${top.map(([n, c]) => `${n}:${c}`).join(", ")}`,
    );
  });

  test("B8 依赖方向：46 个文件不 import adapters/ 或 studio-runtime/adapters/", () => {
    const violations = [];
    for (const row of scopeRows()) {
      for (const spec of specifiersOf(readSource(row))) {
        if (spec.includes("/adapters/") || spec.includes("studio-runtime/adapters/")) {
          violations.push(`${row.name} -> ${spec}`);
        }
      }
    }
    assert.deepEqual(violations, [], `出现向上依赖：\n${violations.join("\n")}`);
  });

  test("B8 跨包依赖：实际只有 3 个目标目录（agent 3 / session 4 / setting 1）", () => {
    // services-04 在分层里向下依赖更早的包：
    //   · `agent/` → services-01
    //   · `session/`、`setting/` → services-03
    // 实测只有这 3 个目录，共 8 处。**新增跨到第 4 个目录即失败**（需重新审合同）。
    const FROZEN_CROSS_GROUP = ["agent", "session", "setting"];
    const FROZEN_CROSS_COUNT = { agent: 3, session: 4, setting: 1 };

    const counts = {};
    const violations = [];
    for (const row of scopeRows()) {
      for (const spec of specifiersOf(readSource(row))) {
        if (!spec.startsWith("../")) continue;
        const m = /^\.\.\/([A-Za-z0-9_-]+)\//u.exec(spec);
        if (!m) continue;
        const topDir = m[1];
        counts[topDir] = (counts[topDir] ?? 0) + 1;
        if (!FROZEN_CROSS_GROUP.includes(topDir)) {
          violations.push(`${row.name} -> ${spec}（跨到未登记的 ${topDir}）`);
        }
      }
    }

    assert.deepEqual(violations, [], `出现未登记的跨组依赖：\n${violations.join("\n")}`);
    assert.deepEqual(counts, FROZEN_CROSS_COUNT, `跨组依赖计数变了：${JSON.stringify(counts)}`);
    assert.equal(
      Object.values(counts).reduce((a, b) => a + b, 0),
      8,
      "跨组依赖总计应为 8 处",
    );
  });

  test("B10 被引用面守恒：口径 A（直接引用）18 处，按层正确", () => {
    const callers = JSON.parse(
      readFileSync(join(repoRoot, "specs/contracts/services-04/callers-summary.json"), "utf8"),
    );
    assert.equal(callers.grandTotal, 18, `直接外部引用应为 18 处，实际 ${callers.grandTotal}`);
    assert.deepEqual(callers.byBucket, {
      "services/test": 15,
      "packages/desktop": 3,
    });

    // 有直接外部引用的模块恰好 8 个
    const used = callers.perModule.filter((m) => m.total > 0).map((m) => m.name).sort();
    assert.deepEqual(used, [
      "descriptors",
      "paths",
      "storage-startup",
      "subagents/subagentStorage",
      "system/integratedTerminalShells",
      "terminal/terminal",
      "terminal/terminalProfileTypes",
      "usage-stats/usageStatsService",
    ]);
  });

  test("B10 被引用面守恒：口径 B（经聚合桶）379 个文件", () => {
    const callers = JSON.parse(
      readFileSync(join(repoRoot, "specs/contracts/services-04/callers-summary.json"), "utf8"),
    );
    assert(callers.barrel !== undefined, "callers-summary 应含 barrel 统计");
    const total = callers.barrel.main + callers.barrel.nodeEntry;
    assert(total >= 370 && total <= 390, `经聚合桶使用的文件数应在 370–390，实际 ${total}`);
    assert.equal(callers.barrel.main, 345, `@knorvia/services 应为 345，实际 ${callers.barrel.main}`);
    assert.equal(callers.barrel.nodeEntry, 34, `@knorvia/services/node 应为 34，实际 ${callers.barrel.nodeEntry}`);
  });

  test("B10 零直接引用的模块：38 个，且全部经聚合桶或层内依赖被使用（0 死代码）", () => {
    const callers = JSON.parse(
      readFileSync(join(repoRoot, "specs/contracts/services-04/callers-summary.json"), "utf8"),
    );
    const zero = callers.perModule.filter((m) => m.total === 0);
    assert.equal(zero.length, 38, `零直接引用模块应为 38 个，实际 ${zero.length}`);

    // 这些模块都必须通过聚合桶或层内依赖被使用（不是死代码）
    const forwarded = new Set();
    for (const barrel of ["index.ts", "node.ts"]) {
      const source = readFileSync(join(repoRoot, SRC, barrel), "utf8");
      for (const m of source.matchAll(/from\s+"\.\/([^"]+)\.js"/gu)) forwarded.add(m[1]);
    }
    const internallyUsed = new Set();
    for (const edge of frozen().edgeList) internallyUsed.add(edge.split("->")[1]);

    const unproven = zero
      .filter((m) => !forwarded.has(m.name) && !internallyUsed.has(m.name))
      .map((m) => m.name);

    // ⚠️ 实测有 1 个模块在两种证明下都拿不到：`window-controller/node`。
    // 它是**子聚合桶**（5 行，纯 `export ... from` 转发 3 个实现文件），
    // 本身不是实现（与包级 `index.ts`/`node.ts` 同类），全仓零引用。
    // 详见 `known-differences.md` K-w：这是「惰性公开入口」—— 不是死代码，
    // 但当前没有任何消费者，属**未接线**状态。如实记录，不删除、不放宽。
    assert.deepEqual(
      unproven,
      ["window-controller/node"],
      `零引用模块的存活证明结果变了（新增未证明的：${unproven.join(", ")}）`,
    );

    // 前两项证明的覆盖数（实测：11 经转发、30 被层内依赖，有重叠）
    const forwardedCount = zero.filter((m) => forwarded.has(m.name)).length;
    const internalCount = zero.filter((m) => internallyUsed.has(m.name)).length;
    assert.equal(forwardedCount, 11, `经聚合桶转发的应为 11 个，实际 ${forwardedCount}`);
    assert.equal(internalCount, 30, `被层内依赖的应为 30 个，实际 ${internalCount}`);
  });

  test("B10 子聚合桶 `window-controller/node.ts` 的性质（K-w）", () => {
    const source = readFileSync(join(repoRoot, SRC, "window-controller/node.ts"), "utf8");

    // ① 它是纯转发（无实现）：所有非空、非注释行都属于转发语句的组成部分
    //    允许的行形态：
    //      · `export { X } from "./y.js";`            （单行转发）
    //      · `export {` / `export type {`              （跨行转发开头）
    //      · `X,` / `X`                                （跨行块内的名字）
    //      · `} from "./y.js";`                        （跨行转发收尾）
    //    任何其他形态（变量声明、函数/类定义、表达式语句）都是实现代码 → 失败
    const codeLines = source
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("//"));
    const nonForwardLines = codeLines.filter(
      (line) =>
        !/^export\s+(?:type\s+)?(?:\{[\s\S]*\}\s*from\s*"[^"]+";|)$/u.test(line) &&
        !/^export\s+(?:type\s+)?\{$/u.test(line) &&
        !/^\}\s*from\s*"[^"]+";$/u.test(line) &&
        !/^[A-Za-z0-9_$]+,?$/u.test(line),
    );
    assert.deepEqual(
      nonForwardLines,
      [],
      `window-controller/node.ts 应是纯转发，但发现这些行：${nonForwardLines.join(" | ")}`,
    );

    // ② 它转发 3 个实现文件
    const distinct = [...new Set([...source.matchAll(/from\s+"\.\/([^"]+)\.js"/gu)].map((m) => m[1]))];
    assert.deepEqual(distinct.slice().sort(), [
      "windowHostControllerProjection",
      "windowHostControllerService",
      "windowHostSessionsIndexObserver",
    ]);

    // ③ 它转发的这 3 个实现文件本身都在 scope 内（证明它转发的是本包实现，不是外部符号）
    for (const target of distinct) {
      const row = scopeRows().find((r) => r.name === `window-controller/${target}.ts`);
      assert(row !== undefined, `window-controller/node.ts 转发的 ${target} 应在 scope 内`);
    }
  });

  test("B10 最重的 6 个模块签名不变（可加载 + 导出数一致）", async () => {
    const heaviest = [
      { name: "window-controller/windowHostControllerService", exports: 1 },
      { name: "window-controller/windowHostControllerProjection", exports: 5 },
      { name: "window-controller/windowHostSessionsIndexObserver", exports: 2 },
      { name: "subagents/subagentMarkdown", exports: 2 },
      { name: "terminal/terminalServiceInstanceOwner", exports: 1 },
      { name: "terminal/terminalService", exports: 1 },
    ];
    const { loadDeclaredExports } = await import("./runtime-guard.mjs");
    for (const item of heaviest) {
      const row = scopeRows().find((r) => r.name === `${item.name}.ts`);
      assert(row !== undefined, `${item.name} 应在 scope 内`);
      const { loaded, exports } = await loadDeclaredExports(row);
      assert.equal(typeof loaded, "object", `${item.name} 应可加载`);
      assert.equal(exports.length, item.exports, `${item.name} 导出数应为 ${item.exports}，实际 ${exports.length}`);
      for (const entry of exports.filter((e) => e.runtime)) {
        assert(entry.name in loaded, `${item.name} 的运行时导出 ${entry.name} 应可用`);
      }
    }
  });
});
