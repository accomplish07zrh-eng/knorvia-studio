// Read-only validator reuses earlier source-exposed lane receipt patterns; no licence grant.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
const root = fileURLToPath(new URL("../../", import.meta.url)),
  run = promisify(execFile);
const git = async (...args) =>
  (await run("git", args, { cwd: root, encoding: "buffer", maxBuffer: 1024 * 1024 })).stdout;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const blobHash = (bytes) =>
  createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
const normalized = (bytes) => Buffer.from(bytes.toString("utf8").replace(/\r\n?/gu, "\n"));
const stable = (value) =>
  Array.isArray(value)
    ? value.map(stable)
    : value !== null && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, stable(value[key])]),
        )
      : value;
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url));
const hex = (value, length) => assert.match(value, new RegExp(`^[a-f0-9]{${length}}$`));
const receipt = JSON.parse(
  await readFile(
    new URL("./knorvia-escalate-orchestration-fast-checks-20261001.json", import.meta.url),
    "utf8",
  ),
);
assert.equal(receipt.formatVersion, 1);
assert.equal(receipt.kind, "Escalate orchestration source-exposed implementation receipt");
assert.equal(receipt.lane, "parallel/cli-tools-fast-20261001");
for (const commit of [receipt.baselineCommit, receipt.freezeCommit, receipt.productionCommit])
  hex(commit, 40);
await git("merge-base", "--is-ancestor", receipt.baselineCommit, receipt.freezeCommit);
await git("merge-base", "--is-ancestor", receipt.freezeCommit, receipt.productionCommit);
await git("merge-base", "--is-ancestor", receipt.productionCommit, "HEAD");
assert.equal(receipt.licenseDecision, null);
assert.equal(receipt.sourceExposure.cleanRoom, false);
assert.equal(receipt.sourceExposure.sharedProvenanceEdited, false);
assert.equal(receipt.sourceExposure.attributionRetained, true);
assert.equal(receipt.unresolvedMaterialObligations, 27);
assert.equal(receipt.parentReportedUpdates.remainingMaterialObligations, 26);
assert.equal(receipt.parentReportedUpdates.locallyVerified, false);
assert.equal(receipt.testPhases.appendedTests, 0);
assert.equal(receipt.testPhases.completionEdgeTestsPresentBeforeProduction, true);
assert.equal(receipt.testPhases.noNewTimeoutForTests, true);
for (const mode of ["source", "emitted", "frozenSource", "frozenEmitted"]) {
  const check = receipt.checks[mode];
  assert.equal(check.tests, 15);
  assert.equal(check.pass, 15);
  assert.equal(check.fail, 0);
  assert.equal(check.cancelled, 0);
  assert.equal(check.skipped, 0);
}
assert.equal(receipt.checks.relatedSource.tests, 85);
assert.equal(receipt.checks.relatedSource.pass, 85);
assert.equal(receipt.checks.relatedSource.fail, 0);
const full = receipt.checks.fullRegression;
assert.equal(full.tests, 6270);
assert.equal(full.pass, 6262);
assert.equal(full.skipped, 8);
assert.equal(full.fail, 0);
assert.equal(full.cancelled, 0);
assert.equal(full.testFiles, 526);
assert.equal(full.tests, full.pass + full.skipped);
assert.equal(receipt.checks.ownedLint.errors, 0);
assert.equal(receipt.checks.ownedLint.warnings, 2);
assert.equal(receipt.checks.coreLint.pass, false);
assert.equal(receipt.checks.coreLint.errors, 24);
assert.equal(receipt.checks.coreLint.warnings, 11);
assert.equal(receipt.checks.coreLint.unchangedFiles.length, 27);
for (const name of [
  "cliBuild",
  "rootTypes",
  "cliTypes",
  "rootLint",
  "cliLint",
  "ownedLint",
  "format",
  "architectureChanged",
  "architecture",
  "evidenceLint",
  "evidenceFormatFinal",
  "evidenceRootLintFinal",
  "evidenceArchitectureChangedFinal",
  "evidenceArchitectureFinal",
  "evidenceDigestFinal",
])
  assert.equal(receipt.checks[name].pass, true, name);
