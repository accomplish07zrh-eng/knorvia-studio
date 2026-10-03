import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const receipt = JSON.parse(
  await read("docs/evidence/knorvia-task-registry-observations-20261002.json"),
);
assert.equal(receipt.formatVersion, 1);
assert.equal(receipt.kind, "unchanged-predecessor-observation-freeze");
assert.equal(receipt.productionChanges, 0);
assert.equal(receipt.authorPacketChanges, 0);
assert.equal(receipt.candidateProducedInLane, false);
for (const record of [...receipt.files, ...receipt.protectedFiles, ...receipt.artifacts]) {
  const bytes = await read(record.path);
  assert.equal(sha(bytes), record.sha256, record.path);
  if (record.bytes !== undefined) assert.equal(bytes.length, record.bytes, record.path);
}
const logs = JSON.parse(await read(receipt.logArchive));
for (const run of logs.runs) assert.equal(sha(run.text), run.sha256, run.label);
for (const surface of ["source", "emitted"]) {
  const count = receipt.validation[surface];
  assert.deepEqual(count, { groups: 8, pass: 8, fail: 0, skipped: 0, cancelled: 0 });
  const log = logs.runs.find((run) => run.label.endsWith(`-${surface}`));
  assert.ok(log);
  assert.match(log.text, /[ℹ#] tests 8\n/u);
  assert.match(log.text, /[ℹ#] pass 8\n/u);
  assert.match(log.text, /[ℹ#] fail 0\n/u);
}
console.log(
  JSON.stringify({
    ok: true,
    boundFiles: receipt.files.length,
    protectedFiles: receipt.protectedFiles.length,
    actualArtifacts: receipt.artifacts.length,
    sourceGroups: 8,
    emittedGroups: 8,
  }),
);
