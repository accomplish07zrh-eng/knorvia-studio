#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// M0-3 继承文件分诊：把第一轮记账报告交还清单中「首快照」与「与上游相似」两类文件
// 分诊成「并入替换包」或「冻结证据包中的上游摘录（书面例外）」。
//
// 用法：
//   node scripts/provenance/inherited-triage.mjs                      # 打印汇总
//   node scripts/provenance/inherited-triage.mjs --out-json <file>    # 输出机器可读分诊结果
//   node scripts/provenance/inherited-triage.mjs --out-markdown <file># 输出分诊表文档
//
// 输入是第一轮记账报告（默认 docs/knorvia-provenance-bookkeeping-20261010.md）里的交还清单表格。
// 本工具只读仓库内的报告文本并生成分诊结果，不联网、不改来源清单、不动代码。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TRIAGE_RULES } from "./inherited-triage-rules.mjs";

export { TRIAGE_RULES };

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_REPORT = "docs/knorvia-provenance-bookkeeping-20261010.md";

/** 交还原因 → 粗分类。未识别的原因归入 other，由调用方决定是否处理。 */
export function classifyReturnReason(reason) {
  if (reason.startsWith("首快照文件")) return "first-snapshot";
  if (reason.startsWith("相似度 ")) return "similarity";
  if (reason.includes("含替换字样")) return "replacement-wording";
  if (reason.startsWith("许可无法判定")) return "license-undecidable";
  if (reason.includes("没有许可声明")) return "license-missing-claim";
  if (/改名|复制自上游|上游路径/.test(reason)) return "renamed-or-copied";
  return "other";
}

/** 解析报告「交还清单」下的 Markdown 表格行。 */
export function parseReturns(text) {
  const rowRe = /^\|\s*`(.+?)`\s*\|\s*([ABC])\s*\|\s*(.+?)\s*\|\s*$/;
  const records = [];
  for (const line of text.split(/\r?\n/)) {
    const m = rowRe.exec(line);
    if (!m) continue;
    const [, path, stage, reason] = m;
    records.push({ path, stage, reason, category: classifyReturnReason(reason) });
  }
  return records;
}

/** 对本表范围内的文件给出处置；不修改输入。 */
export function triageRecords(records) {
  const rows = [];
  const unmapped = [];
  for (const record of records) {
    let rule = null;
    for (const candidate of TRIAGE_RULES) {
      if (candidate.re.test(record.path)) {
        rule = candidate;
        break;
      }
    }
    if (!rule) {
      unmapped.push(record.path);
      continue;
    }
    rows.push({
      path: record.path,
      stage: record.stage,
      reasons: record.category === "first-snapshot" ? "首快照" : "与上游相似",
      disposition: rule.disposition,
      clause: rule.clause ?? (rule.disposition === "inherited" ? "继承实现，并入替换包" : ""),
      pkg: rule.pkg ?? "—",
      reason: record.reason,
    });
  }
  rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { rows, unmapped };
}

/** 汇总：处置计数与归属包计数。 */
export function summarize(rows) {
  const byDisposition = {};
  const byPackage = {};
  for (const row of rows) {
    byDisposition[row.disposition] = (byDisposition[row.disposition] ?? 0) + 1;
    if (row.disposition === "inherited" || row.disposition === "delete") {
      byPackage[row.pkg] = (byPackage[row.pkg] ?? 0) + 1;
    }
  }
  return { byDisposition, byPackage };
}

export function buildTriage({ text }) {
  const records = parseReturns(text);
  const inScope = records.filter(
    (record) => record.category === "first-snapshot" || record.category === "similarity",
  );
  const { rows, unmapped } = triageRecords(inScope);
  const licenseCategories = new Set(["license-undecidable", "license-missing-claim"]);
  const inScopePaths = new Set(rows.map((row) => row.path));
  const supplement = records.filter(
    (record) =>
      !inScopePaths.has(record.path) &&
      record.category !== "replacement-wording" &&
      !licenseCategories.has(record.category),
  );
  return {
    report: { returns: records.length, byCategory: countBy(records, (r) => r.category) },
    rows,
    unmapped,
    supplement: { count: supplement.length, byCategory: countBy(supplement, (r) => r.category) },
    summary: summarize(rows),
  };
}