for (const check of [...Object.values(receipt.checks), receipt.preFreezeFailureEvidence]) {
  assert.equal(typeof check.logPath, "string");
  assert.ok(Number.isSafeInteger(check.bytes) && check.bytes >= 0);
  hex(check.sha256, 64);
  if (process.argv.includes("--logs")) {
    const bytes = await readFile(check.logPath);
    assert.equal(bytes.length, check.bytes, check.logPath);
    assert.equal(sha(bytes), check.sha256, check.logPath);
  }
}
const unique = new Set();
for (const file of receipt.files) {
  assert.equal(unique.has(file.path), false);
  unique.add(file.path);
  assert.equal(file.commit, receipt.productionCommit);
  assert.equal(file.licenseDecision, null);
  assert.equal(file.sourceExposed, true);
  assert.equal(file.attributionMustRemain, true);
  hex(file.blob, 40);
  hex(file.sha256, 64);
  hex(file.normalizedSha256, 64);
  assert.ok(Array.isArray(file.retainedMaterial) && file.retainedMaterial.length > 0);
  assert.ok(
    Array.isArray(file.newlyStructuredExpression) && file.newlyStructuredExpression.length > 0,
  );
  const bytes = await read(file.path);
  assert.equal(bytes.length, file.bytes, file.path);
  assert.equal(sha(bytes), file.sha256, file.path);
  assert.equal(sha(normalized(bytes)), file.normalizedSha256, file.path);
  assert.equal(blobHash(bytes), file.blob, file.path);
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
assert.equal(unique.size, 10);
const tuple =
  receipt.files
    .map((f) => [f.commit, f.path, f.blob, f.bytes, f.sha256, f.normalizedSha256].join("\t"))
    .sort()
    .join("\n") + "\n";
assert.equal(sha(tuple), receipt.filesTupleSha256);
for (const file of [...receipt.protectedInputs, ...receipt.checks.coreLint.unchangedFiles]) {
  const bytes = await read(file.path),
    baselineBlob = (await git("rev-parse", `${receipt.baselineCommit}:${file.path}`))
      .toString()
      .trim();
  assert.equal(bytes.length, file.bytes, file.path);
  assert.equal(sha(bytes), file.sha256, file.path);
  assert.equal(blobHash(bytes), baselineBlob, file.path);
  assert.equal(file.blob, baselineBlob, file.path);
}
const allowed = new Set(receipt.allowedPaths);
assert.equal(allowed.size, 13);
for (const path of unique) assert.equal(allowed.has(path), true, path);
const paths = async (...args) => (await git(...args)).toString().trim().split("\n").filter(Boolean);
const changed = await paths("diff", "--name-only", receipt.baselineCommit),
  untracked = await paths("ls-files", "--others", "--exclude-standard");
for (const path of [...changed, ...untracked]) assert.equal(allowed.has(path), true, path);
for (const path of receipt.selectionEvidence.acceptedBoundariesProtected)
  assert.equal(
    receipt.protectedInputs.some((f) => f.path === path),
    true,
    path,
  );
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
  assert.ok(old.includes(region.start) && current.includes(region.start), region.name);
  if (region.end) assert.ok(old.includes(region.end) && current.includes(region.end), region.name);
  assert.equal(extract(current), extract(old), region.name);
  assert.equal(sha(extract(current)), region.sha256, region.name);
}
const lineage = receipt.lineage,
  baseline = await git("show", `${receipt.baselineCommit}:${lineage.path}`);
