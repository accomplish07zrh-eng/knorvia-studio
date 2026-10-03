import fs from "node:fs";
import crypto from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
const root = "licensing/evidence/desktop-command-page-chain-owners-20261003";
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
function load(file) {
  const exports = {};
  const { outputText } = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(outputText, { exports }); // Module exports source text only; no page program execution.
  return exports;
}
const printer = ts.createPrinter({ removeComments: true });
function describe(source) {
  const sf = ts.createSourceFile(
    "synthetic.js",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const bodies = [],
    expressions = new Map();
  function normalized(node) {
    const transformed = ts.transform(node, [
      (context) => {
        const visit = (entry) =>
          ts.isParenthesizedExpression(entry)
            ? ts.visitNode(entry.expression, visit)
            : ts.visitEachChild(entry, visit, context);
        return (entry) => ts.visitNode(entry, visit);
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
    for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan())
      tokens.push([
        kind,
        kind === ts.SyntaxKind.StringLiteral || kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral
          ? scanner.getTokenValue()
          : kind === ts.SyntaxKind.NumericLiteral
            ? String(Number(scanner.getTokenText().replaceAll("_", "")))
            : scanner.getTokenText(),
      ]);
    return hash(JSON.stringify(tokens));
  }
  function walk(node) {
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node)) &&
      node.body
    )
      bodies.push({ name: node.name?.getText(sf) ?? "<anonymous>", hash: normalized(node.body) });
    if (ts.isExpressionNode(node)) {
      const digest = normalized(node);
      expressions.set(digest, (expressions.get(digest) ?? 0) + 1);
    }
    ts.forEachChild(node, walk);
  }
  walk(sf);
  return {
    bodies,
    expressions,
    parseDiagnostics: sf.parseDiagnostics.map((d) =>
      ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    ),
  };
}
function programs(owner, file) {
  const api = load(file);
  if (owner === "paste")
    return { VIRTUAL_PASTE_PAGE_FUNCTION: `(${api.VIRTUAL_PASTE_PAGE_FUNCTION})` };
  return {
    SNAPSHOT_SCRIPT: api.SNAPSHOT_SCRIPT(2, false),
    RESOLVE_SCRIPT: api.RESOLVE_SCRIPT("synthetic"),
    VIEWPORT_SCRIPT: api.VIEWPORT_SCRIPT,
    SELECT_SCRIPT: api.SELECT_SCRIPT("synthetic", ["synthetic"]),
    CHECK_SCRIPT: api.CHECK_SCRIPT("synthetic", true),
    ELEMENT_AT_POINT_SCRIPT: api.ELEMENT_AT_POINT_SCRIPT(1, 2),
    EVALUATE_SCRIPT: api.EVALUATE_SCRIPT("({synthetic:1})"),
  };
}
const targets = [
  { owner: "scripts", source: "packages/desktop/src/main/browserView/browserCommandScripts.ts" },
  {
    owner: "paste",
    source: "packages/desktop/src/main/browserView/browserVirtualClipboardPageScript.ts",
  },
];
for (const file of fs.readdirSync(`${root}/drafts`).sort())
  for (const owner of ["scripts", "paste"])
    if (file.startsWith(`${owner}-`)) targets.push({ owner, source: `${root}/drafts/${file}` });
const records = [];
for (const target of targets) {
  const baseline = programs(
    target.owner,
    `/tmp/knorvia-command-chain47-baseline/${target.owner}.ts`,
  );
  const candidate = programs(target.owner, target.source);
  for (const [name, source] of Object.entries(candidate)) {
    const previous = describe(baseline[name]),
      current = describe(source);
    records.push({
      ...target,
      program: name,
      generatedSourceSha256: hash(source),
      baselineGeneratedSourceSha256: hash(baseline[name]),
      exactSourceStringRetained: source === baseline[name],
      parseDiagnostics: current.parseDiagnostics,
      identicalBodies: current.bodies.flatMap((body) =>
        previous.bodies
          .filter((old) => old.hash === body.hash)
          .map((old) => ({ baseline: old.name, candidate: body.name, hash: body.hash })),
      ),
      identicalExpressionHashes: [...current.expressions.keys()].filter((digest) =>
        previous.expressions.has(digest),
      ),
      normalization:
        "AST tokens; comments, format, quotes, numeric separators, parentheses normalized; identifiers retained. Synthetic generator arguments, no DOM or paste execution. Scope is these concrete generated programs, not all possible arguments. Retained protocol/glue/body/expression matches receive zero new independence credit.",
      acceptedIndependentReplacementCredit: 0,
      MITClaim: false,
    });
  }
}
fs.writeFileSync(
  `${root}/embedded-expression-records.json`,
  JSON.stringify(records, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify(
    records.map((row) => ({
      owner: row.owner,
      source: row.source,
      program: row.program,
      exactSourceStringRetained: row.exactSourceStringRetained,
      parseDiagnostics: row.parseDiagnostics,
      identicalBodies: row.identicalBodies.length,
      identicalExpressionCount: row.identicalExpressionHashes.length,
    })),
    null,
    2,
  ),
);
if (records.some((row) => row.parseDiagnostics.length)) process.exitCode = 1;
