import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const root = "licensing/evidence/desktop-cron-claim-owner-20261003";
const read = (name) => JSON.parse(fs.readFileSync(`${root}/${name}`, "utf8"));
const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const retained = read("retained-bindings.json");
for (const row of retained.files) assert.equal(digest(row.path), row.sha256, row.path);
for (const row of read("author-input-freeze.json").files)
  assert.equal(digest(row.path), row.sha256, row.path);
const spec = read("spec-freeze.json");
assert.equal(digest(spec.path), spec.sha256);
for (const row of read("pre-check-freeze.json")) assert.equal(digest(row.snapshotPath), row.sha256);
const freezes = fs
  .readdirSync(root)
  .filter((name) => /^cron-(initial|correction-1)-freeze\.json$/.test(name))
  .map(read);
for (const row of freezes) {
  assert.equal(digest(row.rawPath), row.sha256);
  assert.equal(fs.statSync(row.rawPath).size, row.bytes);
}
const installed = "packages/desktop/src/host/cronRunLifecycle.ts";
const raw = `${root}/drafts/cron-correction-1.ts`;
const temp = path.join(fs.mkdtempSync("/tmp/knorvia-cron49-format-proof-"), "cron.ts");
fs.copyFileSync(raw, temp);
const format = spawnSync("node_modules/.bin/oxfmt", [temp], { encoding: "utf8" });
assert.equal(format.status, 0, format.stderr);
assert.deepEqual(fs.readFileSync(temp), fs.readFileSync(installed));
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
assert.deepEqual(diff.stdout.trim().split("\n"), [installed]);
const result = {
  baseHead: retained.baseHead,
  selectedVersion: "correction-1",
  rawSha256: digest(raw),
  installedSha256: digest(installed),
  installedLines: fs.readFileSync(installed, "utf8").trimEnd().split("\n").length,
  installedBytes: fs.statSync(installed).size,
  exactWholeLiteralPlusFormatter: true,
  curatorSemanticEdits: false,
  rawVersionsVerified: freezes.length,
  unchangedRetainedPaths: retained.files.length,
  retentionCountsAreNotCompletion: true,
  authorInputAndSpecFreezeVerified: true,
  publicFourExportsAndRawApiMatch: true,
  productionScopeExactlyOneOwner: true,
  promptTransferPrivateAcceptedHold: true,
  promptTransferLocalMatchesAcceptedPrivateBytes: false,
  minimalSyntheticGroups: 1,
  nativeRuntimePassed: false,
  ordinarySuiteBuildRun: false,
  acceptedIndependentCredit: 0,
  MITClaim: false,
};
fs.writeFileSync(`${root}/final-retained-bindings.json`, JSON.stringify(result, null, 2) + "\n", {
  flag: "wx",
});
console.log(JSON.stringify(result, null, 2));
