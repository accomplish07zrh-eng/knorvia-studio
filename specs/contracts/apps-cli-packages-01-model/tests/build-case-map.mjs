// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01-model 条目 → 测试对照表生成器（README 第八节 CASE-MAP 块）。
// 每个 B 条目必须至少命中一个用例名，否则 --check 退出码 1（防止对照表出现空行）。
//
// 用法：node specs/contracts/apps-cli-packages-01-model/tests/build-case-map.mjs [--check]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const behavior = readFileSync(join(contractDir, "behavior.md"), "utf8");
const readmePath = join(contractDir, "README.md");

const entries = [...behavior.matchAll(/^### (B\d+)\b/gmu)].map((match) => match[1]);
const cases = [];
for (const name of readdirSync(here)
  .filter((entry) => entry.endsWith(".test.ts"))
  .sort()) {
  const text = readFileSync(join(here, name), "utf8");
  for (const match of text.matchAll(/\btest\(\s*"([^"]+)"/gu)) {
    const covered = new Set();
    for (const token of match[1].matchAll(/B(\d+)(?:[–-]B?(\d+))?/gu)) {
      const from = Number(token[1]);
      const to = token[2] ? Number(token[2]) : from;
      for (let value = from; value <= to; value += 1) covered.add(`B${value}`);
    }
    cases.push({ file: `tests/${name}`, name: match[1], covered: [...covered] });
  }
}

const rows = [];
const missing = [];
for (const entry of entries) {
  const hits = cases.filter((testCase) => testCase.covered.includes(entry));
  if (!hits.length) {
    missing.push(entry);
    continue;
  }
  for (const [index, hit] of hits.entries()) {
    rows.push(
      `| ${entry} | [${hit.file}](./${hit.file}) | ${hit.name}${index ? "（另有用例）" : ""} |`,
    );
  }
}

const block = ["| 条目 | 测试文件 | 用例 |", "| ---- | -------- | ---- |", ...rows].join("\n");
const readme = readFileSync(readmePath, "utf8");
const start = "<!-- CASE-MAP:START -->";
const end = "<!-- CASE-MAP:END -->";
const startIndex = readme.indexOf(start);
const endIndex = readme.indexOf(end);
if (startIndex < 0 || endIndex < 0) throw new Error("README 缺少 CASE-MAP 标记块");
const next =
  readme.slice(0, startIndex + start.length) + "\n\n" + block + "\n\n" + readme.slice(endIndex);

if (missing.length) {
  process.stderr.write(`build-case-map: 缺少用例的条目: ${missing.join(", ")}\n`);
}
if (process.argv.includes("--check")) {
  // 表格对齐填充、分隔行横线长度、Markdown 转义（oxfmt 会把 `*` 写成 `\*`）不算差异：
  // 按「每行单元格的语义内容」比较（与 apps-cli-packages-01 的同名工具同口径）。
  const unescapeCell = (cell) => cell.trim().replace(/\\([\\`*_{}[\]()#+\-.!|])/gu, "$1");
  const tableRows = (text) =>
    text
      .split("\n")
      .filter((line) => line.trimStart().startsWith("|"))
      .map((line) => {
        const cells = line
          .trim()
          .replace(/^\||\|$/gu, "")
          .split("|")
          .map(unescapeCell);
        const separator = cells.every((cell) => /^-{2,}$/u.test(cell));
        return separator ? cells.map(() => "---").join(" | ") : cells.join(" | ");
      });
  const expectedRows = tableRows(next);
  const actualRows = tableRows(readme);
  if (
    expectedRows.length !== actualRows.length ||
    expectedRows.some((row, index) => row !== actualRows[index])
  ) {
    process.stderr.write("build-case-map: README 对照表已落后，请重新生成\n");
    process.exit(1);
  }
  if (missing.length) process.exit(1);
  process.stdout.write(
    `build-case-map: 对照表完整：${entries.length} 个条目 / ${cases.length} 个用例\n`,
  );
} else {
  writeFileSync(readmePath, next, "utf8");
  process.stdout.write(
    `build-case-map: ${entries.length} 个条目 / ${rows.length} 行已写入 README\n`,
  );
  if (missing.length) process.exit(1);
}
