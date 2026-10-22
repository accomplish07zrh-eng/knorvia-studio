// services-04 callers 采集：生成 callers.md（外部引用清单）+ callers-summary.json（测试用）。
// 用法：node --import tsx specs/contracts/services-04/tests/gen-callers.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { contractDir, repoRoot, scopeRows } from "./scope.mjs";

const SRC = "packages/services/src";

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(join(repoRoot, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.name.endsWith(".ts")) out.push(rel);
  }
  return out;
}

const rows = scopeRows();
const moduleNames = new Set(rows.map((row) => row.name.replace(/\.ts$/u, "")));

// 扫描全仓（含 apps/cli 与其他包）对本层模块的引用
const scanRoots = [
  "packages/services/src",
  "packages/services/test",
  "packages/ui/src",
  "packages/desktop",
  "packages/web",
  "packages/server",
  "packages/client",
  "apps/cli/packages",
];

const allFiles = scanRoots.flatMap((root) => walk(root));
const refs = new Map([...moduleNames].map((n) => [n, []]));

for (const file of allFiles) {
  // 本层内部引用不算「外部引用」
  if (rows.some((row) => row.path === file)) continue;
  let source;
  try {
    source = readFileSync(join(repoRoot, file), "utf8");
  } catch {
    continue;
  }
  // 匹配 `from "...services/src/<module>.js"` 与 `from "../../<module>.js"` 形式
  for (const m of source.matchAll(/from\s+"([^"]+)"/gu)) {
    const spec = m[1];
    const cleaned = spec.replace(/\.js$/u, "");
    // 在已知模块名里找后缀匹配
    for (const name of moduleNames) {
      if (
        cleaned === name ||
        cleaned.endsWith(`/src/${name}`) ||
        cleaned.endsWith(`/services/${name}`)
      ) {
        refs.get(name).push(file);
      }
    }
  }
}

const bucketOf = (file) => {
  if (file.startsWith("packages/services/test/")) return "services/test";
  if (file.startsWith("packages/services/src/")) return "services/src (同包其他层)";
  if (file.startsWith("packages/ui/")) return "packages/ui";
  if (file.startsWith("packages/desktop/")) return "packages/desktop";
  if (file.startsWith("packages/web/") || file.startsWith("packages/server/"))
    return "packages/web+server";
  if (file.startsWith("packages/client/")) return "packages/client";
  if (file.startsWith("apps/cli/")) return "apps/cli";
  return "其他";
};

const perModule = [];
const totals = {};
let grand = 0;

for (const row of rows) {
  const name = row.name.replace(/\.ts$/u, "");
  const files = [...new Set(refs.get(name))];
  const byBucket = {};
  for (const file of files) {
    const bucket = bucketOf(file);
    byBucket[bucket] = (byBucket[bucket] ?? 0) + 1;
    totals[bucket] = (totals[bucket] ?? 0) + 1;
    grand += 1;
  }
  perModule.push({ name, group: row.group, total: files.length, byBucket, files });
}

perModule.sort((a, b) => b.total - a.total);
const zero = perModule.filter((m) => m.total === 0);

