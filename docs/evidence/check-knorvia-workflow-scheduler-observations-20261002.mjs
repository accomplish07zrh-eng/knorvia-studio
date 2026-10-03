import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const root = new URL("../../", import.meta.url);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const receipt = JSON.parse(
  await readFile(
    new URL("./knorvia-workflow-scheduler-observations-20261002.json", import.meta.url),
    "utf8",
  ),
);
assert.equal(receipt.formatVersion, 1);
assert.equal(receipt.kind, "restricted-workflow-scheduler-packet-and-predecessor-freeze");
assert.equal(receipt.productionChanges, 0);
assert.equal(receipt.candidateProduced, false);
assert.equal(receipt.nativeAuthorRetries, 0);
assert.equal(receipt.packetFiles.length, 6);
for (const item of [
  ...receipt.packetFiles,
  ...receipt.freezeFiles,
  ...receipt.historicalReceipts,
]) {
  const bytes = await readFile(new URL(item.path, root));
  assert.equal(sha(bytes), item.sha256, item.path);
  assert.equal(bytes.byteLength, item.bytes, item.path);
}
const archive = JSON.parse(await readFile(new URL(receipt.baselineArchive, root), "utf8"));
assert.equal(sha(archive.compiled), archive.emittedSha256);
assert.equal(sha(archive.declaration), archive.declarationSha256);
const pins = JSON.parse(await readFile(new URL(receipt.currentSelector, root), "utf8"));
for (const [path, digest] of Object.entries(pins.files)) {
  assert.equal(sha(await readFile(new URL(`apps/cli/packages/core/${path}`, root))), digest, path);
}
assert.equal(receipt.validation.distinctGroupsPerMode, 7);
assert.equal(receipt.validation.runtimeGroups, 5);
assert.equal(receipt.validation.consumerAndSelectorGroups, 2);
assert.equal(receipt.validation.consumerRecheckIsOverlap, true);
assert.equal(receipt.validation.reusedHistoricalGroupRerun, false);
assert.equal(receipt.validation.scopedCompilerDiagnostics, 0);
assert.equal(receipt.validation.supportingTypePairs, 19);
assert.equal(receipt.validation.schedulerTypePairs, 17);
assert.equal(receipt.validation.parsedBodiesInitializersComments, 0);
assert.equal(receipt.grant, null);
console.log(
  `PASS: six closed author inputs, ${receipt.freezeFiles.length} freeze/evidence files, ${Object.keys(pins.files).length} exact current artifact bindings; historical artifacts and seven distinct groups/mode`,
);