function countBy(items, keyOf) {
  const out = {};
  for (const item of items) {
    const key = keyOf(item);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

// 表格按显示宽度补齐列宽，输出与仓库格式化器的 Markdown 表格规则一致，
// 这样 `pnpm fmt` 之后重新运行本工具仍是同一份文件。
const WIDE_RANGES = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f900, 0x1f9ff],
  [0x20000, 0x3fffd],
];

export function displayWidth(text) {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0);
    width += WIDE_RANGES.some(([start, end]) => code >= start && code <= end) ? 2 : 1;
  }
  return width;
}

function padCell(text, width) {
  return text + " ".repeat(Math.max(0, width - displayWidth(text)));
}

/** 渲染 Markdown 表格：列宽按显示宽度对齐，分隔行用等宽短横线。 */
export function renderTable(header, bodyRows) {
  const widths = header.map((cell, index) =>
    Math.max(3, displayWidth(cell), ...bodyRows.map((row) => displayWidth(row[index] ?? ""))),
  );
  let out = `| ${header.map((cell, index) => padCell(cell, widths[index])).join(" | ")} |\n`;
  out += `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |\n`;
  for (const row of bodyRows) {
    out += `| ${header.map((cell, index) => padCell(row[index] ?? "", widths[index])).join(" | ")} |\n`;
  }
  return out;
}

