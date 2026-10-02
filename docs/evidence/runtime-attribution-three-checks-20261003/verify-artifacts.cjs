const fs = require("node:fs");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const ts = require(process.cwd() + "/node_modules/typescript");
const root = process.cwd();
const core = path.join(root, "apps/cli/packages/core");
const read = (p) => fs.readFileSync(p, "utf8");
const hash = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const historical = {
  background: "98f7010aa664a834bf79675d7ed83aa5ddd99955ee730d7558fd1241e59a594f",
  "model-status": "1589939e9229f7261046fa473f5be51ac38efeeffabc772b07ff6f13ded691e8",
  "usage-observability": "917c7909aabdd7753a4e3bd5744dea9b324c1b21cfa26982ccdc2c1dd3e13446",
};
const manifest = path.join(core, "test/runtime-attribution-three-current-20261003.json");
assert.equal(hash(manifest), "9c52d65292f6553eb1114882302d55bbf4255e7a4a4b3a5c9c5253582de5902a");
const pins = JSON.parse(read(manifest)).files;
for (const [p, digest] of Object.entries(pins)) assert.equal(hash(path.join(core, p)), digest, p);
const facts = [];
const printer = ts.createPrinter({ removeComments: true });
function declarationFacts(text) {
  const file = ts.createSourceFile("facts.d.ts", text, ts.ScriptTarget.Latest, true);
  return file.statements
    .filter((node) => !ts.isImportDeclaration(node) && !ts.isFunctionDeclaration(node))
    .map((node) => printer.printNode(ts.EmitHint.Unspecified, node, file));
}
let packetFiles = 0;
for (const [owner, digest] of Object.entries(historical)) {
  const baseline = path.join(core, `test/runtime-${owner}-baseline-20261003.json`);
  assert.equal(hash(baseline), digest);
  const old = JSON.parse(read(baseline)).files[owner];
  for (const field of ["source", "compiled", "declaration"]) {
    assert.equal(crypto.createHash("sha256").update(old[field]).digest("hex"), old[field + "Sha256"]);
  }
  const before = declarationFacts(old.declaration);
  const after = declarationFacts(read(path.join(core, `dist/runtime/methods/${owner}.d.ts`)));
  assert.deepEqual(after, before, owner);
  facts.push({ owner, fixedDeclarationStatements: before.length, equal: true });
  const receipt = JSON.parse(read(path.join(root, `docs/evidence/knorvia-runtime-${owner}-receipt-20261003.json`)));
  for (const [p, digest] of Object.entries(receipt.packetAndDraftPins)) {
    assert.equal(hash(path.join(root, `docs/evidence/runtime-${owner}-author-20261003`, p)), digest, p);
    packetFiles++;
  }
}
console.log(JSON.stringify({ currentArtifacts: Object.keys(pins).length, historicalOracles: 3, packetAndDraftFiles: packetFiles, facts, limitations: "Declaration facts exclude functions/imports; scoped compiler report proves call signatures. Not a behavior suite or licence proof." }, null, 2));
