// SPDX-License-Identifier: Apache-2.0
// B4–B5 + K-v：I/O 分类（真 I/O vs 纯工具）与模块级副作用（冻结 + 记录技术债）。
//
// ⚠️ 与 services-03 的 purity 套件的本质差异：
//   services-03（domain 层）是**纯逻辑层** → 「无 I/O / 无 env / 无子进程」是合理的强约束；
//   services-04（app 层）是**编排层** → 它天然有 I/O（20/46 个文件 import node 模块，43.5%）。
//
// 所以这里不沿用「无 I/O」，改为两条可测的规则：
//   B4 = **真 I/O**（fs / child_process / net）的 import 只允许出现在白名单目录；
//        `node:path` / `node:os` / `node:util` / `node:crypto` 是**纯计算**，不限制。
//   B5 = 顶层 await 必须为 0；模块级 `const X = <调用>()` 逐条冻结（新增即失败）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import { frozen, scopeRows } from "./scope.mjs";
import { isDist, repoRoot } from "./entry.mjs";
import { ensureLoadable } from "./load-guard.mjs";

/** 真 I/O：会产生文件/进程/网络副作用。 */
const REAL_IO_MODULES = [
  "node:fs",
  "node:fs/promises",
  "node:child_process",
  "node:net",
  "node:http",
  "node:https",
  "node:dgram",
  "node:tls",
  "node:worker_threads",
];

/** 纯计算/纯工具：无副作用，不限制。 */
const PURE_NODE_MODULES = ["node:path", "node:os", "node:util", "node:crypto", "node:url"];

/**
 * 真 I/O 的目录白名单（实测：这 4 组共 20 个文件有 I/O，其中真 I/O 集中在这些组）。
 * `window-controller` 只 import `node:util`（纯工具），`usage-stats` 无 I/O —— 都不在白名单。
 */
const REAL_IO_ALLOWED_GROUPS = ["system", "subagents", "terminal", "."];

