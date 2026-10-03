import fs from "node:fs";
import crypto from "node:crypto";
import ts from "typescript";
const directory = "licensing/evidence/cli-media-owners-20261003";
const owners = {
  "image-index": "image/index.ts",
  "image-compression": "image/jimp-compression.ts",
  "pdf-index": "pdf/index.ts",
};
const names = Object.keys(owners);
const printer = ts.createPrinter({ removeComments: true });
const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
function describe(file) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const cases = [],
    bodies = [],
    expressions = new Map();
  function normalized(node) {
    const transformed = ts.transform(node, [
      (context) => {
        const visit = (entry) =>
          ts.isParenthesizedExpression(entry) ||
          ts.isAsExpression(entry) ||
          ts.isTypeAssertionExpression(entry) ||
          ts.isNonNullExpression(entry)
            ? ts.visitNode(entry.expression, visit)
            : ts.visitEachChild(entry, visit, context);
        return (root) => ts.visitNode(root, visit);
      },
    ]);
    const text = printer.printNode(ts.EmitHint.Unspecified, transformed.transformed[0], sf);
    transformed.dispose();
    const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      true,
      ts.LanguageVariant.Standard,
      text,
    );
    const tokens = [];
    for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
      const value =
        kind === ts.SyntaxKind.StringLiteral || kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral
          ? scanner.getTokenValue()
          : kind === ts.SyntaxKind.NumericLiteral
            ? String(Number(scanner.getTokenText().replaceAll("_", "")))
            : scanner.getTokenText();
      tokens.push([kind, value]);
    }
    return JSON.stringify(tokens);
  }
  const walk = (node) => {
    if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression))
      cases.push(node.expression.text);
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node)) &&
      node.body
    )
      bodies.push({
        name: node.name?.getText(sf) ?? "<anonymous>",
        kind: ts.SyntaxKind[node.kind],
        bodyHash: hash(normalized(node.body)),
      });
    if (ts.isExpressionNode(node)) {
      const digest = hash(normalized(node));
      if (!expressions.has(digest))
        expressions.set(digest, { hash: digest, kind: ts.SyntaxKind[node.kind], occurrences: 0 });
      expressions.get(digest).occurrences++;
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return { cases, bodies, expressions };
}
const records = [];
for (const name of names) {
  const baseline = describe(`/tmp/knorvia-cli-media-baseline/${name}.ts`);
  const candidate = describe(`apps/cli/packages/adapters/src/${owners[name]}`);
  const identicalBodies = candidate.bodies.flatMap((item) =>
    baseline.bodies
      .filter((old) => old.bodyHash === item.bodyHash)
      .map((old) => ({ baseline: old.name, candidate: item.name, bodyHash: item.bodyHash })),
  );
  const identicalExpressions = [...candidate.expressions.values()].filter((item) =>
    baseline.expressions.has(item.hash),
  );
  records.push({
    owner: name,
    commandCases: candidate.cases,
    identicalBodies,
    identicalExpressions,
    expressionLimit:
      "Identifiers retained; comments/format/quote style/numeric separators/runtime-erased assertions and parentheses normalized. Atomic and contract expressions are included. Changed identifiers/control flow are not proof of independence.",
    acceptedIndependentReplacementCredit: 0,
    licenseDecision: "deferred to parent; no new MIT claim",
  });
}
fs.writeFileSync(
  `${directory}/retained-expression-records.json`,
  JSON.stringify(records, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    records.map(({ owner, commandCases, identicalBodies, identicalExpressions }) => ({
      owner,
      commandCases: commandCases.length,
      identicalBodies,
      identicalExpressionCount: identicalExpressions.length,
    })),
  ),
);
console.log(
  "All normalized identical bodies/expressions receive zero new independence credit; syntax changes alone do not establish provenance.",
);
