import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import console from "node:console";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { git, readRepositoryFile } from "../../scripts/provenance/git.mjs";
import {
  assertRelativePath,
  BASELINE_COMMIT,
  classify,
  createIndexes,
  currentPath,
  fingerprint,
} from "../../scripts/provenance/model.mjs";

import {
  assessed,
  assigned,
  decisions,
  revision,
  digest,
  hash,
  nonempty,
  schema,
} from "./knorvia-cli-tools-fast-contribution-schema-20261001.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const matrixPath = "docs/evidence/knorvia-cli-tools-fast-contribution-matrix-20261001.json";
const blobs = new Map();
async function snapshot(commit, path) {
  revision(commit);
  assertRelativePath(path);
  const key = `${commit}:${path}`;
  if (!blobs.has(key)) {
    const entry = (await git(root, ["ls-tree", "-z", commit, "--", path])).toString();
    if (!entry) blobs.set(key, null);
    else {
      assert.equal(entry.at(-1), "\0");
      const [identity, listedPath] = entry.slice(0, -1).split("\t");
      const [mode, type, blob] = identity.split(" ");
      assert.equal(listedPath, path);
      assert.equal(type, "blob");
      assert.equal(mode, "100644", `Expected regular source file: ${path}`);
      const bytes = await git(root, ["cat-file", "blob", blob]);
      blobs.set(key, { commit, path, blob, ...fingerprint(bytes), text: bytes.toString("utf8") });
    }
  }
  return blobs.get(key);
}

async function verifySnapshot(record) {
  const actual = await snapshot(record.commit, record.path);
  assert.ok(actual, `Missing snapshot: ${record.commit}:${record.path}`);
  for (const field of ["commit", "path", "blob", "sha256", "normalizedSha256", "encoding", "bytes"])
    assert.equal(record[field], actual[field], `${record.path}: ${field}`);
  return actual;
}

async function verifyAnchor(anchor) {
  const actual = await snapshot(anchor.commit, anchor.path);
  assert.ok(actual, `Missing anchored file: ${anchor.path}`);
  const { start, end } = anchor;
  assert.ok(Number.isSafeInteger(start) && Number.isSafeInteger(end));
  assert.ok(start >= 0 && end > start && end <= actual.text.length);
  digest(anchor.sha256);
  const slice = actual.text.slice(start, end);
  assert.equal(hash(slice), anchor.sha256, `Anchor digest: ${anchor.path}:${anchor.startLine}`);
  const line = (offset) => actual.text.slice(0, offset).split(/\r\n|\r|\n/).length;
  assert.equal(anchor.startLine, line(start));
  assert.equal(anchor.endLine, line(end));
  return slice;
}