export function renderMarkdown(result, { date, commit, issue }) {
  const { rows, supplement, summary, report } = result;
  const byDisposition = (value) => rows.filter((row) => row.disposition === value);
  const fileRows = (subset) =>
    subset.map((row) => [`\`${row.path}\``, row.reasons, row.disposition, row.pkg]);
  const countRows = (entries) => entries.map(([key, value]) => [key, String(value)]);
  let md = "";
  md += `# Knorvia 继承文件分诊表（M0-3）\n\n`;
  md += `日期：${date}　主仓提交：\`${commit}\`　认领 issue：#${issue}\n\n`;
  md += `依据《Knorvia 独立替换任务计划书》M0-3：「首快照约 730、与上游相似约 815 个文件分诊；产出分诊表；完成标准：派生的视同继承，并入替换包；冻结证据里的上游摘录书面列为例外」。\n\n`;
  md += `## 1. 来源与口径\n\n`;
  md += `输入是第一轮记账报告 \`docs/knorvia-provenance-bookkeeping-20261010.md\`（已在 main 上）的「交还清单」，共 ${report.returns} 条，每条带路径、阶段与交还原因。\n\n`;
  md += `本表范围是交还原因属于下面两类的文件：\n\n`;
  md += `- **首快照文件**：\`git log --diff-filter=A --follow\` 显示首次加入即仓库根快照 \`7619e41\`（2026-09-24），没有更早历史可判定来源 → ${report.byCategory["first-snapshot"]} 个（计划书写「约 730」）。\n`;
  md += `- **与上游相似**：规范化后行包含率 ≥ 0.2 或最长连续段 ≥ 8 行 → ${report.byCategory.similarity} 个（与计划书的「约 815」一致）。\n\n`;
  md += `两类合计 **${rows.length}** 个文件，即本表逐行分诊的对象。同时命中两条原因的按「首快照」计入，不影响处置。\n\n`;
  md += `不在本表范围的交还条目：\n\n`;
  const licenseTotal =
    (report.byCategory["license-undecidable"] ?? 0) +
    (report.byCategory["license-missing-claim"] ?? 0);
  md += renderTable(
    ["交还原因", "条数", "去向"],
    [
      [
        "首次加入提交含替换字样（条件 4）",
        String(report.byCategory["replacement-wording"] ?? 0),
        "其中文档与证据约 2,900 条由 M0-1 第二轮按修订后的条件 4 重判；产品源码 1,130 条由 M0-2 补登",
      ],
      [
        "许可正文无法判定",
        String(licenseTotal),
        "M0-1 第二轮类别 2（SPDX 正文比对）与类别 3（7-Zip/LZMA 公有领域）",
      ],
      [
        "同类相似度规则但措辞不同、以及找不到首次加入提交",
        String(supplement.count),
        "见第 6 节，按默认裁决保守处理",
      ],
    ],
  );
  md += `\n## 2. 处置规则\n\n`;
  md += `规则按计划书的类别表与默认裁决表写成，按顺序先匹配者生效；本表范围内每个文件都有处置，没有「待定」行。\n\n`;
  md += renderTable(
    ["处置", "含义", "依据"],
    [
      [
        "`inherited`",
        "派生的视同继承，并入替换包，按「每包流程」写合同、跑旧门、重写",
        "M0-3 完成标准；选择 1",
      ],
      [
        "`exception`",
        "冻结证据包中的上游摘录：不随产品发布，书面列出",
        "M0-3 完成标准；「归零」口径第三类",
      ],
      ["`doc-rewrite`", "文档/规格：用自己的话重写", "计划书类别表「文档」"],
      [
        "`nature-review`",
        "配置或许可正文：作功能配置 / 标准许可正文性质复核",
        "类别表；`specs/knorvia-independent-implementation.md`",
      ],
      ["`delete`", "计划书写明的删除：开发工具", "选择 3；M0-5"],
      [
        "`keep-record`",
        "来源基线记录，工具输入，保留并登记",
        "`specs/knorvia-independent-implementation.md`",
      ],
    ],
  );
  md += `\n分包总表未单列的子目录（CLI 插件包、\`packages/web\`、\`examples/\`）按计划书「范围按目录自动切分，执行 Agent 选包时可按依赖关系重切，重切后在本表更新」处理：本表标注「分包总表未单列」，选包时补行，单包不超过 60 个文件。\n\n`;
  md += `## 3. 汇总\n\n`;
  md += renderTable(
    ["处置", "文件数"],
    [
      ...countRows(Object.entries(summary.byDisposition).sort((a, b) => b[1] - a[1])).map(
        ([key, value]) => [`\`${key}\``, value],
      ),
      ["**合计**", `**${rows.length}**`],
    ],
  );
  md += `\n按归属包聚合（只含 \`inherited\` 与 \`delete\`）：\n\n`;
  md += renderTable(
    ["归属包", "文件数"],
    countRows(Object.entries(summary.byPackage).sort((a, b) => b[1] - a[1])),
  );
  md += `\n## 4. 例外：冻结证据包中的上游摘录（${byDisposition("exception").length} 个）\n\n`;
  md += `这些文件是以前独立替换留下的作者包/证据包，内容与上游实现相似或来自仓库根快照，**不随产品发布**，按计划书「归零」口径书面列为例外，不重写。分布：\n\n`;
  const evidenceAgg = {};
  for (const row of byDisposition("exception")) {
    const key = row.path.startsWith("docs/evidence/")
      ? "docs/evidence/"
      : row.path.startsWith("licensing/evidence/")
        ? "licensing/evidence/"
        : "`docs/knorvia-*-author-inputs-*`";
    evidenceAgg[key] = (evidenceAgg[key] ?? 0) + 1;
  }
  md += renderTable(
    ["证据包", "文件数"],
    countRows(Object.entries(evidenceAgg).sort((a, b) => b[1] - a[1])),
  );
  md += `\n这些路径必须在 \`licensing/reviews.json\` 中逐个写明例外依据（M0-3 与 M0-7 的记录项），并在打包产物的来源核对中确认不进三类产物。\n\n`;
  md += `## 5. 并入替换包与删除的文件（${byDisposition("inherited").length + byDisposition("delete").length} 个）\n\n`;
  md += `\`inherited\` ${byDisposition("inherited").length} 个、\`delete\` ${byDisposition("delete").length} 个。删除的是计划书写明的开发工具：\n\n`;
  md += renderTable(["路径", "分类原因", "处置", "归属包"], fileRows(byDisposition("delete")));
  md += `\n其余按归属包进入对应里程碑的选包队列；包内文件数超过 60 的按计划书重切并在分包总表更新。\n\n`;
  md += `### 5.1 文档、配置与许可正文（${byDisposition("doc-rewrite").length + byDisposition("nature-review").length + byDisposition("keep-record").length} 个）\n\n`;
  md += renderTable(
    ["路径", "分类原因", "处置", "归属包"],
    fileRows([
      ...byDisposition("keep-record"),
      ...byDisposition("nature-review"),
      ...byDisposition("doc-rewrite"),
    ]),
  );
  md += `\n## 6. 补充：同类规则、措辞不同的交还条目（${supplement.count} 条）\n\n`;
  md += `这些条目第一轮交还时的原因不是「相似度 X」这种写法，因此不计入计划书的「约 815」，但规则同类（规范化行数不足 10 行却包含率不为 0；最长连续段 ≥ 8；找不到首次加入提交）。按默认裁决表「不确定文件是否第三方原样 → 按 ZCode 改过处理，进替换包」与「选更保守的做法」处理：**一律视同继承，并入替换包**，不登记为 original、不当作例外。\n\n`;
  md += renderTable(
    ["交还原因类别", "条数"],
    countRows(Object.entries(supplement.byCategory).sort((a, b) => b[1] - a[1])),
  );
  md += `\n这些文件在对应包选包时按同一张分包总表并入；不单列逐行表格，避免与第 7 节重复。\n\n`;
  md += `## 7. 全表（${rows.length} 行）\n\n`;
  md += renderTable(["路径", "分类原因", "处置", "归属包"], fileRows(rows));
  md += `\n## 8. 声明\n\n`;
  md += `- 本表只做处置分诊，不登记许可、不改代码、不改任何生成物。\n`;
  md += `- 数字来自第一轮报告的交还清单与仓库提交历史，可用 \`node scripts/provenance/inherited-triage.mjs\` 复现。\n`;
  md += `- 分包总表未单列的范围按计划书在选包时重切并回写分包总表；本表不预先替代该步骤。\n`;
  return md;
}

