import fs from "node:fs";
import crypto from "node:crypto";
import ts from "typescript";
const directory = "licensing/evidence/desktop-cron-claim-owner-20261003";
const owners = { cron: "cronRunLifecycle.ts" };
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
        ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node)) &&
      node.body
    )
      bodies.push({
        name: node.name?.getText(sf) ?? node.parent?.name?.getText(sf) ?? "<anonymous>",
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
const targets = names.map((name) => ({
  name,
  kind: "installed",
  source: "packages/desktop/src/host/" + owners[name],
}));
for (const raw of fs.readdirSync(directory + "/drafts").sort()) {
  const name = names.find((owner) => raw.startsWith(owner + "-"));
  if (name)
    targets.push({ name, kind: "frozen-whole-draft", source: directory + "/drafts/" + raw });
}
for (const { name, kind, source } of targets) {
  const baseline = describe("/tmp/knorvia-cron49-baseline.ts");
  const candidate = describe(source);
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
    kind,
    source,
    sourceSha256: hash(fs.readFileSync(source)),
    commandCases: candidate.cases,
    identicalBodies,
    identicalExpressions,
    expressionLimit:
      "Identifiers retained; comments/format/quote style/numeric separators/runtime-erased assertions and parentheses normalized. Atomic and contract expressions are included. Changed identifiers/control flow are not proof of independence. Embedded renderer JavaScript is a string/template expression and is not independently AST-normalized by this TypeScript-only scan.",
    acceptedIndependentReplacementCredit: 0,
    licenseDecision: "deferred to parent; no new MIT claim",
  });
}
fs.writeFileSync(
  `${directory}/retained-expression-records.json`,
  JSON.stringify(records, null, 2) + "\n",
  { flag: "wx" },
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
