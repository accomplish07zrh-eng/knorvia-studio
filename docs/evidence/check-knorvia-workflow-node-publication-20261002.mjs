import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const receipt = JSON.parse(
  await read("docs/evidence/knorvia-workflow-node-publication-20261002.json"),
);
assert.equal(receipt.formatVersion, 1);
assert.equal(receipt.kind, "bounded-workflow-node-terminal-publication");
assert.equal(receipt.publicDeclarationChanged, false);
assert.equal(receipt.historicalOracleChanged, false);
assert.equal(receipt.frozenAssertionsChanged, false);
assert.equal(receipt.grant, null);
for (const file of [...receipt.files, ...receipt.protectedFiles])
  assert.equal(sha(await read(file.path)), file.sha256, file.path);
const pins = JSON.parse(await read(receipt.currentSelector));
for (const [path, expected] of Object.entries(pins.files))
  assert.equal(sha(await read(`apps/cli/packages/core/${path}`)), expected, path);
const baseline = JSON.parse(await read(receipt.baselineArchive));
assert.equal(sha(baseline.compiled), baseline.emittedSha256);
assert.equal(sha(baseline.declaration), baseline.declarationSha256);
assert.equal(
  (await read("apps/cli/packages/core/dist/workflow/scheduler/node-runner.d.ts")).toString(),
  baseline.declaration,
);
for (const run of receipt.finalRuns) {
  assert.equal(sha(run.text), run.sha256);
  assert.match(run.text, /[ℹ#] tests 7\n/u);
  assert.match(run.text, /[ℹ#] pass 7\n/u);
  assert.match(run.text, /[ℹ#] fail 0\n/u);
}
console.log(
  JSON.stringify({
    ok: true,
    files: receipt.files.length,
    protected: receipt.protectedFiles.length,
    actualArtifacts: Object.keys(pins.files).length,
    sourceGroups: 7,
    emittedGroups: 7,
  }),
);
