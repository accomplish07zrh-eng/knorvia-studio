// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 interface.md 生成器：从源码 AST 提取 55 个范围文件的导出签名，
// 产出「模块路径 + 导出名 + 签名」清单（机器生成，不手改）。
// 用法（仓库根目录）：node --import tsx specs/contracts/dynamic-workflow-01/tests/gen-interface.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(here, "../../../..");
const srcRoot = join(repoRoot, "apps/cli/packages/dynamic-workflow/src");

const { readdirSync } = await import("node:fs");
const analysisFiles = readdirSync(join(srcRoot, "analysis"))
  .filter((name) => name.endsWith(".ts"))
  .map((name) => `analysis/${name}`)
  .sort();
const targets = [...analysisFiles, "compiler/compile.ts"];

function extractExports(filePath) {
  const text = readFileSync(join(srcRoot, filePath), "utf8");
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.ES2022, true);
  const rows = [];
  const push = (kind, name, signature) => rows.push({ kind, name, signature: signature.trim() });
  for (const statement of source.statements) {
    const mods = ts.canHaveModifiers(statement) ? (ts.getModifiers(statement) ?? []) : [];
    const isExported = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!isExported) continue;
    if (ts.isFunctionDeclaration(statement)) {
      const sig = statement.getText(source).split("{")[0];
      push("function", statement.name?.text ?? "(default)", sig);
    } else if (ts.isInterfaceDeclaration(statement)) {
      push("interface", statement.name.text, statement.getText(source));
    } else if (ts.isTypeAliasDeclaration(statement)) {
      push("type", statement.name.text, statement.getText(source));
    } else if (ts.isClassDeclaration(statement)) {
      const sig = statement.getText(source).split("{")[0];
      push("class", statement.name?.text ?? "(default)", sig);
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        const name = ts.isIdentifier(decl.name) ? decl.name.text : "(binding pattern)";
        const init = decl.initializer?.getText(source) ?? "";
        const short = init.length > 120 ? "…" : init;
        push(
          "const",
          name,
          `${statement.getText(source).split("\n")[0].split("=")[0].trim()} = ${short}`,
        );
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      const from = statement.moduleSpecifier?.getText(source) ?? "";
      for (const spec of statement.exportClause.elements) {
        push("re-export", spec.name.text, `export { ${spec.name.text} } from ${from}`);
      }
    }
  }
  return rows;
}

const sections = [];
let totalExports = 0;
for (const target of targets) {
  const rows = extractExports(target);
  totalExports += rows.length;
  const lines = [`### \`apps/cli/packages/dynamic-workflow/src/${target}\``, ""];
  lines.push(`导出 ${rows.length} 项（机器生成，逐字取自源码签名）。`, "");
  lines.push("```ts");
  for (const row of rows) lines.push(`${row.signature}`);
  lines.push("```", "");
  sections.push(lines.join("\n"));
}

const header = [
  "# dynamic-workflow-01 接口（interface.md）",
  "",
  "本文件只列**兼容所需的模块路径、导出名、参数与返回类型**：替换包必须让这些模块路径与导出在编译产物中保持可用，签名不变。行为见 `behavior.md`，调用方见 `callers.md`。",
  "",
  "覆盖范围：`apps/cli/packages/dynamic-workflow/src/analysis/`（54 个文件）与 `src/compiler/compile.ts`，共 **55 个继承文件**。`compiler/libs.generated.ts` 是 `scripts/generate-libs.mjs` 的构建期生成物（不进 git），不属合同范围。",
  "",
  "## 兼容入口面（重写后必须原样可用）",
  "",
  "- `@knorvia/dynamic-workflow` 根桶（`src/index.ts`）里来自本包的导出：`analyzeWorkflowScript`、`compileWorkflowScript`、`createWorkflowProgram`、`collectDiagnostics`、`collectSites`、`collectWorldRunCommands`、`collectPhaseMarkerDiagnostics`、`collectArtifactDeclarations`、`toActorGraph`、`projectControlFlow`、`projectHandoffGraph`、`reduceOrdering`、`serializeCore`、`serializeCausalityGraph`、`serializeControlFlow`、`serializeHandoffGraph`、七个 `*ToMermaid`、`decodeAnalysisCore`/`encodeAnalysisCore`，以及常量 `SCRIPT_FILE_NAME`、`WORLD_RUN_LITERAL_CODE`、`PHASE_MARKER_CODE`、`ARTIFACT_DECLARATION_CODE`、`ARTIFACT_HOISTING_CODE`、`ARTIFACT_PRIMARY_CONFLICT_CODE`、`FANOUT_EXPAND_CAP`、`FLOW_ENTRY`/`FLOW_SINK`/`FLOW_ABORT`、`SINK_ID`、`UNKNOWN_LANE`、`WORKSPACE_LANE`、`UNPHASED`、`UNPHASED_ID` 与全部类型导出。",
  "- `@knorvia/dynamic-workflow/projections` 桶（`src/projections.ts`）整体来自本包分析模块（浏览器安全子集，不得引入 `typescript` 运行时依赖）。",
  "- 包内深层模块路径（本包之外的 import 方按相对路径引用，重写后必须原样存在）：`analysis/analyze`（`schema` 夹具与 `interpret` 消费）、`analysis/interpret`（`schema/actor-submit-profiles`）、`analysis/sites`、`analysis/facade-misuse`（`lowering/lower`）、`analysis/graph`、`analysis/causality-graph`、`analysis/causality-reduce`、`analysis/causality-order`、`analysis/causality-order-settle`（core 夹具按字符串路径 import）、`analysis/causality-order-strands`（同前）、`analysis/causality-graph-lanes`（同前）、`analysis/flow-graph`、`analysis/handoff-graph`、`analysis/core`（core 夹具）、`analysis/core-json`、`analysis/types`、`analysis/mermaid`（core 夹具）、`analysis/serialize`、`analysis/actor-graph`、`analysis/fanout-cardinality`（core 夹具）、`analysis/constants`、`compiler/compile`（core 夹具与 `lowering`/`schema`）。",
  "- core 测试夹具用**字符串路径**动态 import `src/analysis/*` 与 `src/compiler/compile.ts`（`causality-reduction-fixture.ts`、`fanout-cardinality-fixture.ts`、`may-set-lane-expansion-fixture.ts`、`causality-order-settlement-fixture.ts`、`causality-order-strands-fixture.ts`），并 pin dist 产物 sha256；这些模块路径与导出名是兼容面的一部分（见 `callers.md`）。",
  "",
  `## 逐文件导出（共 ${targets.length} 文件 / ${totalExports} 项导出）`,
  "",
  ...sections,
];

writeFileSync(join(contractDir, "interface.md"), `${header.join("\n")}\n`, "utf8");
console.log(`interface.md: ${targets.length} files / ${totalExports} exports`);
