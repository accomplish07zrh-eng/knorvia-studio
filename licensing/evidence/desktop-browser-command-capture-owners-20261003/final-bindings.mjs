import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const root = "licensing/evidence/desktop-browser-command-capture-owners-20261003";
const read = (name) => JSON.parse(fs.readFileSync(`${root}/${name}`, "utf8"));
const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const retention = read("retained-bindings.json");
for (const row of retention.files) assert.equal(digest(row.path), row.sha256, row.path);
for (const row of read("contract-freeze.json").files)
  assert.equal(digest(row.path), row.sha256, row.path);
const freezes = fs
  .readdirSync(root)
  .filter((name) => /-(?:initial|correction-1)-freeze\.json$/.test(name))
  .sort()
  .map(read);
for (const row of freezes) {
  assert.equal(digest(row.rawPath), row.sha256, row.rawPath);
  assert.equal(fs.statSync(row.rawPath).size, row.bytes, row.rawPath);
}
const paths = {
  command: "packages/desktop/src/main/browserView/browserCommandExecutor.ts",
  capture: "packages/desktop/src/main/browserView/browserScreenshotCapture.ts",
};
const temp = fs.mkdtempSync("/tmp/knorvia-browser-command-capture-format-proof-");
const proofFiles = Object.keys(paths).map((name) => {
  const destination = path.join(temp, `${name}.ts`);
  fs.copyFileSync(`${root}/drafts/${name}-correction-1.ts`, destination);
  return destination;
});
const format = spawnSync("node_modules/.bin/oxfmt", proofFiles, { encoding: "utf8" });
assert.equal(format.status, 0, format.stderr);
const selected = Object.entries(paths).map(([owner, installed], index) => {
  assert.deepEqual(fs.readFileSync(proofFiles[index]), fs.readFileSync(installed), installed);
  return {
    owner,
    selectedVersion: "correction-1",
    rawSha256: digest(`${root}/drafts/${owner}-correction-1.ts`),
    installedSha256: digest(installed),
    installedBytes: fs.statSync(installed).size,
    installedLines: fs.readFileSync(installed, "utf8").trimEnd().split("\n").length,
    exactFullCopyPlusFormatterOnly: true,
    curatorSemanticEdits: false,
  };
});
assert.deepEqual(read("baseline-public-api.json"), read("candidate-public-api.json"));
const gitDiff = spawnSync("git", ["diff", "--name-only"], { encoding: "utf8" });
assert.equal(gitDiff.status, 0);
assert.deepEqual(gitDiff.stdout.trim().split("\n").sort(), Object.values(paths).sort());
const results = {
  baseHead: retention.baseHead,
  selected,
  rawVersionsVerified: freezes.length,
  unchangedRetainedPaths: retention.files.length,
  retentionCountsAreNotCompletionCounts: true,
  authorInputFreezeVerified: true,
  publicApiMatches: true,
  productionScopeExactlyTwoOwners: true,
  ordinaryTestsRun: false,
  nativeRuntimePassed: false,
  acceptedIndependentReplacementCredit: 0,
  MITClaim: false,
};
fs.writeFileSync(`${root}/final-retained-bindings.json`, JSON.stringify(results, null, 2) + "\n", {
  flag: "wx",
});
console.log(JSON.stringify(results, null, 2));
