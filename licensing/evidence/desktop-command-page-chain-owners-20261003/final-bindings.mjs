import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const root = "licensing/evidence/desktop-command-page-chain-owners-20261003";
const read = (name) => JSON.parse(fs.readFileSync(`${root}/${name}`, "utf8"));
const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const retention = read("retained-bindings.json");
for (const row of retention.files) assert.equal(digest(row.path), row.sha256, row.path);
for (const owner of ["navigation", "retry", "scripts", "paste"])
  for (const row of read(`${owner}-input-freeze.json`).files)
    assert.equal(digest(row.path), row.sha256, row.path);
const spec = read("spec-freeze.json");
assert.equal(digest(spec.path), spec.sha256);
for (const row of read("pre-check-freeze.json"))
  assert.equal(digest(row.snapshotPath), row.sha256, row.snapshotPath);
const freezes = fs
  .readdirSync(root)
  .filter((name) => /-(?:initial|correction-[123])-freeze\.json$/.test(name))
  .sort()
  .map(read);
for (const row of freezes) {
  assert.equal(digest(row.rawPath), row.sha256, row.rawPath);
  assert.equal(fs.statSync(row.rawPath).size, row.bytes);
}
const paths = {
  navigation: "packages/desktop/src/main/browserView/browserCommandState.ts",
  retry: "packages/desktop/src/main/browserView/browserScreenshotTransientRetry.ts",
  scripts: "packages/desktop/src/main/browserView/browserCommandScripts.ts",
  paste: "packages/desktop/src/main/browserView/browserVirtualClipboardPageScript.ts",
};
const versions = {
  navigation: "initial",
  retry: "initial",
  scripts: "correction-3",
  paste: "correction-1",
};
const temp = fs.mkdtempSync("/tmp/knorvia-command-chain47-format-proof-");
const proofFiles = Object.keys(paths).map((owner) => {
  const destination = path.join(temp, `${owner}.ts`);
  fs.copyFileSync(`${root}/drafts/${owner}-${versions[owner]}.ts`, destination);
  return destination;
});
const format = spawnSync("node_modules/.bin/oxfmt", proofFiles, { encoding: "utf8" });
assert.equal(format.status, 0, format.stderr);
const selected = Object.entries(paths).map(([owner, installed], index) => {
  assert.deepEqual(fs.readFileSync(proofFiles[index]), fs.readFileSync(installed), installed);
  return {
    owner,
    selectedVersion: versions[owner],
    rawSha256: digest(`${root}/drafts/${owner}-${versions[owner]}.ts`),
    installedSha256: digest(installed),
    installedBytes: fs.statSync(installed).size,
    installedLines: fs.readFileSync(installed, "utf8").trimEnd().split("\n").length,
    exactFullCopyPlusFormatterOnly: true,
    curatorSemanticEdits: false,
  };
});
const baseline = read("baseline-stable-symbols-public-api.json");
const candidate = read("candidate-stable-symbols-public-api.json");
assert.deepEqual(baseline.consumerStringContract, candidate.consumerStringContract);
const differences = [];
for (const owner of Object.keys(paths))
  for (const row of candidate.compilerRaw[owner]) {
    const previous = baseline.compilerRaw[owner].find((old) => old.export === row.export);
    if (JSON.stringify(previous) !== JSON.stringify(row))
      differences.push({ owner, export: row.export });
  }
assert.deepEqual(differences, [{ owner: "paste", export: "VIRTUAL_PASTE_PAGE_FUNCTION" }]);
const gitDiff = spawnSync("git", ["diff", "--name-only"], { encoding: "utf8" });
assert.equal(gitDiff.status, 0);
assert.deepEqual(gitDiff.stdout.trim().split("\n").sort(), Object.values(paths).sort());
const result = {
  baseHead: retention.baseHead,
  selected,
  rawVersionsVerified: freezes.length,
  unchangedRetainedPaths: retention.files.length,
  retentionCountsAreNotCompletionCounts: true,
  authorInputsAndSpecFreezeVerified: true,
  consumerPublicApiMatches: true,
  compilerRawApiMatches: false,
  rawTypeDifferences: differences,
  productionScopeExactlyFourExplicitlyAuthorizedOwners: true,
  minimalSyntheticGroupsRun: 4,
  ordinaryAggregateTestsRun: false,
  nativeRuntimePassed: false,
  acceptedIndependentReplacementCredit: 0,
  MITClaim: false,
};
fs.writeFileSync(`${root}/final-retained-bindings.json`, JSON.stringify(result, null, 2) + "\n", {
  flag: "wx",
});
console.log(JSON.stringify(result, null, 2));