async function validate(matrix, workingTree) {
  schema(matrix);
  await git(root, ["merge-base", "--is-ancestor", assigned, assessed]);
  await git(root, ["merge-base", "--is-ancestor", assessed, "HEAD"]);
  for (const input of matrix.inputs) {
    assert.equal(input.commit, assessed);
    await verifySnapshot(input);
    if (["scripts/provenance/model.mjs", "scripts/provenance/git.mjs"].includes(input.path))
      assert.equal(
        (await readRepositoryFile(root, input.path)).normalizedSha256,
        input.normalizedSha256,
        "Executed provenance helpers must match the assessed input",
      );
  }
  const json = async (path) => JSON.parse((await snapshot(assessed, path)).text);
  const baseline = await json("licensing/upstream-baseline.json");
  const reviews = await json("licensing/reviews.json");
  const report = await json("licensing/current-files.json");
  const thirdParty = await json("third-party/inventory.json");
  const indexes = createIndexes(baseline, reviews, thirdParty);
  const paths = (
    await git(root, [
      "diff",
      "--name-only",
      `${assigned}..${assessed}`,
      "--",
      "apps/cli/packages/core/src/tool/handlers",
      "apps/cli/packages/core/test",
    ])
  )
    .toString()
    .trim()
    .split("\n")
    .sort();
  assert.deepEqual(matrix.candidates.map((row) => row.path).sort(), paths);
  assert.equal(matrix.candidates.filter((row) => row.role === "production").length, 16);
  assert.equal(matrix.candidates.filter((row) => row.role === "frozen-contract-data").length, 5);
  let anchors = 0;
  const counts = {};
  for (const row of matrix.candidates) {
    const family = matrix.families[row.family];
    const actual = await verifySnapshot(row.current);
    const history = (
      await git(root, ["log", "--format=%H", `${assigned}..${assessed}`, "--", row.path])
    )
      .toString()
      .trim()
      .split("\n");
    assert.equal(row.current.lastChangeCommit, history[0]);
    assert.equal(row.current.firstLaneChangeCommit, history.at(-1));
    assert.equal(row.ownPathAtBehaviorBaseline.commit, family.baseline);
    assert.equal(row.ownPathAtBehaviorBaseline.path, row.path);
    if (row.ownPathAtBehaviorBaseline.present === false)
      assert.equal(await snapshot(family.baseline, row.path), null);
    else await verifySnapshot(row.ownPathAtBehaviorBaseline);
    assert.deepEqual(row.exposedSources, family.upstreamSourceFacts);
    assert.deepEqual(
      row.exposedSources.map((source) => source.path),
      family.paths,
    );
    for (const source of row.exposedSources) {
      assert.equal(source.commit, family.baseline);
      await verifySnapshot(source);
      const upstream = indexes.byPath.get(currentPath(source.path));
      assert.ok(upstream);
      assert.deepEqual(source.upstream, {
        commit: baseline.commit,
        path: upstream.path,
        blob: upstream.blob,
        sha256: upstream.sha256,
        normalizedSha256: upstream.normalizedSha256,
        kind: upstream.kind,
        publisherBytesRechecked: false,
      });
    }
    const classified = classify(
      { path: row.path, kind: "file", ...fingerprint(Buffer.from(actual.text)) },
      indexes,
    );
    assert.deepEqual(row.recomputedSourceFacts, {
      classification: classified.classification,
      upstream: classified.upstream,
      thirdParty: classified.thirdParty,
      review: classified.review,
    });
    assert.equal(indexes.reviewed.has(row.path), false);
    const recorded = report.files.find((file) => file.path === row.path);
    assert.deepEqual(
      row.recordedReport,
      recorded
        ? {
            sha256: recorded.sha256,
            normalizedSha256: recorded.normalizedSha256,
            classification: recorded.classification,
            upstream: recorded.upstream,
            review: recorded.review,
            staleForCurrentDigest: recorded.normalizedSha256 !== actual.normalizedSha256,
          }
        : null,
    );
    if (workingTree) {
      const current = await readRepositoryFile(root, row.path);
      assert.equal(current.kind, "file");
      for (const field of ["sha256", "normalizedSha256", "encoding", "bytes"])
        assert.equal(current[field], actual[field], `Working tree ${row.path}: ${field}`);
    }
    const notices = actual.text
      .split("\n")
      .map((value, index) => ({ line: index + 1, value }))
      .filter((notice) => /SPDX-License-Identifier|Copyright\s*\(c\)/i.test(notice.value));
    assert.deepEqual(row.attribution.fileLocalNotices, notices);
    for (const material of row.retainedMaterial) {
      nonempty(material.category);
      nonempty(material.comparison);
      nonempty(material.summary);
      nonempty(material.materiality);
      assert.equal(material.current.path, row.path);
      assert.equal(material.current.commit, assessed);
      const current = await verifyAnchor(material.current);
      if (material.baseline) {
        assert.ok(family.paths.includes(material.baseline.path));
        assert.equal(material.baseline.commit, family.baseline);
        const previous = await verifyAnchor(material.baseline);
        if (material.comparison === "byte-identical") assert.equal(current, previous);
      }
      for (const related of material.relatedBaselineStructures ?? []) {
        nonempty(related.symbol);
        nonempty(related.qualification);
        assert.ok(family.paths.includes(related.anchor.path));
        assert.equal(related.anchor.commit, family.baseline);
        await verifyAnchor(related.anchor);
      }
      if (material.capture) {
        const capture = await verifySnapshot(material.capture);
        assert.equal(material.capture.commit, row.current.firstLaneChangeCommit);
        const data = JSON.parse(actual.text);
        const original = JSON.parse(capture.text);
        assert.deepEqual(data, original);
        assert.deepEqual(material.jsonRoots, Object.keys(data));
        assert.equal(material.capture.captureBaseline, data.baseline);
        assert.ok(family.baseline.startsWith(data.baseline));
        assert.deepEqual(
          material.declaredGeneratedFrom,
          family.paths.map((path) => ({ commit: family.baseline, path })),
        );
      }
      anchors++;
    }
    for (const structure of row.contribution.inspectedStructureAnchors) {
      nonempty(structure.symbol);
      nonempty(structure.qualification);
      assert.equal(structure.anchor.path, row.path);
      assert.equal(structure.anchor.commit, assessed);
      await verifyAnchor(structure.anchor);
      if (row.role === "frozen-contract-data")
        assert.equal(structure.captureValuesUnchangedSinceFirstCommit, true);
    }
    counts[row.recommendation.candidateStatus] =
      (counts[row.recommendation.candidateStatus] ?? 0) + 1;
  }
  const publisherAvailable =
    (await git(root, ["cat-file", "--batch-check"], `${BASELINE_COMMIT}\n`)).toString().trim() !==
    `${BASELINE_COMMIT} missing`;
  return {
    files: paths.length,
    inputs: matrix.inputs.length,
    retainedRecords: anchors,
    statuses: counts,
    workingTreeVerified: workingTree,
    localPublisherObjectAvailableNow: publisherAvailable,
    publisherBytesRecheckedByLane: false,
    parentEvidenceReference: `${matrix.parentVerifiedEvidence.reportedEvidenceCommit}:${matrix.parentVerifiedEvidence.reportedArtifactPath}`,
    parentEvidenceVerifiedLocally: false,
    candidateSetSha256: matrix.candidateSetSha256,
  };
}