assert.equal(baseline.length, lineage.baselineBytes);
assert.equal(sha(baseline), lineage.baselineSha256);
assert.equal(blobHash(baseline), lineage.baselineBlob);
assert.equal(lineage.publisherBytesLocallyVerified, false);
assert.deepEqual(
  (await git("log", "--format=%H", receipt.baselineCommit, "--", lineage.path))
    .toString()
    .trim()
    .split("\n"),
  lineage.localHistory,
);
const upstream = JSON.parse((await read("licensing/upstream-baseline.json")).toString());
assert.equal(upstream.commit, receipt.upstreamCommit);
const publisher = upstream.files.find((f) => f.path === lineage.upstreamPath);
assert.equal(publisher.blob, lineage.upstreamBlob);
assert.equal(publisher.normalizedSha256, lineage.upstreamSha256);
assert.equal(publisher.bytes, lineage.upstreamBytes);
const ledger = JSON.parse((await read("licensing/current-files.json")).toString()).files.find(
  (f) => f.path === lineage.path,
);
assert.equal(ledger.normalizedSha256, lineage.baselineSha256);
assert.equal(ledger.classification, lineage.ledgerClassification);
assert.equal(ledger.review, lineage.ledgerReview);
const frozen = receipt.frozen,
  golden = await read(frozen.path),
  data = JSON.parse(golden);
assert.equal(golden.length, frozen.bytes);
assert.equal(sha(golden), frozen.sha256);
assert.equal(
  blobHash(golden),
  (await git("rev-parse", `${receipt.freezeCommit}:${frozen.path}`)).toString().trim(),
);
for (const [key, count] of Object.entries({
  direct: 51,
  getters: 57,
  executor: 44,
  registry: 8,
  runtime: 6,
  edges: 168,
  delayed: 2,
}))
  assert.equal(data[key].length, count, key);
assert.equal(frozen.namedTestsPerMode, 15);
assert.equal(frozen.baselineComparisonsPerMode, 178);
assert.equal(frozen.controlsPerDriver, 4);
assert.equal(frozen.completionEdges, 168);
assert.deepEqual(data.timeout, { kind: "none" });
for (const matrix of frozen.matrices) {
  const rows = data.edges.filter((row) => row.driver === matrix.driver).map((row) => row.observed);
  assert.equal(rows.length, matrix.comparisons);
  assert.equal(rows.length, 84);
  const completed = rows.filter(
    (row) => (matrix.driver === "deadline" ? row.observed : row.observed.result).success,
  ).length;
  assert.equal(completed, matrix.completed);
  assert.equal(rows.length - completed, matrix.cancelled);
  hex(matrix.sha256, 64);
  assert.equal(sha(JSON.stringify(stable(rows))), matrix.sha256);
}
const archive = JSON.parse((await read(frozen.archivePath)).toString());
assert.equal(archive.commit, receipt.baselineCommit);
assert.equal(archive.path, lineage.path);
assert.equal(archive.source, baseline.toString());
assert.equal(archive.sourceBytes, baseline.length);
assert.equal(sha(archive.source), archive.sourceSha256);
assert.equal(sha(archive.compiled), archive.compiledSha256);
for (const [key, value] of Object.entries(frozen.archive)) assert.equal(archive[key], value, key);
if (process.argv.includes("--emitted")) {
  for (const file of receipt.emittedFiles) {
    const bytes = await read(file.path);
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(sha(bytes), file.sha256, file.path);
  }
  assert.equal(
    (await read("apps/cli/packages/core/dist/tool/handlers/escalate.d.ts")).toString(),
    data.declaration,
  );
  assert.equal(
    (await read("apps/cli/packages/core/dist/tool/handlers/escalate.js"))
      .toString()
      .includes("createEscalateOperation"),
    true,
  );
}
console.log(
  JSON.stringify({
    files: unique.size,
    protectedInputs: receipt.protectedInputs.length,
    unchangedLintInputs: receipt.checks.coreLint.unchangedFiles.length,
    changedPaths: changed.length,
    tupleSha256: receipt.filesTupleSha256,
    emittedFiles: receipt.emittedFiles.length,
    emittedChecked: process.argv.includes("--emitted"),
    logsChecked: process.argv.includes("--logs"),
    licenseDecision: null,
  }),
);
