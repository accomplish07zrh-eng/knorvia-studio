// Read-only digest/schema validator; source-exposed lane receipt patterns, no licence grant.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const run = promisify(execFile);
const git = async (...args) =>
  (await run("git", args, { cwd: root, encoding: "buffer", maxBuffer: 1024 * 1024 })).stdout;
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const blob = (b) => createHash("sha1").update(`blob ${b.length}\0`).update(b).digest("hex");
const receipt = JSON.parse(
  await read("docs/evidence/knorvia-get-workflow-run-snapshot-fast-checks-20261001.json"),
);
assert.equal(receipt.formatVersion, 1);
assert.equal(receipt.kind, "GetWorkflowRun snapshot fields source-exposed receipt");
assert.equal(receipt.lane, "parallel/cli-tools-fast-20261001");
assert.equal(receipt.licenseDecision, null);
assert.equal(receipt.sourceExposure.cleanRoom, false);
assert.equal(receipt.sourceExposure.sharedProvenanceEdited, false);
assert.equal(receipt.sourceExposure.attributionRetained, true);
assert.equal(receipt.unresolvedMaterialObligations, 27);
assert.equal(receipt.parentReportedRemainingObligations, 26);
for (const commit of [receipt.baselineCommit, receipt.freezeCommit, receipt.productionCommit])
  assert.match(commit, /^[a-f0-9]{40}$/u);
await git("merge-base", "--is-ancestor", receipt.baselineCommit, receipt.freezeCommit);
await git("merge-base", "--is-ancestor", receipt.freezeCommit, receipt.productionCommit);
await git("merge-base", "--is-ancestor", receipt.productionCommit, "HEAD");
const unique = new Set();
for (const file of receipt.files) {
  assert.equal(unique.has(file.path), false);
  unique.add(file.path);
  assert.equal(file.commit, receipt.productionCommit);
  assert.equal(file.licenseDecision, null);
  assert.equal(file.sourceExposed, true);
  assert.equal(file.attributionMustRemain, true);
  assert.ok(file.retainedMaterial.length > 0 && file.newlyStructuredExpression.length > 0);
  const bytes = await read(file.path);
  assert.equal(bytes.length, file.bytes, file.path);
  assert.equal(sha(bytes), file.sha256, file.path);
  assert.equal(blob(bytes), file.blob, file.path);
  assert.equal(
    sha(Buffer.from(bytes.toString().replace(/\r\n?/gu, "\n"))),
    file.normalizedSha256,
    file.path,
  );
  assert.equal(
    (await git("rev-parse", `${file.commit}:${file.path}`)).toString().trim(),
    file.blob,
    file.path,
  );
  assert.equal(
    (await git("log", "-1", "--format=%H", file.commit, "--", file.path)).toString().trim(),
    file.lastChangeCommit,
    file.path,
  );
}
assert.equal(unique.size, 9);
const tuple =
  receipt.files
    .map((f) => [f.commit, f.path, f.blob, f.bytes, f.sha256, f.normalizedSha256].join("\t"))
    .sort()
    .join("\n") + "\n";
assert.equal(sha(tuple), receipt.filesTupleSha256);
for (const file of [...receipt.protectedInputs, ...receipt.checks.coreLint.unchangedFiles]) {
  const bytes = await read(file.path);
  assert.equal(bytes.length, file.bytes, file.path);
  assert.equal(sha(bytes), file.sha256, file.path);
  assert.equal(blob(bytes), file.blob, file.path);
  assert.equal(
    (await git("rev-parse", `${receipt.baselineCommit}:${file.path}`)).toString().trim(),
    file.blob,
    file.path,
  );
}
const allowed = new Set(receipt.allowedPaths);
assert.equal(allowed.size, 12);
const paths = async (...args) => (await git(...args)).toString().trim().split("\n").filter(Boolean);
for (const path of [
  ...(await paths("diff", "--name-only", receipt.baselineCommit)),
  ...(await paths("ls-files", "--others", "--exclude-standard")),
])
  assert.equal(allowed.has(path), true, path);
for (const region of receipt.retainedRegions) {
  const old = (await git("show", `${receipt.baselineCommit}:${region.path}`)).toString(),
    current = (await read(region.path)).toString();
  const extract = (text) =>
    text
      .slice(
        text.indexOf(region.start),
        region.end ? text.indexOf(region.end, text.indexOf(region.start)) : undefined,
      )
      .trim();
  assert.ok(old.includes(region.start) && current.includes(region.start));
  assert.equal(extract(old), extract(current), region.name);
  assert.equal(sha(extract(current)), region.sha256, region.name);
}
const lineage = receipt.lineage,
  old = await git("show", `${receipt.baselineCommit}:${lineage.path}`);
