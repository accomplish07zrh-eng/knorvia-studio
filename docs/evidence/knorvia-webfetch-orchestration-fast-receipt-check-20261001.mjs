// Read-only bounded WebFetch receipt validation, based on earlier source-exposed lane validators.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = promisify(execFile);
const git = async (...args) =>
  (await run("git", args, { cwd: root, encoding: "buffer", maxBuffer: 1024 * 1024 })).stdout;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const blobHash = (bytes) =>
  createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
const normalized = (bytes) => Buffer.from(bytes.toString("utf8").replace(/\r\n?/gu, "\n"));
const hex = (value, length) => assert.match(value, new RegExp(`^[a-f0-9]{${length}}$`));
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url));
const receipt = JSON.parse(
  await readFile(
    new URL("./knorvia-webfetch-orchestration-fast-checks-20261001.json", import.meta.url),
    "utf8",
  ),
);
assert.equal(receipt.formatVersion, 1);
assert.equal(receipt.kind, "WebFetch orchestration source-exposed implementation receipt");
assert.equal(receipt.lane, "parallel/cli-tools-fast-20261001");
for (const commit of [
  receipt.baselineCommit,
  receipt.freezeCommit,
  receipt.productionCommit,
  receipt.validationCommit,
])
  hex(commit, 40);
await git("merge-base", "--is-ancestor", receipt.baselineCommit, receipt.freezeCommit);
await git("merge-base", "--is-ancestor", receipt.freezeCommit, receipt.productionCommit);
await git("merge-base", "--is-ancestor", receipt.productionCommit, receipt.validationCommit);
await git("merge-base", "--is-ancestor", receipt.validationCommit, "HEAD");
assert.equal(receipt.licenseDecision, null);
assert.equal(receipt.sourceExposure.cleanRoom, false);
assert.equal(receipt.sourceExposure.sharedProvenanceEdited, false);
assert.equal(receipt.unresolvedMaterialObligations, 27);
assert.equal(receipt.parentReportedUpdates.keyv.remainingObligations, 26);
assert.equal(receipt.parentReportedUpdates.locallyVerified, false);
for (const [modes, count] of [
  [["source", "emitted"], 29],
  [["frozenSource", "frozenEmitted", "initialRewriteSource", "initialRewriteEmitted"], 24],
  [["settlementSource", "settlementEmitted"], 5],
])
  for (const mode of modes) {
    assert.equal(receipt.checks[mode].tests, count);
    assert.equal(receipt.checks[mode].pass, count);
    assert.equal(receipt.checks[mode].fail, 0);
    assert.equal(receipt.checks[mode].cancelled, 0);
    assert.equal(receipt.checks[mode].skipped, 0);
  }
