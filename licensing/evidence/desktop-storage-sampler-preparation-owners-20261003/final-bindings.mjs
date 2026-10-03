import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const root = "licensing/evidence/desktop-storage-sampler-preparation-owners-20261003";
const read = (name) => JSON.parse(fs.readFileSync(`${root}/${name}`, "utf8"));
const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const retained = read("retained-bindings.json");
for (const row of retained.files) assert.equal(digest(row.path), row.sha256, row.path);
for (const owner of ["disk", "preparation"])
  for (const row of read(`${owner}-input-freeze.json`).files)
    assert.equal(digest(row.path), row.sha256, row.path);
const spec = read("spec-freeze.json");
assert.equal(digest(spec.path), spec.sha256);
for (const row of read("pre-check-freeze.json")) assert.equal(digest(row.snapshotPath), row.sha256);
const freezes = fs
  .readdirSync(root)
  .filter((name) => /^(disk|preparation)-(initial|correction-1)-freeze\.json$/.test(name))
  .map(read);
for (const row of freezes) {
  assert.equal(digest(row.rawPath), row.sha256);
  assert.equal(fs.statSync(row.rawPath).size, row.bytes);
}
const owners = { disk: "startupDiskSampler.ts", preparation: "storagePreparationProcesses.ts" };
const selectedVersions = { disk: "initial", preparation: "correction-1" };
const selected = [];
for (const [owner, file] of Object.entries(owners)) {
  const installed = `packages/desktop/src/host/${file}`;
  const raw = `${root}/drafts/${owner}-${selectedVersions[owner]}.ts`;
  const temp = path.join(fs.mkdtempSync("/tmp/knorvia-storage50-format-proof-"), file);
  fs.copyFileSync(raw, temp);
  const format = spawnSync("node_modules/.bin/oxfmt", [temp], { encoding: "utf8" });
  assert.equal(format.status, 0, format.stderr);
  assert.deepEqual(fs.readFileSync(temp), fs.readFileSync(installed));
  selected.push({
    owner,
    selectedVersion: selectedVersions[owner],
    rawSha256: digest(raw),
    installedSha256: digest(installed),
    installedLines: fs.readFileSync(installed, "utf8").trimEnd().split("\n").length,
    installedBytes: fs.statSync(installed).size,
  });
}
assert.deepEqual(
  read("baseline-stable-symbols-public-api.json"),
  read("candidate-stable-symbols-public-api.json"),
);
const hold = read("prompt-transfer-hold.json");
assert.equal(digest(hold.path), hold.currentLocalSha256);
assert.equal(hold.acceptedPrivateBytesAccessible, false);
assert.equal(hold.localAcceptedBytesEqualityVerified, false);
const diff = spawnSync("git", ["diff", "--name-only"], { encoding: "utf8" });
assert.equal(diff.status, 0);
assert.deepEqual(
  diff.stdout.trim().split("\n").sort(),
  Object.values(owners)
    .map((file) => `packages/desktop/src/host/${file}`)
    .sort(),
);
const result = {
  baseHead: retained.baseHead,
  selected,
  exactWholeLiteralPlusFormatter: true,
  curatorSemanticEdits: false,
  rawVersionsVerified: freezes.length,
  unchangedRetainedPaths: retained.files.length,
  retentionCountsAreNotCompletion: true,
  authorInputAndSpecFreezeVerified: true,
  publicAndSerializedCompilerRawApiMatch: true,
  productionScopeExactlyTwoOwners: true,
  promptTransferPrivateAcceptedHold: true,
  promptTransferLocalMatchesAcceptedPrivateBytes: false,
  minimalSyntheticGroups: 2,
  nativeRuntimePassed: false,
  ordinarySuiteBuildRun: false,
  acceptedIndependentCredit: 0,
  MITClaim: false,
};
fs.writeFileSync(`${root}/final-retained-bindings.json`, JSON.stringify(result, null, 2) + "\n", {
  flag: "wx",
});
console.log(JSON.stringify(result, null, 2));
