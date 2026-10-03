// 仅比较本路当前 receipt 的 source/JS；不构建包、不改产物或历史绑定。
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const ts = createRequire(path.join(root, "apps/cli/package.json"))("typescript");
const receiptPath = "apps/cli/packages/core/test/current-artifact-receipt-20261003.json";
const read = (file) => readFileSync(path.join(root, file), "utf8");
const receipt = JSON.parse(read(receiptPath));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function runtimeSyntax(code, filename) {
  const source = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const visit = (node) => {
    if (ts.isParenthesizedExpression(node)) return visit(node.expression);
    const children = [];
    ts.forEachChild(node, (child) => {
      children.push(visit(child));
    });
    const hasText =
      ts.isIdentifier(node) ||
      ts.isPrivateIdentifier(node) ||
      ts.isStringLiteralLike(node) ||
      ts.isNumericLiteral(node) ||
      ts.isBigIntLiteral(node) ||
      ts.isRegularExpressionLiteral(node) ||
      ts.isTemplateLiteralToken(node);
    return [node.kind, hasText ? node.text : undefined, ...children];
  };
  return JSON.stringify(visit(source));
}
const results = [];
for (const sourcePath of Object.keys(receipt.files).filter(
  (file) => file.includes("/src/") && file.endsWith(".ts") && !file.endsWith(".d.ts"),
)) {
  const packageRoot = sourcePath.slice(0, sourcePath.indexOf("/src/"));
  assert.equal(JSON.parse(read(packageRoot + "/package.json")).type, "module", packageRoot);
  const config = ts.readConfigFile(path.join(root, packageRoot, "tsconfig.json"), ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.join(root, packageRoot));
  const emittedPath = sourcePath.replace("/src/", "/dist/").replace(/\.ts$/u, ".js");
  if (!Object.hasOwn(receipt.files, emittedPath)) continue;
  const source = read(sourcePath);
  const emitted = read(emittedPath);
  assert.equal(sha(source), receipt.files[sourcePath], sourcePath);
  assert.equal(sha(emitted), receipt.files[emittedPath], emittedPath);
  // 实际包为 ESM；孤立编译用 .mts 明确该事实，保持原 NodeNext/target 选项。
  const generated = ts.transpileModule(source, {
    fileName: path.join(root, sourcePath.replace(/\.ts$/u, ".mts")),
    compilerOptions: {
      ...parsed.options,
      target: ts.getEmitScriptTarget(parsed.options),
      declaration: false,
      declarationMap: false,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(generated.diagnostics, [], sourcePath);
  const generatedSyntax = runtimeSyntax(generated.outputText, emittedPath);
  const actualSyntax = runtimeSyntax(emitted, emittedPath);
  assert.equal(generatedSyntax, actualSyntax, sourcePath);
  results.push({
    sourcePath,
    emittedPath,
    sourceSha256: sha(source),
    emittedSha256: sha(emitted),
    generatedSha256: sha(generated.outputText),
    sameEmittedBytes: generated.outputText === emitted,
    sameRuntimeSyntax: true,
    runtimeSyntaxSha256: sha(actualSyntax),
  });
}
process.stdout.write(
  JSON.stringify(
    {
      typescript: ts.version,
      receiptPath,
      receiptSha256: sha(read(receiptPath)),
      scope: "Only registered current source-to-emitted pairs. All identifiers/literals/templates retained; comments, positions and redundant parentheses excluded. No declaration equivalence, old accepted-source, product build or whole-CLI claim.",
      pairs: results.length,
      results,
    },
    null,
    2,
  ) + "\n",
);
