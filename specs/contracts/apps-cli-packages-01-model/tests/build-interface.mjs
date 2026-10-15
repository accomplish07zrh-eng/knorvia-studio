// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01-model 合同 interface.md 生成器。
//
// 从 scope.json 的 44 个在范围文件里，用 TypeScript 编译器 API 逐字提取导出声明的签名
// （函数/方法体换成分号，其余文本保持源码原样），写入 interface.md 的 INTERFACE 标记块。
// `pnpm dep:refs` 对 `apps/cli/packages/adapters` 报「源文件未加载到 project」，所以这里
// 直接用与 ts-morph 等价的编译器 API 分析，同一套 TypeScript 解析器，不新增依赖。
//
// 用法（仓库根目录，Node 与 mise.toml 一致）：
//   node specs/contracts/apps-cli-packages-01-model/tests/build-interface.mjs          # 重写标记块
//   node specs/contracts/apps-cli-packages-01-model/tests/build-interface.mjs --check  # 只校验不写，落后则退出码 1
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(contractDir, "../../..");
const interfacePath = join(contractDir, "interface.md");
const scope = JSON.parse(readFileSync(join(contractDir, "scope.json"), "utf8"));

const inScope = scope.files.filter((file) => file.inherited);
const rootNames = inScope.map((file) => resolve(repoRoot, file.path));
const program = ts.createProgram(rootNames, {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
  strict: true,
  skipLibCheck: true,
  types: ["node"],
  noEmit: true,
});
const checker = program.getTypeChecker();

/** 一段源码文本（去掉首尾空白，末尾补分号由调用方决定）。 */
function slice(sourceFile, node) {
  return sourceFile.text.slice(node.getStart(sourceFile), node.getEnd()).trim();
}

/** 函数/方法签名：源码从声明头到返回类型为止，体换成 `;`。 */
function signatureOf(sourceFile, node) {
  const head = node.body
    ? sourceFile.text.slice(node.getStart(sourceFile), node.body.getStart(sourceFile)).trim()
    : slice(sourceFile, node);
  return /;\s*$/u.test(head) ? head : `${head};`;
}

/** 类签名：声明头保留，成员逐个降级成签名行。 */
function classSignatureOf(sourceFile, node) {
  const header = sourceFile.text
    .slice(node.getStart(sourceFile), node.members.pos)
    .trimEnd()
    .replace(/\{\s*$/u, "")
    .trimEnd();
  const members = node.members.map((member) => {
    if (ts.isConstructorDeclaration(member) || ts.isMethodDeclaration(member)) {
      return `  ${signatureOf(sourceFile, member)}`;
    }
    if (ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
      return `  ${signatureOf(sourceFile, member)}`;
    }
    if (ts.isPropertyDeclaration(member) || ts.isPropertySignature(member)) {
      const text = slice(sourceFile, member);
      return `  ${/;\s*$/u.test(text) ? text : `${text};`}`;
    }
    if (ts.isMethodSignature(member) || ts.isIndexSignatureDeclaration(member)) {
      const text = slice(sourceFile, member);
      return `  ${/;\s*$/u.test(text) ? text : `${text};`}`;
    }
    return `  ${slice(sourceFile, member)};`;
  });
  return `${header} {\n${members.join("\n")}\n}`;
}

/** 变量声明：有显式注解用注解，否则用类型检查器推导的类型。 */
function variableSignatureOf(sourceFile, statement) {
  const isConst = statement.declarationList.flags & ts.NodeFlags.Const;
  const keyword = isConst ? "const" : "let";
  return statement.declarationList.declarations.map((declaration) => {
    const name = slice(sourceFile, declaration.name);
    const annotation = declaration.type
      ? slice(sourceFile, declaration.type)
      : checker.typeToString(checker.getTypeAtLocation(declaration.name));
    return `export ${keyword} ${name}: ${annotation};`;
  });
}

function renderStatement(sourceFile, statement) {
  if (ts.isInterfaceDeclaration(statement) || ts.isEnumDeclaration(statement)) {
    return [slice(sourceFile, statement)];
  }
  if (ts.isTypeAliasDeclaration(statement)) {
    const text = slice(sourceFile, statement);
    return [/;\s*$/u.test(text) ? text : `${text};`];
  }
  if (ts.isClassDeclaration(statement)) {
    return [classSignatureOf(sourceFile, statement)];
  }
  if (ts.isFunctionDeclaration(statement)) {
    return [signatureOf(sourceFile, statement)];
  }
  if (ts.isVariableStatement(statement)) {
    return variableSignatureOf(sourceFile, statement);
  }
  if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) {
    return [slice(sourceFile, statement)];
  }
  return null;
}

