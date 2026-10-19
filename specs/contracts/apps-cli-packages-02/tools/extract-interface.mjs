// SPDX-License-Identifier: Apache-2.0
// 从源码的导出声明生成 interface.md（模块路径、继承分类、行数、导出签名）。
// 用法（仓库根目录）：node specs/contracts/apps-cli-packages-02/tools/extract-interface.mjs
//
// 类的正文不整段搬运：只保留构造函数、公开成员与字段签名（实现体省略）；
// 接口/类型别名按源码逐字输出（它们是纯声明，本身就是兼容面）。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(contractDir, "../../..");
const licensing = JSON.parse(readFileSync(join(repoRoot, "licensing/current-files.json"), "utf8"));
const entries = new Map(
  (Array.isArray(licensing.files)
    ? licensing.files
    : Object.entries(licensing.files).map(([path, value]) => ({ path, ...value }))
  ).map((entry) => [entry.path, entry]),
);

const MODULES = [
  "apps/cli/packages/shared-types/src/index.ts",
  "apps/cli/packages/i18n/src/index.ts",
  "apps/cli/packages/i18n/src/locale.ts",
  "apps/cli/packages/i18n/src/types.ts",
  "apps/cli/packages/i18n/src/locales/en-US.ts",
  "apps/cli/packages/i18n/src/locales/zh-CN.ts",
  "apps/cli/packages/dynamic-workflow-runtime/src/index.ts",
  "apps/cli/packages/dynamic-workflow-runtime/src/protocol.ts",
  "apps/cli/packages/dynamic-workflow-runtime/src/child-entry-file.ts",
  "apps/cli/packages/dynamic-workflow-runtime/src/child-source.ts",
  "apps/cli/packages/dynamic-workflow-runtime/src/harness.ts",
  "apps/cli/packages/telemetry/src/index.ts",
  "apps/cli/packages/telemetry/src/agent-metrics.ts",
  "apps/cli/packages/telemetry/src/agent-trace-runtime.ts",
  "apps/cli/packages/telemetry/src/agent-trace-support.ts",
  "apps/cli/packages/telemetry/src/bootstrap.ts",
  "apps/cli/packages/telemetry/src/compatibility-adapters.ts",
  "apps/cli/packages/telemetry/src/error-sanitizer.ts",
  "apps/cli/packages/telemetry/src/model-api-recorder.ts",
  "apps/cli/packages/telemetry/src/otlp-exporter.ts",
  "apps/cli/packages/telemetry/src/provider-endpoint.ts",
  "apps/cli/packages/node-repl-host/src/tool-contract.ts",
];

const LABELS = {
  "independent-replacement": "independent-replacement",
  original: "original",
  "reviewed-retained": "reviewed-retained",
  "upstream-modified": "u-modified",
  "upstream-unchanged": "u-unchanged",
  unreviewed: "unreviewed",
};

function isExported(node) {
  const modifiers = ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];
  return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function isPublicMember(member) {
  const modifiers = ts.canHaveModifiers(member) ? (ts.getModifiers(member) ?? []) : [];
  return !modifiers.some(
    (modifier) =>
      modifier.kind === ts.SyntaxKind.PrivateKeyword ||
      modifier.kind === ts.SyntaxKind.ProtectedKeyword,
  );
}

function declarationText(source, node, file) {
  if (ts.isFunctionDeclaration(node)) {
    const body = node.body;
    return body
      ? source.slice(node.getStart(), body.getStart()).trimEnd()
      : source.slice(node.getStart(), node.getEnd());
  }
  if (
    ts.isTypeAliasDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isEnumDeclaration(node)
  ) {
    return node.getText(file);
  }
  if (ts.isVariableStatement(node)) {
    return node
      .getText(file)
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n");
  }
  return node.getText(file);
}

function classText(source, node, file) {
  const header = source.slice(node.getStart(), node.members.pos).trimEnd();
  const lines = [];
  for (const member of node.members) {
    if (!isPublicMember(member)) continue;
    if (ts.isPropertyDeclaration(member)) {
      lines.push(`  ${member.getText(file).replace(/\s*=\s*[\s\S]*$/u, ";")}`);
      continue;
    }
    if (ts.isConstructorDeclaration(member)) {
      lines.push(
        `  constructor(${(member.parameters ?? [])
          .map((parameter) => parameter.getText(file))
          .join(", ")});`,
      );
      continue;
    }
    if (ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member)) {
      const name = member.name?.getText(file) ?? "?";
      const prefix = ts.isGetAccessorDeclaration(member) ? "get " : "";
      const parameters = member.parameters.map((parameter) => parameter.getText(file)).join(", ");
      const returnType = member.type ? `: ${member.type.getText(file)}` : "";
      lines.push(`  ${prefix}${name}(${parameters})${returnType};`);
      continue;
    }
    if (ts.isIndexSignatureDeclaration(member)) {
      lines.push(`  ${member.getText(file)}`);
    }
  }
  return `${header}\n${lines.join("\n")}\n}`;
}

const output = [];
const countByClassification = {};

for (const modulePath of MODULES) {
  const absolute = join(repoRoot, modulePath);
  const source = readFileSync(absolute, "utf8");
  const file = ts.createSourceFile(modulePath, source, ts.ScriptTarget.Latest, true);
  const classification = entries.get(modulePath)?.classification ?? "unreviewed";
  countByClassification[classification] = (countByClassification[classification] ?? 0) + 1;
  const blocks = [];
  let declarations = 0;
  let reExports = 0;
  for (const statement of file.statements) {
    if (ts.isExportDeclaration(statement)) {
      reExports += 1;
      blocks.push(statement.getText());
      continue;
    }
    if (!isExported(statement)) continue;
    if (ts.isImportDeclaration(statement)) continue;
    declarations += 1;
    if (ts.isClassDeclaration(statement)) blocks.push(classText(source, statement, file));
    else blocks.push(declarationText(source, statement, file));
  }
  output.push(
    `### \`${modulePath}\`\n\n继承分类 \`${LABELS[classification] ?? classification}\`，${source.split("\n").length} 行。导出 ${declarations} 个声明、${reExports} 条 re-export。\n\n\`\`\`ts\n${blocks.join("\n")}\n\`\`\``,
  );
}

const summary = Object.entries(countByClassification)
  .map(([key, value]) => `${LABELS[key] ?? key} ${value}`)
  .join("、");

const document = `# apps-cli-packages-02 接口（interface.md）

本文件只列**兼容所需的模块路径、导出名、参数与返回类型**。签名由 TypeScript 编译器 API 从源码逐字提取（类的实现体省略，字段与方法保留签名）；文件由 \`tools/extract-interface.mjs\` 生成。

- 范围：5 个包、**${MODULES.length} 个继承源码模块**（另有 package.json、tsconfig.json、README、plugin.json、test/runtime.test.mjs 等非源码继承文件，见 README §三）。
- 分类分布：${summary}。
- 运行时导出的稳定性：入口模块（各包 \`src/index.ts\` 与 \`node-repl-host/src/tool-contract.ts\`）是包外调用方唯一可见的入口；其余模块的导出只在本包内部使用，重写可以调整内部模块边界，但必须保持入口导出名与签名。
- 外部依赖类型（\`@knorvia/contracts\`、\`@knorvia/dynamic-workflow\`）按其公开导出使用，不复制其声明。

${output.join("\n\n")}
`;

writeFileSync(join(contractDir, "interface.md"), document, "utf8");
process.stdout.write(`interface.md: ${MODULES.length} 个模块\n`);