assert.equal(sha(old), lineage.baselineSha256);
assert.equal(blob(old), lineage.baselineBlob);
assert.equal(lineage.publisherBytesLocallyVerified, false);
assert.deepEqual(
  (await git("log", "--format=%H", receipt.baselineCommit, "--", lineage.path))
    .toString()
    .trim()
    .split("\n"),
  lineage.localHistory,
);
const upstream = JSON.parse(await read("licensing/upstream-baseline.json"));
assert.equal(upstream.commit, receipt.upstreamCommit);
const pub = upstream.files.find((f) => f.path === lineage.upstreamPath);
assert.equal(pub.blob, lineage.upstreamBlob);
assert.equal(pub.normalizedSha256, lineage.upstreamSha256);
assert.equal(pub.bytes, lineage.upstreamBytes);
const ledger = JSON.parse(await read("licensing/current-files.json")).files.find(
  (f) => f.path === lineage.path,
);
assert.equal(ledger.normalizedSha256, lineage.baselineSha256);
assert.equal(ledger.classification, lineage.ledgerClassification);
assert.equal(ledger.review, null);
const frozen = receipt.frozen,
  bytes = await read(frozen.path),
  data = JSON.parse(bytes);
assert.equal(bytes.length, frozen.bytes);
assert.equal(sha(bytes), frozen.sha256);
assert.equal(
  blob(bytes),
  (await git("rev-parse", `${receipt.freezeCommit}:${frozen.path}`)).toString().trim(),
);
assert.equal(data.directDigests.length, 44);
assert.equal(data.executorDigests.length, 10);
assert.equal(data.edgeDigests.length, 112);
assert.equal(frozen.namedTestsPerMode, 6);
assert.deepEqual(data.metadata.timeout, {
  kind: "timed",
  defaultMs: 10000,
  maxMs: 10000,
  allowCallOverride: false,
});
assert.equal(data.metadata.cancellation.supported, false);
const archive = JSON.parse(await read(frozen.archivePath));
assert.equal(archive.source, old.toString());
assert.equal(archive.commit, receipt.baselineCommit);
assert.equal(archive.sourceSha256, sha(archive.source));
assert.equal(archive.compiledSha256, sha(archive.compiled));
for (const [key, value] of Object.entries(frozen.archive)) assert.equal(archive[key], value, key);
for (const name of ["source", "emitted", "frozenSource", "frozenEmitted"]) {
  const c = receipt.checks[name];
  assert.equal(c.tests, 6);
  assert.equal(c.pass, 6);
  assert.equal(c.fail, 0);
  assert.equal(c.cancelled, 0);
  assert.equal(c.skipped, 0);
}
assert.equal(receipt.checks.relatedSource.tests, 64);
assert.equal(receipt.checks.relatedSource.pass, 64);
assert.equal(receipt.checks.relatedSource.fail, 0);
assert.equal(receipt.cadence.fullSuiteRun, false);
assert.equal(receipt.cadence.fullCliBuildRun, false);
assert.equal(receipt.cadence.desktopBuildRun, false);
assert.equal(receipt.cadence.corePackageEmissionRun, true);
for (const values of [data.directDigests, data.executorDigests, data.edgeDigests])
  for (const digest of values) assert.match(digest, /^[a-f0-9]{64}$/u);
assert.equal(receipt.checks.coreLint.pass, false);
assert.equal(receipt.checks.coreLint.errors, 24);
assert.equal(receipt.checks.coreLint.warnings, 11);
assert.equal(receipt.checks.coreLint.unchangedFiles.length, 27);
assert.equal(receipt.checks.ownedLint.errors, 0);
assert.equal(receipt.checks.ownedLint.warnings, 2);
for (const name of [
  "coreEmission",
  "rootTypes",
  "coreTypes",
  "rootLint",
  "ownedLint",
  "format",
  "architecture",
  "architectureChanged",
])
  assert.equal(receipt.checks[name].pass, true, name);
for (const check of Object.values(receipt.checks)) {
  assert.equal(typeof check.logPath, "string");
  assert.ok(Number.isSafeInteger(check.bytes));
  assert.match(check.sha256, /^[a-f0-9]{64}$/u);
  if (process.argv.includes("--logs")) {
    const bytes = await readFile(check.logPath);
    assert.equal(bytes.length, check.bytes, check.logPath);
    assert.equal(sha(bytes), check.sha256, check.logPath);
  }
}
for (const file of receipt.evidenceArtifacts) {
  const bytes = await read(file.path);
  assert.equal(bytes.length, file.bytes, file.path);
  assert.equal(sha(bytes), file.sha256, file.path);
}
if (process.argv.includes("--emitted")) {
  for (const file of receipt.emittedFiles) {
    const bytes = await read(file.path);
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(sha(bytes), file.sha256, file.path);
  }
  assert.equal(
    (await read("apps/cli/packages/core/dist/tool/handlers/get-workflow-run.d.ts")).toString(),
    data.declaration,
  );
  assert.ok(
    (await read("apps/cli/packages/core/dist/tool/handlers/get-workflow-run.js"))
      .toString()
      .includes("projectGetWorkflowRunSnapshotFields"),
  );
}
console.log(
  JSON.stringify({
    files: unique.size,
    protected: receipt.protectedInputs.length,
    emitted: receipt.emittedFiles.length,
    allowed: allowed.size,
    tupleSha256: receipt.filesTupleSha256,
    logsChecked: process.argv.includes("--logs"),
    emittedChecked: process.argv.includes("--emitted"),
    licenseDecision: null,
  }),
);