function stripCommentsAndStrings(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/(^|\n)\s*\/\/.*(?=\n|$)/gu, "$1")
    .replace(/"(?:[^"\\]|\\.)*"/gu, '""')
    .replace(/'(?:[^'\\]|\\.)*'/gu, "''")
    .replace(/`(?:[^`\\]|\\.)*`/gu, "``");
}

function readSource(row) {
  return readFileSync(join(repoRoot, row.path), "utf8");
}

/** 每个文件 import 的 node 模块（分真 I/O 与纯工具）。 */
function nodeImports() {
  const map = new Map();
  for (const row of scopeRows()) {
    const source = readSource(row);
    const real = new Set();
    const pure = new Set();
    for (const m of source.matchAll(/(?:^|\n)\s*(?:import|export)[^;]*?from\s+"([^"]+)"/gu)) {
      if (REAL_IO_MODULES.includes(m[1])) real.add(m[1]);
      else if (PURE_NODE_MODULES.includes(m[1])) pure.add(m[1]);
    }
    for (const m of source.matchAll(/require\s*\(\s*"([^"]+)"\s*\)/gu)) {
      if (REAL_IO_MODULES.includes(m[1])) real.add(m[1]);
    }
    if (real.size > 0 || pure.size > 0) {
      map.set(row.name, { real: [...real].sort(), pure: [...pure].sort() });
    }
  }
  return map;
}

describe(`purity（${isDist ? "dist" : "source"} 入口）`, () => {
  test("B0 全部 46 个实现文件必须可加载（运行期守卫前置）", async () => {
    await ensureLoadable();
  });

  test("B4a 真 I/O 的目录白名单：fs / child_process / net 只允许出现在 4 组内", async () => {
    await ensureLoadable();
    const violations = [];
    for (const [name, imports] of nodeImports()) {
      if (imports.real.length === 0) continue;
      const row = scopeRows().find((r) => r.name === name);
      const group = row?.group ?? "unknown";
      if (!REAL_IO_ALLOWED_GROUPS.includes(group)) {
        violations.push(`${name}（组 ${group}）import ${imports.real.join(", ")}`);
      }
    }
    assert.deepEqual(violations, [], `真 I/O 出现在白名单外的组：\n${violations.join("\n")}`);
  });

  test("B4b 纯工具模块不限制：node:path / os / util / crypto 可使用", async () => {
    await ensureLoadable();
    // 这条是**记录性断言**：说明为什么 20 个文件有 node 依赖但只有 17 个有真 I/O。
    const withPure = [...nodeImports().entries()].filter(([, i]) => i.pure.length > 0);
    assert(withPure.length >= 15, `应有 ≥15 个文件使用纯 node 工具模块，实际 ${withPure.length}`);
    // 确认纯工具集合的构成
    const pureModules = new Set(withPure.flatMap(([, i]) => i.pure));
    for (const mod of pureModules) {
      assert(PURE_NODE_MODULES.includes(mod), `意外的纯工具模块：${mod}`);
    }
  });

  test("B4c 真 I/O 的文件数与分布冻结（14 个真 I/O + 6 个纯工具）", async () => {
    await ensureLoadable();
    const map = nodeImports();
    const withReal = [...map.entries()].filter(([, i]) => i.real.length > 0).map(([n]) => n);
    const withPureOnly = [...map.entries()]
      .filter(([, i]) => i.real.length === 0 && i.pure.length > 0)
      .map(([n]) => n);

    assert.equal(
      withReal.length,
      FROZEN_REAL_IO_FILES.length,
      `真 I/O 文件数应为 ${FROZEN_REAL_IO_FILES.length}，实际 ${withReal.length}\n` +
        `实测清单：${withReal.slice().sort().join(", ")}`,
    );
    assert.deepEqual(withReal.slice().sort(), FROZEN_REAL_IO_FILES.slice().sort());

    assert.equal(
      withPureOnly.length,
      FROZEN_PURE_ONLY_FILES.length,
      `纯工具文件应为 ${FROZEN_PURE_ONLY_FILES.length} 个，实际 ${withPureOnly.length}`,
    );
    assert.deepEqual(withPureOnly.slice().sort(), FROZEN_PURE_ONLY_FILES.slice().sort());
  });

  test("B4d usage-stats 组零 I/O（最小组应保持最简）", async () => {
    await ensureLoadable();
    const map = nodeImports();
    for (const row of scopeRows().filter((r) => r.group === "usage-stats")) {
      const imports = map.get(row.name);
      assert(
        imports === undefined,
        `usage-stats 的 ${row.name} 不应有 node 依赖（实际 ${JSON.stringify(imports)}）`,
      );
    }
  });

  test("B5a 模块级副作用：顶层无 await（0 处）", async () => {
    await ensureLoadable();
    const offenders = [];
    for (const row of scopeRows()) {
      const code = stripCommentsAndStrings(readSource(row));
      if (/^await\s/mu.test(code)) offenders.push(row.name);
    }
    assert.deepEqual(offenders, [], `以下文件有顶层 await：\n${offenders.join("\n")}`);
  });

  test("B5b 模块级副作用：逐条冻结（6 处，新增即失败）", async () => {
    await ensureLoadable();
    const found = [];
    for (const row of scopeRows()) {
      const code = stripCommentsAndStrings(readSource(row));
      for (const m of code.matchAll(
        /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*([^;\n]+)/gmu,
      )) {
        const init = m[2].trim();
        const isFunction =
          /^(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/u.test(init) ||
          /^function\b/u.test(init);
        const isLiteral = /^(?:\d|true|false|null|undefined|\[|\{|"|'|`)/u.test(init);
        const isRegex = /^\//u.test(init);
        if (isFunction || isLiteral || isRegex) continue;
        if (/\bnew\s+[A-Z]|\b[A-Za-z0-9_$]+\s*\(/u.test(init)) found.push(`${row.name}#${m[1]}`);
      }
    }

    assert.deepEqual(
      found.slice().sort(),
      FROZEN_MODULE_SIDE_EFFECTS,
      `模块级副作用清单变了：\n` +
        `新增: ${found.filter((f) => !FROZEN_MODULE_SIDE_EFFECTS.includes(f)).join(", ") || "无"}\n` +
        `减少: ${FROZEN_MODULE_SIDE_EFFECTS.filter((f) => !found.includes(f)).join(", ") || "无"}`,
    );
  });

  test("B5c process.env 读取：冻结 8 个文件清单（新增即失败）", async () => {
    await ensureLoadable();
    const envFiles = [];
    for (const row of scopeRows()) {
      if (/process\s*\.\s*env/u.test(stripCommentsAndStrings(readSource(row)))) {
        envFiles.push(row.name);
      }
    }
    assert.deepEqual(
      envFiles.slice().sort(),
      FROZEN_ENV_FILES,
      `读 process.env 的文件清单变了：\n` +
        `新增: ${envFiles.filter((f) => !FROZEN_ENV_FILES.includes(f)).join(", ") || "无"}\n` +
        `减少: ${FROZEN_ENV_FILES.filter((f) => !envFiles.includes(f)).join(", ") || "无"}`,
    );
    assert.equal(FROZEN_ENV_FILES.length, 8);
  });

  test("B5d 技术债登记：dataLocationOwner.ts 的 3 处模块级 env 快照", async () => {
    await ensureLoadable();
    // 这是 K-v 记录的核心事实：该文件在 import 时就固化 env，
    // 导致「同一进程内改 env 无效」。替换阶段应改为注入式。
    const row = scopeRows().find((r) => r.name === "dataLocationOwner.ts");
    assert(row !== undefined, "dataLocationOwner.ts 应在 scope 内");
    const source = readSource(row);
    const matches = [...source.matchAll(/^const\s+(captured[A-Za-z0-9_$]+)\s*=/gmu)].map(
      (m) => m[1],
    );
    assert.deepEqual(
      matches.slice().sort(),
      ["capturedAppRoot", "capturedDataBase", "capturedDefaultBase"],
      `dataLocationOwner.ts 的模块级 env 快照应为这 3 个，实际：${matches.join(", ")}`,
    );
    // 这 3 个都必须读 process.env（证明它们是 env 快照而不是常量）
    for (const name of matches) {
      const decl = new RegExp(`^const\\s+${name}\\s*=\\s*([^;\\n]+)`, "mu").exec(source);
      assert(decl !== null, `${name} 应有声明`);
      assert(
        /process\s*\.\s*env/u.test(decl[1]),
        `${name} 应读 process.env（实际：${decl[1].slice(0, 60)}）`,
      );
    }
  });

  test("B6 无循环依赖（层内依赖图是 DAG）", async () => {
    await ensureLoadable();
    const adjacency = new Map();
    for (const edge of frozen().edgeList) {
      const [from, to] = edge.split("->");
      adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
    }

    const visiting = new Set();
    const visited = new Set();
    const cycles = [];

    function dfs(node, path) {
      if (visiting.has(node)) {
        cycles.push([...path, node].join(" → "));
        return;
      }
      if (visited.has(node)) return;
      visiting.add(node);
      for (const next of adjacency.get(node) ?? []) dfs(next, [...path, node]);
      visiting.delete(node);
      visited.add(node);
    }

    for (const node of adjacency.keys()) dfs(node, []);
    assert.deepEqual(cycles, [], `层内存在循环依赖：\n${cycles.join("\n")}`);
  });
});