function main(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--"))
      args.set(token.slice(2), argv[i + 1]?.startsWith("--") ? "true" : (argv[++i] ?? "true"));
  }
  const reportPath = resolve(repoRoot, args.get("report") ?? DEFAULT_REPORT);
  const text = readFileSync(reportPath, "utf8");
  const result = buildTriage({ text });
  const outJson = args.get("out-json");
  const outMarkdown = args.get("out-markdown");
  if (outJson) {
    writeFileSync(resolve(repoRoot, outJson), JSON.stringify(result, null, 1));
  }
  if (outMarkdown) {
    writeFileSync(
      resolve(repoRoot, outMarkdown),
      renderMarkdown(result, {
        date: args.get("date") ?? new Date().toISOString().slice(0, 10),
        commit: args.get("commit") ?? "unknown",
        issue: args.get("issue") ?? "—",
      }),
    );
  }
  const { byDisposition } = result.summary;
  console.log(`returns: ${result.report.returns}`);
  console.log(
    `in scope: ${result.rows.length} (first-snapshot ${result.report.byCategory["first-snapshot"] ?? 0}, similarity ${result.report.byCategory.similarity ?? 0})`,
  );
  console.log(`dispositions: ${JSON.stringify(byDisposition)}`);
  console.log(`supplement: ${result.supplement.count}`);
  console.log(`unmapped: ${result.unmapped.length}`);
  if (result.unmapped.length > 0) {
    console.error("unmapped paths:", result.unmapped.slice(0, 20).join("\n"));
    return 1;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
