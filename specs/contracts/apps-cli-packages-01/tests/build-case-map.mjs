// SPDX-License-Identifier: Apache-2.0
// 从 behavior.md 的 B 条目与 tests/*.test.ts 的用例名生成 README 的「条目 → 测试」对照表。
// 用例名里出现的 B 编号/区间（如 B28、B3–B13、B11/B12/B13、B130/B131）都会登记到对应条目。
//
// 用法（仓库根目录）：node specs/contracts/apps-cli-packages-01/tests/build-case-map.mjs [--check]
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const testsDir = join(here);

const behavior = await readFile(join(contractDir, "behavior.md"), "utf8");
const itemIds = [...behavior.matchAll(/^### B(\d+)\b/gmu)]
  .map((match) => Number(match[1]))
  .sort((a, b) => a - b);

const testFiles = (await readdir(testsDir)).filter((name) => name.endsWith(".test.ts")).sort();
const cases = [];
for (const file of testFiles) {
  const source = await readFile(join(testsDir, file), "utf8");
  for (const match of source.matchAll(/test\(\s*"([^"]+)"/gu))
    cases.push({ file: `tests/${file}`, name: match[1] });
}

/** 从一个用例名里取出它覆盖的 B 条目编号。 */
function covered(name) {
  const numbers = new Set();
  const head = name.split(/[:：]/u)[0];
  for (const part of head.split(/\s+/u)) {
    const range = /^B(\d+)[–-]B?(\d+)$/u.exec(part);
    if (range) {
      for (let value = Number(range[1]); value <= Number(range[2]); value += 1) numbers.add(value);
      continue;
    }
    for (const single of part.matchAll(/B(\d+)/gu)) numbers.add(Number(single[1]));
  }
  return [...numbers];
}

const rows = [];
const missing = [];
for (const id of itemIds) {
  const matches = cases.filter((entry) => covered(entry.name).includes(id));
  if (matches.length === 0) {
    missing.push(id);
    rows.push(`| B${id} | — | **缺用例** |`);
    continue;
  }
  const primary = matches[0];
  const extra = matches.length > 1 ? `（另有 ${matches.length - 1} 处）` : "";
  rows.push(
    `| B${id} | [${primary.file}](./${primary.file.replace("tests/", "tests/")}) | ${primary.name}${extra} |`,
  );
}

const table = ["| 条目 | 测试文件 | 用例 |", "| ---- | -------- | ---- |", ...rows].join("\n");

const readmePath = join(contractDir, "README.md");
const readme = await readFile(readmePath, "utf8");
const START = "<!-- CASE-MAP:START -->";
const END = "<!-- CASE-MAP:END -->";
if (!readme.includes(START) || !readme.includes(END)) throw new Error("README 缺少 CASE-MAP 标记");
const next = readme.replace(
  new RegExp(`${START}[\\s\\S]*?${END}`, "u"),
  `${START}\n${table}\n${END}`,
);

if (process.argv.includes("--check")) {
  if (missing.length > 0) {
    console.error(`有 ${missing.length} 条合同条目没有用例：B${missing.join(", B")}`);
    process.exit(1);
  }
  // 表格对齐用的填充空白、分隔行的横线长度、以及 Markdown 转义（oxfmt 会把 `*` 写成 `\*`）
  // 都不算差异：按「每行单元格的语义内容」比较，既保住完整性检查，也不与格式化工具打架。
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
    console.error("README 的对照表与当前用例不一致，请重跑 build-case-map.mjs");
    process.exit(1);
  }
  console.log(`对照表完整：${itemIds.length} 条合同条目，${cases.length} 个用例`);
} else {
  await writeFile(readmePath, next, "utf8");
  console.log(
    `写入 ${itemIds.length} 行对照表；缺用例 ${missing.length} 条${missing.length ? `：B${missing.join(", B")}` : ""}`,
  );
  process.exitCode = missing.length > 0 ? 1 : 0;
}
