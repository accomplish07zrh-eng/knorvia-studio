// SPDX-License-Identifier: Apache-2.0
// core-tool-handlers-workflow-runs-01 接口面生成器（TS compiler API）。
// 从 11 个在范围模块提取导出名与签名，生成 interface.md；--check 模式做语义比较
// （空白与尾逗号归一）供 CI/门禁校验。
//
// 用法：node --import tsx specs/contracts/core-tool-handlers-workflow-runs-01/tests/build-interface.mjs [--check]
import ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");
const outPath = join(here, "..", "interface.md");
const handlersRoot = join(repoRoot, "apps", "cli", "packages", "core", "src", "tool", "handlers");

const MODULES = [
  ["get-workflow-run.ts", "单 run 自适应详情 handler"],
  ["get-workflow-run-format.ts", "GetWorkflowRun 模型面骨架"],
  ["get-workflow-run-format-roster.ts", "情势三块与 log_tail 表格渲染"],
  ["get-workflow-run-roster-output.ts", "端口视图 → 契约投影"],
  ["get-workflow-run-summary.ts", "确定性 summary"],
  ["get-workflow-run-activity-program.ts", "花名册活动行渲染"],
  ["list-workflow-runs.ts", "ListWorkflowRuns 工具入口"],
  ["list-saved-workflows.ts", "ListSavedWorkflows 工具入口"],
  ["list-models.ts", "ListModels 工具入口"],
  ["resume-workflow-run.ts", "ResumeWorkflowRun 工具入口"],
  ["resolve-workflow-question.ts", "ResolveWorkflowQuestion 工具入口"],
];

function build() {
  const program = ts.createProgram(
    MODULES.map(([name]) => join(handlersRoot, name)),
    { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, strict: true, noEmit: true },
  );
  const checker = program.getTypeChecker();
  const rows = [];
  let exportCount = 0;
  let runtimeExports = 0;
  let typeExports = 0;
  for (const [name, role] of MODULES) {
    const source = program.getSourceFile(join(handlersRoot, name));
    const moduleSymbol = checker.getSymbolAtLocation(source);
    const exports = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : [];
    const lines = [];
    for (const symbol of exports) {
      const declaration = symbol.declarations?.[0];
      const isTypeOnly =
        declaration !== undefined &&
        (ts.isTypeAliasDeclaration(declaration) || ts.isInterfaceDeclaration(declaration));
      const type = checker.getTypeOfSymbolAtLocation(symbol, source);
      const signature = checker.typeToString(
        type,
        source,
        ts.TypeFormatFlags.NoTruncation |
          ts.TypeFormatFlags.UseFullyQualifiedType |
          ts.TypeFormatFlags.WriteArrayAsGenericType,
      );
      const kind = isTypeOnly ? "type" : "value";
      lines.push(`- \`${symbol.getName()}\` (${kind}): \`${signature.replace(/\s+/gu, " ")}\``);
      exportCount += 1;
      if (isTypeOnly) typeExports += 1;
      else runtimeExports += 1;
    }
    rows.push({ name, role, lines });
  }

  const header = [
    "# core-tool-handlers-workflow-runs-01 接口（interface.md）",
    "",
    "只列**兼容所需的模块路径、导出名、参数与返回类型**：替换包必须让这些模块路径与导出在编译产物中保持可用，签名不变。行为见 `behavior.md`，调用方见 `callers.md`。",
    "",
    "覆盖 `apps/cli/packages/core/src/tool/handlers` 下 **11 个继承文件**（`licensing/current-files.json` 实测：upstream-modified 10 / unreviewed 1）。",
    "",
    "## 导出统计",
    "",
    "| 项 | 数量 |",
    "| --- | --- |",
    `| 模块数 | ${MODULES.length} |`,
    `| 导出合计 | ${exportCount} |`,
    `| 运行时值导出 | ${runtimeExports} |`,
    `| 类型导出 | ${typeExports} |`,
    "",
  ];
  const body = [];
  for (const { name, role, lines } of rows) {
    body.push(`## ${name}`, "", `> ${role}`, "", ...lines, "");
  }
  return `${header.join("\n")}${body.join("\n")}`;
}

function normalize(text) {
  return text
    .replace(/\s+/gu, " ")
    .replace(/,\s*\)/gu, ")")
    .trim();
}

const generated = build();
if (process.argv.includes("--check")) {
  const current = readFileSync(outPath, "utf8");
  if (normalize(current) !== normalize(generated)) {
    console.error("interface.md is stale; run build-interface.mjs to regenerate");
    process.exit(1);
  }
  console.log("interface.md is up to date");
} else {
  writeFileSync(outPath, generated, "utf8");
  console.log(`wrote ${outPath}`);
}