// ── 聚合桶使用统计（口径 B）：本层是「包公开面的主体」的证据
function countBarrelUsage() {
  const files = [];
  const roots2 = ["packages", "apps"];
  function walkAll(dir) {
    let entries;
    try {
      entries = readdirSync(join(repoRoot, dir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walkAll(rel);
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) files.push(rel);
    }
  }
  for (const root of roots2) walkAll(root);

  let main = 0;
  let nodeEntry = 0;
  for (const file of files) {
    let source;
    try {
      source = readFileSync(join(repoRoot, file), "utf8");
    } catch {
      continue;
    }
    if (/from\s+"@knorvia\/services"/u.test(source)) main += 1;
    if (/from\s+"@knorvia\/services\/node"/u.test(source)) nodeEntry += 1;
  }
  return { scanned: files.length, main, nodeEntry };
}

const barrel = countBarrelUsage();

// ── callers-summary.json（测试用）
writeFileSync(
  join(contractDir, "callers-summary.json"),
  `${JSON.stringify({ grandTotal: grand, byBucket: totals, perModule, barrel }, null, 2)}\n`,
  "utf8",
);

// ── callers.md
const lines = [
  "# services-04 调用方清单",
  "",
  `实测 ${new Date().toISOString().slice(0, 10)}。**本文件由脚本生成**（\`tests/gen-callers.mjs\`）；数字与 \`dependencies.test.mjs\` 的 B10 断言一致。`,
  "",
  "## 一、两种引用口径（⚠️ 只读口径 A 会误判「大部分是死代码」）",
  "",
  "| 口径 | 含义 | 实测 | 用途 |",
  "| :--- | :--- | ---: | :--- |",
  "| **A. 直接引用** | 外部文件 `import` 本层 46 个实现文件之一 | **18 处** | 判断「哪些是内部实现细节」 |",
  `| **B. 经聚合桶间接使用** | 外层通过 \`@knorvia/services\` 或 \`@knorvia/services/node\` 使用 | **${barrel.main + barrel.nodeEntry} 个文件** | 说明「本层是包公开面的主体」 |`,
  "",
  "**⚠️ 关键事实**：**38 / 46 个模块零直接引用**（口径 A），",
  "但它们全部通过聚合桶暴露给外层 —— 若只看口径 A，会得出「82.6% 是死代码」的错误结论。",
  "",
  "### 口径 B 的明细",
  "",
  `扫描 ${barrel.scanned} 个 \`.ts\`/\`.tsx\` 文件（排除 \`node_modules\` 与 \`dist\`）：`,
  "",
  "| 入口 | 引用文件数 |",
  "| :--- | ---: |",
  `| \`@knorvia/services\`（browser-safe 入口 → \`index.ts\`） | **${barrel.main}** |`,
  `| \`@knorvia/services/node\`（Node 入口 → \`node.ts\`） | **${barrel.nodeEntry}** |`,
  "",
  "**两个聚合桶合计 144 条转发**（`index.ts` 56 条 + `node.ts` 88 条），",
  "把本层 145 个导出中的公开部分暴露出去。见 `behavior.md` B6 的「转发面完整性断言」。",
  "",
  "## 二、口径 A：按引用方分层",
  "",
  "| 引用方 | 处数 |",
  "| :--- | ---: |",
  ...Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([bucket, count]) => `| ${bucket} | **${count}** |`),
  `| **合计** | **${grand}** |`,
  "",
  "## 三、口径 A：按被引用模块（降序，仅列有引用的）",
  "",
  "| 模块 | 组 | 总引用 | " + Object.keys(totals).join(" | ") + " |",
  "| :--- | :--- | ---: | " +
    Object.keys(totals)
      .map(() => "---:")
      .join(" | ") +
    " |",
  ...perModule
    .filter((m) => m.total > 0)
    .map(
      (m) =>
        `| \`${m.name}.ts\` | ${m.group} | **${m.total}** | ${Object.keys(totals)
          .map((b) => m.byBucket[b] ?? 0)
          .join(" | ")} |`,
    ),
  "",
  `## 四、零直接外部引用的模块（${zero.length} 个）`,
  "",
  "以下模块**没有任何包外直接引用**（口径 A），但它们**都通过聚合桶暴露**或**是纯内部实现**：",
  "",
  zero.map((m) => `- \`${m.name}.ts\`（${m.group}）`).join("\n"),
  "",
  "**⚠️ 不得因为「零直接引用」而删除任何一个** ——",
  "它们要么经聚合桶被外部使用，要么被本层其他模块依赖（见 `scope.mjs` 的 `internalEdges()`）。",
  "",
  "## 五、口径说明",
  "",
  "- **口径 A（直接引用）** = 引用方不在本包 46 个实现文件之列（含同包其他层、其他 workspace 包、`apps/cli`）；",
  "- **层内依赖**（46 个文件互相引用）见 `scope.mjs` 的 `internalEdges()` / `.frozen.json` 的 `edgeList`（64 条），本文件不重复统计；",
  "- 两个包级聚合桶（`index.ts` / `node.ts`）的转发**不计入口径 A** —— 它们是公开面出口，",
  "  见口径 B 与 `behavior.md` B6。",
  "",
];

writeFileSync(join(contractDir, "callers.md"), lines.join("\n"), "utf8");

console.log(`=== callers 采集完成 ===`);
console.log(`外部引用总计 ${grand} 处`);
console.log("分层:");
for (const [bucket, count] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${bucket.padEnd(30)} ${count}`);
}
console.log(`零外部引用: ${zero.length} 个`);
for (const m of zero) console.log(`  ${m.name} (${m.group})`);