// ── 冻结值（实测 2026-10-21，见 known-differences.md K-v）
/**
 * 有**真 I/O**（fs / fs\/promises / child_process / net）的 14 个文件。
 *
 * ⚠️ 从「46 个文件里 20 个 import node 模块」到「14 个真 I/O」的筛选过程：
 *   20 个里有 6 个只 import `node:path` / `os` / `util` / `crypto`（纯计算，无副作用），
 *   它们不算「真 I/O」。这个区分是我最初漏掉的（详见 K-v）。
 */
const FROZEN_REAL_IO_FILES = [
  "dataLocationOwner.ts",
  "subagents/subagentServiceFiles.ts",
  "subagents/subagentServicePlugins.ts",
  "subagents/subagentServiceState.ts",
  "subagents/subagentStorage.ts",
  "subagents/subagentsService.ts",
  "system/integratedTerminalShells.ts",
  "system/ssh-alias/configuration.ts",
  "system/ssh-alias/query.ts",
  "system/sshConfigAlias.ts",
  "system/system-probe/defaultAdapters.ts",
  "terminal/terminalProfile.ts",
  "terminal/terminalProfileMacOs.ts",
  "terminal/terminalService.ts",
];

/** 6 个只 import 纯工具模块的文件（`node:path` / `os` / `util` / `crypto`）。 */
const FROZEN_PURE_ONLY_FILES = [
  "paths.ts",
  "system/ssh-alias/tokens.ts",
  "system/systemServiceOwner.ts",
  "terminal/terminalProfilePortablePlan.ts",
  "terminal/terminalServiceLaunchPlan.ts",
  "window-controller/windowHostControllerProjection.ts",
];

/** 6 处模块级副作用（`const X = <调用>()`）。 */
const FROZEN_MODULE_SIDE_EFFECTS = [
  "dataLocationOwner.ts#capturedAppRoot",
  "dataLocationOwner.ts#capturedDataBase",
  "dataLocationOwner.ts#capturedDefaultBase",
  "subagents/subagentsService.ts#logger",
  "terminal/terminalProfile.ts#externalDetectors",
  "terminal/terminalService.ts#require",
];

/** 8 个读 process.env 的文件。 */
const FROZEN_ENV_FILES = [
  "dataLocationOwner.ts",
  "paths.ts",
  "subagents/subagentStorage.ts",
  "subagents/subagentsService.ts",
  "system/ssh-alias/query.ts",
  "system/systemServiceOwner.ts",
  "terminal/terminalProfile.ts",
  "terminal/terminalService.ts",
];