function isExported(statement) {
  return (ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Export) !== 0;
}

const sections = [];
for (const file of inScope) {
  const absolute = resolve(repoRoot, file.path);
  const sourceFile = program.getSourceFile(absolute);
  if (!sourceFile) throw new Error(`source file not in program: ${file.path}`);
  const signatures = [];
  let declarations = 0;
  let reexports = 0;
  for (const statement of sourceFile.statements) {
    if (
      !ts.isExportDeclaration(statement) &&
      !ts.isExportAssignment(statement) &&
      !isExported(statement)
    ) {
      continue;
    }
    const rendered = renderStatement(sourceFile, statement);
    if (!rendered) continue;
    if (ts.isExportDeclaration(statement)) reexports += 1;
    else declarations += rendered.length;
    signatures.push(...rendered);
  }
  const mode = file.declaration.pass ? "过线" : "未过线";
  sections.push(
    [
      `### \`${file.path}\``,
      "",
      `普通模式 containment ${file.plain.containment.toFixed(3)} / run ${file.plain.longestRun} / ` +
        `structural ${file.plain.structural.toFixed(3)}（未过线，列入本包 ${scope.counts.inherited} 个继承文件）；` +
        `声明模式${mode}（containment ${file.declaration.containment.toFixed(3)}）。` +
        `${file.lines} 行。导出 ${declarations} 个声明、${reexports} 条 re-export。`,
      "",
      "```ts",
      ...signatures,
      "```",
    ].join("\n"),
  );
}

const block = sections.join("\n\n");
const current = readFileSync(interfacePath, "utf8");
const start = "<!-- INTERFACE:START -->";
const end = "<!-- INTERFACE:END -->";
const startIndex = current.indexOf(start);
const endIndex = current.indexOf(end);
if (startIndex < 0 || endIndex < 0) throw new Error("interface.md 缺少 INTERFACE 标记块");
const next =
  current.slice(0, startIndex + start.length) + "\n\n" + block + "\n\n" + current.slice(endIndex);

if (process.argv.includes("--check")) {
  // oxfmt 会重排 Markdown 与代码块折行（长对象类型展开/收拢、签名重折、去尾随逗号）：
  // 按「去全部空白、去参数尾随逗号」的语义文本比较，只认标识符与标点差异。
  const normalize = (text) => text.replace(/\s+/gu, "").replace(/,\)/gu, ")");
  const normalizedNext = normalize(next);
  const normalizedCurrent = normalize(current);
  if (normalizedNext !== normalizedCurrent) {
    let index = 0;
    while (index < normalizedNext.length && normalizedNext[index] === normalizedCurrent[index])
      index += 1;
    process.stderr.write(
      `build-interface: interface.md 的 INTERFACE 块已落后（首个差异 @${index}）：\n` +
        `  生成: …${normalizedNext.slice(Math.max(0, index - 20), index + 40)}…\n` +
        `  现状: …${normalizedCurrent.slice(Math.max(0, index - 20), index + 40)}…\n`,
    );
    process.exit(1);
  }
  process.stdout.write("build-interface: interface.md 的 INTERFACE 块与源码一致\n");
} else {
  writeFileSync(interfacePath, next);
  process.stdout.write(
    `build-interface: 已写入 ${sections.length} 个文件小节（${relative(repoRoot, interfacePath)}）\n`,
  );
}
