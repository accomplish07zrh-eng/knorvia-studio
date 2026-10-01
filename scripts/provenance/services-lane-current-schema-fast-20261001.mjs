// Candidate shape and fixed scope checks; no accepted rights decision or filesystem mutation.
import assert from "node:assert/strict";
import { assertRelativePath, BASELINE_COMMIT, BASELINE_SOURCE } from "./model.mjs";
import { INPUT_PATHS, PUBLISHER_TREE } from "./services-lane-scope-fast-20261001.mjs";
import { seal } from "./services-lane-fast-20261001.mjs";
import {
  SNAPSHOT_COMMIT,
  CORRECTION_COMMIT,
  FREEZE_COMMIT,
  HISTORICAL_CHECKPOINT,
  HISTORICAL_PAYLOAD,
  HISTORICAL_PRODUCTION_COMMIT,
  HISTORICAL_MATRIX_PATH,
  SCOPE,
  UPDATED_PATHS,
  PROTECTED_PATHS,
  HISTORY_PATHS,
  LOCAL_PINS,
  PROTECTED_METHODS,
  NEW_EXPRESSIONS,
  INSTALLED_PATHS,
  ALL_REFERENCE_IDENTITIES,
  APPENDIX_COMMIT,
  APPENDIX_SCOPE,
  RECEIPT_PATH,
  LEGACY_TEST_PATH,
  RED_RECEIPT_EXPRESSION,
} from "./services-lane-current-scope-fast-20261001.mjs";
export { seal };
const hex = (value, length) => assert.match(value, new RegExp(`^[a-f0-9]{${length}}$`));
export function validFingerprint(value) {
  hex(value.sha256, 64);
  hex(value.normalizedSha256, 64);
  assert.equal(value.encoding, "utf8-lf");
  assert.ok(Number.isSafeInteger(value.bytes) && value.bytes >= 0);
}
export function validFacts(value) {
  hex(value.commit, 40);
  if (value.exists === false) {
    assert.deepEqual(Object.keys(value).sort(), ["commit", "exists"]);
    return;
  }
  hex(value.blob, 40);
  assert.equal(value.mode, "100644");
  validFingerprint(value);
}
function validFiles(files, scope, appendix = false) {
  assert.deepEqual(
    files.map((entry) => ({ path: entry.path, group: entry.group, role: entry.role })),
    scope,
  );
  for (const file of files) {
    assertRelativePath(file.path);
    hex(file.lastContentCommit, 40);
    validFingerprint(file.current);
    hex(file.current.blob, 40);
    assert.equal(file.current.mode, "100644");
    const pins = [...LOCAL_PINS];
    if (appendix || UPDATED_PATHS.includes(file.path))
      pins.push(HISTORICAL_PRODUCTION_COMMIT, FREEZE_COMMIT);
    if (appendix) pins.push(SNAPSHOT_COMMIT);
    assert.deepEqual(
      file.localBaselines.map((entry) => entry.commit),
      pins,
    );
    file.localBaselines.forEach(validFacts);
    assert.deepEqual(file.proposal, { decision: null, license: "NOASSERTION" });
    assert.equal(file.sourceExposure, true);
    assert.ok(
      ["upstream-unchanged", "upstream-modified", "unreviewed"].includes(file.classification),
    );
    for (const key of ["newStructures", "retainedPolicy", "futureSeparation"])
      assert.ok(
        Array.isArray(file[key]) &&
          file[key].every((value) => typeof value === "string" && value.trim()),
      );
    assert.ok(Array.isArray(file.matches) && Array.isArray(file.literals));
  }
}
export function assertCurrent(matrix) {
  assert.equal(
    matrix.payloadSha256,
    seal(matrix).payloadSha256,
    "current candidate payload digest changed",
  );
  assert.equal(matrix.schemaVersion, 1);
  assert.equal(matrix.kind, "services-lane-current-contribution-candidate");
  assert.equal(matrix.snapshotCommit, SNAPSHOT_COMMIT);
  assert.equal(matrix.productionCommit, CORRECTION_COMMIT);
  assert.equal(matrix.publisher.commit, BASELINE_COMMIT);
  assert.equal(matrix.publisher.source, BASELINE_SOURCE);
  assert.equal(matrix.publisher.tree, PUBLISHER_TREE);
  assert.deepEqual(
    matrix.inputs.map((entry) => entry.path),
    INPUT_PATHS,
  );
  assert.deepEqual(matrix.policy, {
    sourceExposure: true,
    cleanRoom: false,
    wholeFileLicenseGrant: false,
    acceptedReview: false,
  });
  assert.equal(matrix.history.checkpoint, HISTORICAL_CHECKPOINT);
  assert.equal(matrix.history.productionCommit, HISTORICAL_PRODUCTION_COMMIT);
  assert.equal(matrix.history.matrixPath, HISTORICAL_MATRIX_PATH);
  assert.equal(matrix.history.payloadSha256, HISTORICAL_PAYLOAD);
  assert.deepEqual(
    matrix.history.files.map((entry) => entry.path),
    HISTORY_PATHS,
  );
  for (const entry of matrix.history.files) {
    validFacts(entry);
    assert.equal(entry.commit, HISTORICAL_CHECKPOINT);
  }
  validFiles(matrix.files, SCOPE);
  assert.equal(matrix.appendix.commit, APPENDIX_COMMIT);
  assert.equal(matrix.appendix.productionCommit, CORRECTION_COMMIT);
  assert.equal(matrix.appendix.notPresentInSnapshot, SNAPSHOT_COMMIT);
  assert.equal(matrix.appendix.nativeAcceptance, false);
  assert.deepEqual(matrix.appendix.focusedResults, {
    sourceCases: 2,
    emittedCases: 2,
    failures: 0,
    skips: 0,
  });
  validFiles(matrix.appendix.files, APPENDIX_SCOPE, true);
  assert.deepEqual(matrix.references.map((entry) => entry.id).sort(), ALL_REFERENCE_IDENTITIES);
  for (const entry of matrix.references) {
    assertRelativePath(entry.path);
    validFacts(entry);
  }
  assert.deepEqual(matrix.protected.paths, PROTECTED_PATHS);
  assert.deepEqual(
    matrix.protected.methods.map((entry) => entry.name),
    PROTECTED_METHODS,
  );
  for (const entry of matrix.protected.methods)
    assert.equal(entry.source.sourceId, "historical-owner");
  assert.deepEqual(
    matrix.ownershipExpressions.map((entry) => entry.name),
    Object.keys(NEW_EXPRESSIONS),
  );
  for (const entry of matrix.ownershipExpressions)
    assert.equal(entry.current.expression, NEW_EXPRESSIONS[entry.name]);
  assert.equal(matrix.proof.freezeCommit, FREEZE_COMMIT);
  assert.equal(matrix.proof.receiptPath, RECEIPT_PATH);
  assert.deepEqual(matrix.proof.red.counts, {
    cases: 20,
    failed: 16,
    passed: 4,
    skipped: 0,
    cancelled: 0,
  });
  assert.equal(matrix.proof.red.range.expression, RED_RECEIPT_EXPRESSION);
  assert.equal(matrix.proof.legacyCorrection.path, LEGACY_TEST_PATH);
  assert.equal(matrix.proof.legacyCorrection.before.sourceId, "historical-legacy-test");
  assert.equal(
    matrix.proof.legacyCorrection.before.range.expression,
    "assert.equal(state.ptys[0]!.nativeDisposals, 2);",
  );
  assert.equal(
    matrix.proof.legacyCorrection.after.expression,
    "assert.equal(state.ptys[0]!.nativeDisposals, 1);",
  );
  assert.equal(matrix.installedArtifacts.package, "node-pty");
  assert.equal(matrix.installedArtifacts.version, "1.1.0");
  assert.equal(matrix.installedArtifacts.publisherCommit, null);
  assert.equal(matrix.installedArtifacts.publisherBytesVerified, false);
  assert.equal(matrix.installedArtifacts.nativeAcceptance, false);
  assert.deepEqual(
    matrix.installedArtifacts.files.map((entry) => entry.path),
    INSTALLED_PATHS,
  );
  matrix.installedArtifacts.files.forEach(validFingerprint);
  assert.equal(matrix.materials.obligations.length, 27);
  assert.deepEqual(matrix.materials.issues, []);
}
export function assertFileBinding(file, snapshot, lastContentCommit) {
  const { text: _text, commit: _commit, exists: _exists, ...content } = snapshot;
  assert.deepEqual(content, file.current, `snapshot binding: ${file.path}`);
  if (lastContentCommit !== undefined)
    assert.equal(lastContentCommit, file.lastContentCommit, `content commit binding: ${file.path}`);
}