async function selfTest(matrix) {
  const cloneJson = (value) => JSON.parse(JSON.stringify(value));
  for (const mutate of [
    (copy) => {
      copy.schemaVersion = 2;
    },
    (copy) => {
      copy.candidates.push(copy.candidates[0]);
    },
    (copy) => {
      copy.candidates[0].recommendation.licenseGrant = "MIT";
    },
    (copy) => {
      copy.candidates[0].current.sha256 = "0".repeat(64);
    },
    (copy) => {
      copy.candidates[0].sourceExposure.separatedCleanRoomRoles = true;
    },
    (copy) => {
      copy.parentVerifiedEvidence.publisherBytesRecheckedByLane = true;
    },
    (copy) => {
      copy.parentVerifiedEvidence.authorshipOrLicenseConclusion = true;
    },
  ]) {
    const copy = cloneJson(matrix);
    mutate(copy);
    assert.throws(() => schema(copy));
  }
  const badAnchor = cloneJson(matrix.candidates[0].retainedMaterial[0].current);
  badAnchor.sha256 = "0".repeat(64);
  await assert.rejects(() => verifyAnchor(badAnchor));
  const baseline = JSON.parse((await snapshot(assessed, "licensing/upstream-baseline.json")).text);
  const entry = {
    path: "docs/evidence/synthetic-review-probe.ts",
    normalizedSha256: "1".repeat(64),
    decision: "original",
    license: "MIT",
    basis: "Synthetic schema probe, never persisted",
    evidence: [matrixPath],
  };
  for (const decision of decisions) {
    const candidate = { ...entry, decision };
    if (decision === "reviewed-retained")
      Object.assign(candidate, { nature: "functional-configuration", license: "NOASSERTION" });
    createIndexes(baseline, { schemaVersion: 1, files: [candidate] }, {});
  }
  for (const candidate of [
    { ...entry, license: "" },
    { ...entry, evidence: [] },
    { ...entry, nature: "functional-configuration" },
    { ...entry, decision: "reviewed-retained", nature: "source-code", license: "NOASSERTION" },
    { ...entry, decision: "reviewed-retained", nature: "functional-configuration" },
  ])
    assert.throws(() => createIndexes(baseline, { schemaVersion: 1, files: [candidate] }, {}));
  return {
    candidateTamperRejections: 8,
    acceptedReviewSchemaProbes: 4,
    invalidReviewSchemaRejections: 5,
  };
}

const flags = process.argv.slice(2);
assert.ok(
  flags.every((flag) => ["--self-test", "--snapshot-only"].includes(flag)),
  "Unknown flag",
);
const matrixBytes = await readFile(resolve(root, matrixPath));
const matrix = JSON.parse(matrixBytes.toString("utf8"));
const result = await validate(matrix, !flags.includes("--snapshot-only"));
result.matrixSha256 = fingerprint(matrixBytes).sha256;
if (flags.includes("--self-test")) result.selfTests = await selfTest(matrix);
console.log(JSON.stringify({ ok: true, ...result, licenseDecisionMade: false }, null, 2));
