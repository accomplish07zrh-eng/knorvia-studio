import fs from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";
const root = process.cwd();
const owners = { index: "commands/index.ts" };
const names = Object.keys(owners);
const printer = ts.createPrinter({ removeComments: true });
const has = (node, kind) => node.modifiers?.some((m) => m.kind === kind) ?? false;
function shape(file) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const text = (node) =>
    node
      ? printer.printNode(ts.EmitHint.Unspecified, node, sf).replace(/\s/g, "").replace(/'/g, '"')
      : null;
  const imported = new Map();
  for (const statement of sf.statements)
    if (
      ts.isImportDeclaration(statement) &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    )
      for (const entry of statement.importClause.namedBindings.elements)
        imported.set(entry.name.text, {
          symbol: entry.propertyName?.text ?? entry.name.text,
          module: statement.moduleSpecifier.text,
        });
  const local = new Map(
    sf.statements
      .filter(
        (n) =>
          (ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) &&
          !has(n, ts.SyntaxKind.ExportKeyword),
      )
      .map((n) => [n.name.text, n]),
  );
  function type(node, seen = new Set()) {
    if (!node) return null;
    if (ts.isFunctionTypeNode(node)) return { function: signature(node) };
    if (ts.isTypeLiteralNode(node)) return { members: node.members.map(member) };
    if (ts.isUnionTypeNode(node)) return { union: node.types.map((n) => type(n, seen)) };
    if (ts.isTypeReferenceNode(node)) {
      const name = text(node.typeName),
        alias = local.get(name);
      if (alias && !seen.has(name)) {
        const next = new Set(seen);
        next.add(name);
        return ts.isTypeAliasDeclaration(alias)
          ? type(alias.type, next)
          : { members: alias.members.map(member) };
      }
      return {
        ref: imported.get(name) ?? name,
        args: node.typeArguments?.map((n) => type(n, seen)) ?? [],
      };
    }
    if (ts.isArrayTypeNode(node)) return { array: type(node.elementType, seen) };
    if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal))
      return { literal: node.literal.text };
    return text(node);
  }
  const params = (node) =>
    node.parameters.map((p) => ({
      type: type(p.type),
      optional: !!p.questionToken || !!p.initializer,
      rest: !!p.dotDotDotToken,
    }));
  const generics = (node) =>
    node.typeParameters?.map((p) => ({
      name: text(p.name),
      constraint: type(p.constraint),
      default: type(p.default),
    })) ?? [];
  function signature(node) {
    return { generics: generics(node), params: params(node), return: type(node.type) };
  }
  function member(node) {
    const base = { name: text(node.name), static: has(node, ts.SyntaxKind.StaticKeyword) };
    if (ts.isConstructorDeclaration(node))
      return { constructor: params(node), private: has(node, ts.SyntaxKind.PrivateKeyword) };
    if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node))
      return { ...base, method: signature(node), optional: !!node.questionToken };
    if (ts.isGetAccessorDeclaration(node)) return { ...base, get: type(node.type) };
    if (ts.isSetAccessorDeclaration(node)) return { ...base, set: params(node) };
    return {
      ...base,
      readonly: has(node, ts.SyntaxKind.ReadonlyKeyword),
      optional: !!node.questionToken,
      type: type(node.type),
    };
  }
  function declaration(node) {
    if (ts.isExportDeclaration(node))
      return {
        reexport: node.moduleSpecifier.text,
        typeOnly: !!node.isTypeOnly,
        names: node.exportClause.elements
          .map((n) => ({
            name: n.name.text,
            source: n.propertyName?.text ?? n.name.text,
            typeOnly: !!n.isTypeOnly,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    const name = text(node.name);
    if (ts.isClassDeclaration(node)) {
      const members = node.members
        .filter(
          (n) =>
            !has(n, ts.SyntaxKind.PrivateKeyword) &&
            !has(n, ts.SyntaxKind.ProtectedKeyword) &&
            !n.name?.text?.startsWith("#"),
        )
        .map(member);
      for (const ctor of node.members.filter(ts.isConstructorDeclaration))
        for (const p of ctor.parameters)
          if (
            !has(p, ts.SyntaxKind.PrivateKeyword) &&
            !has(p, ts.SyntaxKind.ProtectedKeyword) &&
            (has(p, ts.SyntaxKind.PublicKeyword) || has(p, ts.SyntaxKind.ReadonlyKeyword))
          )
            members.push({
              name: text(p.name),
              static: false,
              readonly: has(p, ts.SyntaxKind.ReadonlyKeyword),
              optional: !!p.questionToken,
              type: type(p.type),
            });
      return {
        name,
        class: true,
        generics: generics(node),
        heritage: node.heritageClauses?.map(text) ?? [],
        members: members.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      };
    }
    if (ts.isInterfaceDeclaration(node))
      return {
        name,
        interface: true,
        generics: generics(node),
        heritage: node.heritageClauses?.map(text) ?? [],
        members: node.members.map(member),
      };
    if (ts.isFunctionDeclaration(node)) return { name, function: signature(node) };
    throw new Error("Unsupported export");
  }
  return sf.statements
    .filter((n) => ts.isExportDeclaration(n) || has(n, ts.SyntaxKind.ExportKeyword))
    .map(declaration)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
for (const name of names) {
  const baseline = shape(`/tmp/knorvia-cli-command-baseline/${name}.ts`);
  const candidate = shape(path.join(root, `apps/cli/packages/adapters/src/${owners[name]}`));
  assert.deepEqual(candidate, baseline, `${name} API shape changed`);
  console.log(
    `${name}: public declarations/reexports and structural return DTOs match; private names/parameter identifiers excluded`,
  );
}
console.log(
  "AST syntax/API comparison only; no semantic typecheck, declaration emit or native consumer integration.",
);
