const fs = require("node:fs");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const root = process.cwd();
const core = root + "/apps/cli/packages/core/";
const read = (p) => fs.readFileSync(p, "utf8");
const hash = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const manifest = core + "test/runtime-stream-five-current-20261003.json";
assert.equal(hash(manifest), "4d88af5282a218999245472016f43adefe77a6dab1d940825485e2b520a7606a");
const pins = JSON.parse(read(manifest)).files;
for (const [p, digest] of Object.entries(pins)) assert.equal(hash(core + p), digest, p);
const owners = ["conversation", "streaming-tool-ledger", "streaming-tool-coordinator", "model-streaming-event-queue", "streaming-recovery"];
let packetFiles = 0;
for (const owner of owners) {
  const receipt = JSON.parse(read(root + `/docs/evidence/knorvia-runtime-${owner}-receipt-20261003.json`));
  const old = root + "/" + receipt.historicalOracle.path;
  assert.equal(hash(old), receipt.historicalOracle.sha256);
  const fields = JSON.parse(read(old)).files[owner];
  for (const field of ["source", "compiled", "declaration"]) {
    assert.equal(crypto.createHash("sha256").update(fields[field]).digest("hex"), fields[field + "Sha256"]);
  }
  for (const [p, digest] of Object.entries(receipt.packetAndDraftPins)) {
    assert.equal(hash(root + `/docs/evidence/runtime-${owner}-author-20261003/` + p), digest, p);
    packetFiles++;
  }
}
const report = JSON.parse(read(root + "/docs/evidence/runtime-stream-five-checks-20261003/scoped-types.json"));
assert.equal(report.diagnostics.length, 0);
let signatures = 0;
for (const api of report.api) {
  assert.deepEqual(api.after, api.before);
  assert.equal(api.fixedDeclarationFactsEqual, true);
  signatures += Object.values(api.after).filter(Array.isArray).reduce((total, rows) => total + rows.length, 0);
}
console.log(JSON.stringify({ currentArtifacts: Object.keys(pins).length, historicalOracles: owners.length, packetAndDraftFiles: packetFiles, callSignatures: signatures, exportedLiteralConstants: 1, limits: "Digest/API report verification, not a behavior run or expression/licence proof." }, null, 2));