assert.equal(receipt.checks.fullRegression.fail, 0);
assert.equal(receipt.checks.fullRegression.cancelled, 0);
assert.equal(receipt.checks.fullRegression.skipped, 8);
assert.equal(receipt.checks.fullRegression.tests, 6255);
assert.equal(receipt.checks.fullRegression.pass, 6247);
assert.equal(receipt.checks.fullRegression.testFiles, 525);
assert.equal(receipt.checks.originalFullRegression.tests, 6250);
assert.equal(receipt.checks.originalFullRegression.pass, 6242);
assert.equal(receipt.checks.originalFullRegression.skipped, 8);
assert.equal(receipt.checks.originalFullRegression.fail, 0);
assert.equal(receipt.checks.originalFullRegression.cancelled, 0);
assert.equal(receipt.checks.originalFullRegression.testFiles, 524);
assert.equal(receipt.checks.existingWebFetchSource.tests, 153);
assert.equal(receipt.checks.existingWebFetchSource.pass, 153);
assert.equal(receipt.checks.existingWebFetchSource.fail, 0);
assert.equal(receipt.checks.coreLint.pass, false);
assert.equal(receipt.checks.coreLint.errors, 24);
assert.equal(receipt.checks.coreLint.warnings, 11);
assert.equal(receipt.checks.coreLint.unchangedFiles.length, 27);
for (const name of [
  "rootTypes",
  "cliTypes",
  "cliBuild",
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
for (const check of Object.values(receipt.checks)) {
  assert.equal(typeof check.logPath, "string");
  assert.equal(Number.isSafeInteger(check.bytes) && check.bytes >= 0, true);
  hex(check.sha256, 64);
  if (process.argv.includes("--logs")) {
    const bytes = await readFile(check.logPath);
    assert.equal(bytes.length, check.bytes, check.logPath);
    assert.equal(sha(bytes), check.sha256, check.logPath);
  }
}
assert.equal(
  receipt.checks.fullRegression.tests,
  receipt.checks.fullRegression.pass + receipt.checks.fullRegression.skipped,
);
const unique = new Set();
for (const file of receipt.files) {
  assert.equal(unique.has(file.path), false);
  unique.add(file.path);
  assert.equal(file.commit, receipt.validationCommit);
  assert.equal(file.licenseDecision, null);
  assert.equal(file.attributionMustRemain, true);
  hex(file.blob, 40);
  hex(file.sha256, 64);
  hex(file.normalizedSha256, 64);
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
assert.equal(unique.size, 13);
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
  const baselineBlob = (await git("rev-parse", `${receipt.baselineCommit}:${file.path}`))
    .toString()
    .trim();
  assert.equal(file.blob, baselineBlob, file.path);
  assert.equal(blobHash(bytes), baselineBlob, file.path);
}
const allowed = new Set(receipt.allowedPaths);
assert.equal(allowed.size, 16);
for (const path of unique) assert.equal(allowed.has(path), true);
const paths = async (...args) => (await git(...args)).toString().trim().split("\n").filter(Boolean);
const changed = await paths("diff", "--name-only", receipt.baselineCommit);
const untracked = await paths("ls-files", "--others", "--exclude-standard");
for (const path of [...changed, ...untracked]) assert.equal(allowed.has(path), true, path);

for (const region of receipt.retainedRegions) {
  const old = (await git("show", `${receipt.baselineCommit}:${region.path}`)).toString();
  const current = (await read(region.path)).toString();
  const extract = (source, end) => {
    assert.equal(source.includes(region.start), true, region.name);
    if (end) assert.equal(source.includes(end), true, region.name);
    return source
      .slice(
        source.indexOf(region.start),
        end ? source.indexOf(end, source.indexOf(region.start)) : undefined,
      )
      .trim();
  };
  const prior = extract(old, region.baselineEnd),
    now = extract(current, region.currentEnd);
  assert.equal(now, prior, region.name);
  assert.equal(sha(now), region.sha256, region.name);
}
const upstream = JSON.parse((await read("licensing/upstream-baseline.json")).toString());
assert.equal(upstream.commit, receipt.upstreamCommit);
const lineage = receipt.lineage;
const baseline = await git("show", `${receipt.baselineCommit}:${lineage.path}`);
assert.equal(baseline.length, lineage.baselineBytes);
assert.equal(sha(baseline), lineage.baselineSha256);
assert.equal(blobHash(baseline), lineage.baselineBlob);
assert.deepEqual(
  (await git("log", "--format=%H", receipt.baselineCommit, "--", lineage.path))
    .toString()
    .trim()
    .split("\n"),
  lineage.localHistory,
);
assert.equal(lineage.publisherBytesLocallyVerified, false);
const publisher = upstream.files.find((f) => f.path === lineage.upstreamPath);
assert.equal(publisher.blob, lineage.upstreamBlob);
assert.equal(publisher.normalizedSha256, lineage.upstreamSha256);
assert.equal(publisher.bytes, lineage.upstreamBytes);
for (const file of receipt.existingTechnicalCoverage) {
  assert.equal(file.licenseDecision, null);
  for (const evidence of file.evidencePaths)
    assert.equal(
      receipt.protectedInputs.some((f) => f.path === evidence),
      true,
    );
  const bytes = await read(file.path);
  assert.equal(sha(bytes), file.sha256, file.path);
  assert.equal(
    blobHash(bytes),
    (await git("rev-parse", `${receipt.baselineCommit}:${file.path}`)).toString().trim(),
    file.path,
  );
}
assert.equal(receipt.existingTechnicalCoverage.length, 8);
const reviews = JSON.parse((await read("licensing/reviews.json")).toString());
for (const file of receipt.existingTechnicalCoverage) {
  const review = reviews.files.find((candidate) => candidate.path === file.path);
  assert.equal(review.decision, file.registeredDecision, file.path);
  assert.equal(review.normalizedSha256, file.normalizedSha256, file.path);
  assert.deepEqual(review.evidence, file.evidencePaths, file.path);
}
for (const file of receipt.protectedLowerFiles)
  assert.deepEqual(
    receipt.protectedInputs.find((input) => input.path === file.path),
    file,
  );
const golden = await read(receipt.frozen.path);
assert.equal(golden.length, receipt.frozen.bytes);
assert.equal(sha(golden), receipt.frozen.sha256);
assert.equal(
  blobHash(golden),
  (await git("rev-parse", `${receipt.freezeCommit}:${receipt.frozen.path}`)).toString().trim(),
);
const data = JSON.parse(golden);
for (const [key, count] of Object.entries({
  direct: 61,
  getters: 63,
  executor: 19,
  registry: 4,
  permissions: 60,
})) {
  assert.equal(data[key].length, count);
  assert.equal(receipt.frozen[key], count);
}
assert.deepEqual(data.cacheMatrix, receipt.frozen.cacheMatrix);
assert.equal(data.cacheMatrix.comparisons, 36);
assert.deepEqual(data.microtasks, receipt.frozen.microtasks);
const appended = receipt.appendedSettlement;
assert.equal(appended.commit, receipt.validationCommit);
assert.equal(appended.baselineCommit, receipt.baselineCommit);
assert.equal(appended.baselineBlob, lineage.baselineBlob);
assert.equal(appended.sourceSha256, lineage.baselineSha256);
assert.equal(appended.casesPerDriver, 77);
assert.equal(appended.controlsPerDriver, 8);
assert.equal(appended.comparisonsPerMode, 170);
assert.equal(appended.namedTestsPerMode, 5);
assert.equal(appended.initialFullCheckpointSeparate, true);
assert.equal(appended.supportedDifferenceFound, false);
assert.equal(appended.productionCorrectionNeeded, false);
assert.deepEqual(appended.paths, ["fresh", "cached", "redirect", "http-error"]);
assert.deepEqual(appended.abortDepths, [0, 1, 2, 3, 4, 5, 6]);
assert.deepEqual(appended.matrices, [
  {
    driver: "deadline",
    comparisons: 77,
    completed: 36,
    cancelled: 41,
    sha256: "5920dcfab5ab69a61365500175bb7dd7d0b8d59f704cc693018ed19c3889f35c",
  },
  {
    driver: "executor",
    comparisons: 77,
    completed: 34,
    cancelled: 43,
    sha256: "ec379aba494b2569a6d66f31984c204c5e7ad517f77c3ca564110d504b628e18",
  },
]);
const archive = JSON.parse((await read(appended.archivePath)).toString());
assert.equal(archive.commit, receipt.baselineCommit);
assert.equal(archive.path, lineage.path);
assert.equal(archive.source, baseline.toString());
assert.equal(archive.sourceBytes, baseline.length);
assert.equal(sha(archive.source), appended.sourceSha256);
assert.equal(archive.sourceSha256, appended.sourceSha256);
assert.equal(sha(archive.compiled), appended.compiledSha256);
assert.equal(archive.compiledSha256, appended.compiledSha256);
assert.equal(archive.compilerVersion, appended.compilerVersion);
assert.equal(archive.recipe, appended.recipe);
if (process.argv.includes("--logs"))
  for (const mode of ["settlementSource", "settlementEmitted"]) {
    const text = await readFile(receipt.checks[mode].logPath, "utf8");
    const matrices = text
      .split("\n")
      .filter((line) => line.startsWith('{"driver":'))
      .map((line) => JSON.parse(line));
    assert.deepEqual(matrices, appended.matrices, mode);
  }
if (process.argv.includes("--emitted")) {
  for (const file of receipt.emittedFiles) {
    const bytes = await read(file.path);
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(sha(bytes), file.sha256, file.path);
  }
  assert.equal(
    (await read("apps/cli/packages/core/dist/tool/handlers/webfetch.d.ts")).toString(),
    data.publicDeclaration,
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
