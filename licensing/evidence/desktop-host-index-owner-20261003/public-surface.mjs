import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function surface(file) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  assert.equal(source.parseDiagnostics.length, 0, "source parse diagnostics");
  const exports = source.statements.filter(
    (node) =>
      ts.isExportDeclaration(node) ||
      ts.isExportAssignment(node) ||
      node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  );
  const modules = new Set(),
    names = new Map(),
    remoteRuntimeStatic = [];
  for (const node of source.statements.filter(ts.isImportDeclaration)) {
    modules.add(node.moduleSpecifier.text);
    const bindings = node.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings))
      for (const binding of bindings.elements) {
        const original = binding.propertyName?.text ?? binding.name.text;
        names.set(binding.name.text, original);
        if (
          node.moduleSpecifier.text === "@knorvia/server/remote" &&
          !node.importClause.isTypeOnly &&
          !binding.isTypeOnly
        )
          remoteRuntimeStatic.push(original);
      }
  }
  const messageKeys = new Set(),
    responseKeys = new Set(),
    lazy = new Set();
  function walk(node) {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const original = names.get(node.expression.text);
      if (original === "HostMessageTypes") messageKeys.add(node.name.text);
      if (original === "HostResponseTypes") responseKeys.add(node.name.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      assert.ok(ts.isStringLiteral(node.arguments[0]), "unbounded lazy import");
      lazy.add(node.arguments[0].text);
    }
    ts.forEachChild(node, walk);
  }
  walk(source);
  return {
    exports: exports.length,
    modules: [...modules].sort(),
    messageKeys: [...messageKeys].sort(),
    responseKeys: [...responseKeys].sort(),
    lazy: [...lazy].sort(),
    remoteRuntimeStatic,
  };
}
const baseline = surface("/tmp/knorvia-host-index-baseline/index.ts");
const candidate = surface("packages/desktop/src/host/index.ts");
assert.deepEqual(candidate, baseline, "external imports/protocol vocabulary changed");
assert.equal(candidate.exports, 0);
assert.equal(candidate.remoteRuntimeStatic.length, 0);
console.log(JSON.stringify(candidate));
console.log(
  "AST public import/protocol-presence gate only; not semantic imported types, full dispatch behavior or native acceptance.",
);
