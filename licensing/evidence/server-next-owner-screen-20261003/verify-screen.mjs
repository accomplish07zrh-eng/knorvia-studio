import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const root = "licensing/evidence/server-next-owner-screen-20261003";
const read = (name) => JSON.parse(fs.readFileSync(`${root}/${name}`, "utf8"));
const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
for (const row of read("metadata-input-bindings.json"))
  assert.equal(digest(row.path), row.sha256, row.path);
const protectedFiles = read("protected-retention.json");
for (const row of protectedFiles.files) assert.equal(digest(row.path), row.sha256, row.path);
const server = read("server-exact-receipts.json");
assert.equal(server.files.length, 47);
assert.deepEqual(server.eligibleNewServerOwners, []);
const counts = {
  priorExactCandidateReceipts: 0,
  rootExcluded: 0,
  retainedDeclarationsConfigurationExports: 0,
};
for (const row of server.files) {
  if (row.screen.startsWith("current bytes exactly")) {
    counts.priorExactCandidateReceipts++;
    assert.ok(row.exactOwnerHashReceipts.length);
    for (const receipt of row.exactOwnerHashReceipts)
      assert.ok(Object.values(receipt.fields).includes(row.sha256));
  } else if (row.screen.startsWith("excluded root")) counts.rootExcluded++;
  else if (row.screen.startsWith("retained configuration"))
    counts.retainedDeclarationsConfigurationExports++;
  else assert.fail(row.path);
}
assert.deepEqual(counts, server.screenCounts);
const desktop = read("desktop-next-candidates.json");
assert.equal(desktop.files.length, 2);
for (const row of desktop.files) {
  assert.equal(row.sha256, row.inventory.sha256);
  assert.equal(row.exactReviews.length, 0);
  assert.equal(row.matchesPreviousBoundedHash, true);
}
for (const pr of read("pr-scope-screen.json")) {
  assert.equal(pr.changedFiles, pr.returnedFilenameCount);
  assert.deepEqual(pr.candidateOverlap, []);
}
const diff = spawnSync("git", ["diff", "--name-only"], { encoding: "utf8" });
assert.equal(diff.status, 0);
assert.equal(diff.stdout.trim(), ""); // Report-only files are untracked before staging.
const output = {
  baseHead: protectedFiles.baseHead,
  serverScreenCounts: counts,
  eligibleNewServerOwners: 0,
  desktopReportOnlyCandidates: 2,
  exactMetadataInputsVerified: true,
  protectedPathsUnchanged: protectedFiles.files.length,
  trackedSourceDiff: false,
  sourceRuntimeTestsBuildTypesLintRun: false,
  MITClaim: false,
};
fs.writeFileSync(`${root}/screen-verification.json`, JSON.stringify(output, null, 2) + "\n", {
  flag: "wx",
});
console.log(JSON.stringify(output, null, 2));
