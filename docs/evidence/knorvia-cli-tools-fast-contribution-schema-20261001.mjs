import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  assertRelativePath,
  BASELINE_COMMIT,
  BASELINE_SOURCE,
} from "../../scripts/provenance/model.mjs";

export const assessed = "20e293e4dba5f38c940ec6112dcb34dc4eead122";
export const assigned = "0d80f9ca37b1daef162ecc69bd18f6e8fc30a146";
const families = ["skill", "models", "ask", "off", "cron"];
const statuses = [
  "unresolved-retained-material",
  "candidate-new-expression-needs-root-review",
  "unresolved-mixed-test-material",
  "unresolved-frozen-material",
];
export const decisions = [
  "original",
  "independent-replacement",
  "third-party",
  "reviewed-retained",
];
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const nonempty = (value) => assert.ok(typeof value === "string" && value.trim());
export const revision = (value) => assert.match(value, /^[a-f0-9]{40}$/);
export const digest = (value) => assert.match(value, /^[a-f0-9]{64}$/);
function fields(actual, expected) {
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual[key], value, key);
}
function candidateDigest(matrix) {
  return hash(
    JSON.stringify(
      matrix.candidates.map(({ path, current }) => [
        path,
        current.commit,
        current.blob,
        current.sha256,
        current.normalizedSha256,
      ]),
    ),
  );
}

export function schema(matrix) {
  fields(matrix, {
    schemaVersion: 1,
    documentKind: "lane-contribution-candidates-not-license-decisions",
    lane: "parallel/cli-tools-fast-20261001",
    assessedCommit: assessed,
    assignedBase: assigned,
    rootDecisionOnly: true,
    sharedFilesModified: false,
    wholeFileMitClaims: 0,
    cleanRoomClaims: 0,
    unresolvedProjectMaterialObligations: 27,
  });
  fields(matrix.upstreamPin, {
    commit: BASELINE_COMMIT,
    source: BASELINE_SOURCE,
    publisherObjectAvailable: false,
  });
  nonempty(matrix.upstreamPin.availabilityScope);
  fields(matrix.parentVerifiedEvidence, {
    verificationOrigin: "parent-reported-independent-publisher-check",
    reportedEvidenceCommit: "c60100f",
    reportedArtifactPath: "licensing/evidence/cli-upstream-byte-verification-20261001.json",
    reportedPublicationBatch: "20d6ca5",
    publisherSource: BASELINE_SOURCE,
    publisherCommit: BASELINE_COMMIT,
    publisherTree: "d185a9a893c00d51fc3fe51fe7371b9eea7de143",
    reportedTotalFiles: 7,
    localArtifactRead: false,
    localCommitResolved: false,
    publisherBytesRecheckedByLane: false,
    remotePublicationVerified: false,
    sourceExposureAndCandidateStatusesUnchanged: true,
    authorshipOrLicenseConclusion: false,
  });
  assert.deepEqual(
    matrix.parentVerifiedEvidence.subsetPaths,
    [
      ...new Set(
        Object.values(matrix.families).flatMap((family) =>
          family.upstreamSourceFacts.map((source) => source.upstream.path),
        ),
      ),
    ].sort(),
  );
  assert.equal(matrix.parentVerifiedEvidence.subsetPaths.length, 6);
  nonempty(matrix.parentVerifiedEvidence.evidenceLimit);
  fields(matrix.scope, { files: 44, production: 16, testsAndFixtures: 28 });
  assert.equal(matrix.inputs.length, 20);
  assert.equal(new Set(matrix.inputs.map((input) => input.path)).size, 20);
  assert.equal(matrix.candidates.length, 44);
  assert.equal(new Set(matrix.candidates.map((row) => row.path)).size, 44);
  assert.deepEqual(Object.keys(matrix.families).sort(), [...families].sort());
  fields(matrix.reviewSchema, {
    source: "scripts/provenance/model.mjs",
    schemaVersion: 1,
    allowedDecisions: decisions,
    required: ["path", "normalizedSha256", "decision", "license", "basis", "evidence"],
    retainedNatures: ["functional-configuration", "standard-license-text"],
    retainedLicense: "NOASSERTION",
  });
  for (const family of Object.values(matrix.families)) {
    revision(family.baseline);
    assert.ok(family.paths.length && family.upstreamSourceFacts.length);
    family.paths.forEach(assertRelativePath);
    assertRelativePath(family.spec);
    nonempty(family.public);
    nonempty(family.future);
  }
  for (const row of matrix.candidates) {
    assertRelativePath(row.path);
    assert.ok(families.includes(row.family));
    assert.ok(["production", "test-expression", "frozen-contract-data"].includes(row.role));
    assert.equal(row.current.path, row.path);
    assert.equal(row.current.commit, assessed);
    revision(row.current.blob);
    revision(row.current.lastChangeCommit);
    revision(row.current.firstLaneChangeCommit);
    digest(row.current.sha256);
    digest(row.current.normalizedSha256);
    assert.deepEqual(row.sourceExposure, {
      inheritedSourceInspected: true,
      behaviorDerivedAfterExposure: true,
      separatedCleanRoomRoles: false,
      publisherObjectAvailable: false,
    });
    assert.equal(row.recordedReview, null);
    assert.ok(Array.isArray(row.retainedMaterial));
    assert.ok(row.contribution.inspectedStructureAnchors.length);
    nonempty(row.contribution.description);
    nonempty(row.contribution.authorshipLimit);
    assert.ok(
      Array.isArray(row.interfaceFacts.exports) && Array.isArray(row.interfaceFacts.imports),
    );
    nonempty(row.interfaceFacts.publicContractFacts);
    assert.equal(row.inheritedProseAndDeclarations.publicInterfaceFactsRetained, true);
    assert.equal(
      typeof row.inheritedProseAndDeclarations.containsEmbeddedInheritedMaterial,
      "boolean",
    );
    assert.equal(typeof row.inheritedProseAndDeclarations.readsInheritedExpectedValues, "boolean");
    assert.equal(row.attribution.preserveExisting, true);
    assert.equal(row.attribution.publisherIdentityAssertion, null);
    assert.ok(Array.isArray(row.attribution.fileLocalNotices));
    nonempty(row.attribution.currentBoundary);
    assert.ok(statuses.includes(row.recommendation.candidateStatus));
    assert.equal(row.recommendation.wholeFileDecision, null);
    assert.equal(row.recommendation.licenseGrant, null);
    assert.equal(row.recommendation.schemaDecisionWritten, false);
    for (const field of [
      "basis",
      "remainingMaterial",
      "narrowContributionCandidate",
      "futureBoundedSeparation",
    ])
      nonempty(row.recommendation[field]);
    assert.ok(row.evidence.length >= 3);
    row.evidence.forEach(assertRelativePath);
  }
  assert.equal(matrix.smallestSubsetBlockers.length, 4);
  for (const blocker of matrix.smallestSubsetBlockers) {
    nonempty(blocker.id);
    nonempty(blocker.scope);
    nonempty(blocker.action);
    assert.equal(blocker.licenseDecisionMade, false);
  }
  nonempty(matrix.comparisonAidLimits);
  digest(matrix.candidateSetSha256);
  assert.equal(matrix.candidateSetSha256, candidateDigest(matrix), "Candidate-set digest");
}
