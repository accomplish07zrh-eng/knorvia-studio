const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const repo = path.resolve(__dirname, "../../.."),
  ts = require(path.join(repo, "node_modules/typescript")),
  hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
const baselineBytes = fs.readFileSync(
    path.join(repo, "apps/cli/packages/core/test/turn-machine-baseline-20261003.json"),
  ),
  baseline = JSON.parse(baselineBytes);
const freeze = JSON.parse(fs.readFileSync(path.join(__dirname, "freeze.json")));
assert.equal(
  hash(baselineBytes),
  freeze.freeze["apps/cli/packages/core/test/turn-machine-baseline-20261003.json"],
);
const draftBytes = fs.readFileSync(
  path.join(repo, "docs/evidence/turn-machine-author-20261003/draft-01/candidate.ts"),
);
assert.equal(hash(draftBytes), "164e7f33a00d2e0ced92d11e845773483a9636f6960c531a2b1a116ce083b3d2");
const candidate = ts.transpileModule(draftBytes.toString(), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
function members(text) {
  const sf = ts.createSourceFile(
      "selected.js",
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    ),
    owner = sf.statements.find(
      (n) => ts.isClassDeclaration(n) && n.name.text === "TurnMachineImpl",
    ),
    printer = ts.createPrinter({ removeComments: true });
  return Object.fromEntries(
    owner.members
      .filter((n) => ts.isMethodDeclaration(n) && n.body)
      .map((n) => [n.name.getText(sf), printer.printNode(ts.EmitHint.Unspecified, n.body, sf)]),
  );
}
function ast(text) {
  function visit(n) {
    const children = [];
    n.forEachChild((x) => {
      children.push(visit(x));
    });
    return [
      n.kind,
      ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) ? n.text : undefined,
      children,
    ];
  }
  return JSON.stringify(
    visit(ts.createSourceFile("body.js", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)),
  );
}
const original = members(baseline.file.compiled),
  proposed = members(candidate),
  matching = [];
for (const [name, body] of Object.entries(original)) {
  const normalized = body
    .replace(/\bPhase\b/gu, "TurnPhase")
    .replace(/\btransition\b/gu, "transitionTo")
    .replace(/\btc\b/gu, "call")
    .replace(/\bp\b/gu, "request");
  if (ast(normalized) === ast(proposed[name === "transition" ? "transitionTo" : name]))
    matching.push(name);
}
assert.deepEqual(
  matching,
  JSON.parse(fs.readFileSync(path.join(__dirname, "expression-decision.json")))
    .matchingBodiesAfterDisclosedRenames,
);
console.log(
  JSON.stringify({
    matchingBodiesAfterDisclosedRenames: matching,
    syntaxOnly: true,
    originalityCredit: 0,
    candidateInstalled: false,
  }),
);
