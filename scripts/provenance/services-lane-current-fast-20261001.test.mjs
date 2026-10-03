// Scope, digest and actual Git-byte regressions. No native execution or shared-record writes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { fingerprint } from "./model.mjs";
import {
  assertMatrix,
  assertSpan,
  assertFingerprint,
  gitFile,
  verifyCandidate,
} from "./services-lane-fast-20261001.mjs";
import {
  assertCurrent,
  assertFileBinding,
  seal,
} from "./services-lane-current-schema-fast-20261001.mjs";
import { verifyCurrent } from "./services-lane-current-fast-20261001.mjs";
import {
  MATRIX_PATH,
  HISTORICAL_MATRIX_PATH,
  HISTORICAL_PRODUCTION_COMMIT,
  SNAPSHOT_COMMIT,
  CORRECTION_COMMIT,
  OWNER_PATH,
  APPENDIX_COMMIT,
  APPENDIX_SCOPE,
  PROTECTED_METHODS,
} from "./services-lane-current-scope-fast-20261001.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const load = async (path) =>
  JSON.parse(await readFile(new URL(`../../${path}`, import.meta.url), "utf8"));
const matrix = await load(MATRIX_PATH),
  historical = await load(HISTORICAL_MATRIX_PATH);
const ownerSnapshot = await gitFile(root, SNAPSHOT_COMMIT, OWNER_PATH);
const historicalOwner = await gitFile(root, HISTORICAL_PRODUCTION_COMMIT, OWNER_PATH);
const appendixSnapshot = await gitFile(root, APPENDIX_COMMIT, APPENDIX_SCOPE[0].path);
const mutate = (change) => {
  const value = structuredClone(matrix);
  change(value);
  return seal(value);
};
const ownerFile = (value) => value.files.find((file) => file.path === OWNER_PATH);

test("historical 50 and current 55 plus later two-file appendix have separate pins and digests", () => {
  assertMatrix(historical);
  assertCurrent(matrix);
  assert.equal(historical.files.length, 50);
  assert.equal(matrix.files.length, 55);
  assert.equal(matrix.appendix.files.length, 2);
  assert.notEqual(matrix.payloadSha256, historical.payloadSha256);
  assert.notEqual(ownerSnapshot.sha256, historicalOwner.sha256);
  assert.equal(ownerFile(matrix).lastContentCommit, CORRECTION_COMMIT);
  assert.equal(matrix.appendix.notPresentInSnapshot, SNAPSHOT_COMMIT);
});
test("historical and current validators cannot accept each other's scope", () => {
  assert.throws(() => assertMatrix(matrix));
  assert.throws(() => assertCurrent(historical));
});
test("unsealed current note edits reject while old historical payload remains unchanged", () => {
  const value = structuredClone(matrix);
  value.files[0].newStructures.push("unreviewed new claim");
  assert.throws(() => assertCurrent(value), /payload digest/);
  assertMatrix(historical);
});
for (const field of [
  "snapshotCommit",
  "productionCommit",
  "history.checkpoint",
  "history.productionCommit",
  "appendix.commit",
])
  test(`re-sealed wrong scope pin rejects: ${field}`, () => {
    const value = mutate((candidate) => {
      const [parent, key] = field.split(".");
      if (key) candidate[parent][key] = "0".repeat(40);
      else candidate[parent] = "0".repeat(40);
    });
    assert.throws(() => assertCurrent(value));
  });
for (const change of ["omit", "duplicate", "other-lane", "appendix-as-fd71001"])
  test(`re-sealed current path conflict rejects: ${change}`, () => {
    assert.throws(() =>
      assertCurrent(
        mutate((candidate) => {
          if (change === "omit") candidate.files.pop();
          if (change === "duplicate") candidate.files[1] = candidate.files[0];
          if (change === "other-lane")
            candidate.files[0].path = "packages/services/src/creation/owned.ts";
          if (change === "appendix-as-fd71001") candidate.files.push(candidate.appendix.files[0]);
        }),
      ),
    );
  });
test("omitted or misbound appendix cannot claim to exist in fd71001", () => {
  for (const change of [
    (candidate) => candidate.appendix.files.pop(),
    (candidate) => (candidate.appendix.commit = SNAPSHOT_COMMIT),
    (candidate) => (candidate.appendix.notPresentInSnapshot = APPENDIX_COMMIT),
  ])
    assert.throws(() => assertCurrent(mutate(change)));
  assert.equal(matrix.appendix.files[0].localBaselines.at(-1).exists, false);
});
test("decisions, grants, source-code retained nature and native/clean-room claims reject", () => {
  for (const change of [
    (candidate) => (candidate.files[0].proposal.decision = "original"),
    (candidate) => (candidate.files[0].proposal.license = "MIT"),
    (candidate) => (candidate.files[0].proposal.nature = "source-code"),
    (candidate) => (candidate.policy.cleanRoom = true),
    (candidate) => (candidate.policy.sourceExposure = false),
    (candidate) => (candidate.installedArtifacts.publisherBytesVerified = true),
    (candidate) => (candidate.appendix.nativeAcceptance = true),
  ])
    assert.throws(() => assertCurrent(mutate(change)));
});
test("protected paths/methods and narrow ownership observations cannot be omitted or substituted", () => {
  for (const change of [
    (candidate) => candidate.protected.paths.pop(),
    (candidate) => candidate.protected.methods.pop(),
    (candidate) => candidate.ownershipExpressions.pop(),
    (candidate) => (candidate.ownershipExpressions[0].current.expression = "renamed syntax"),
  ])
    assert.throws(() => assertCurrent(mutate(change)));
  assert.equal(matrix.protected.methods.length, PROTECTED_METHODS.length);
});
test("20-case red proof and intentional legacy assertion correction are immutable facts", () => {
  for (const change of [
    (candidate) => (candidate.proof.red.counts.cases = 19),
    (candidate) =>
      (candidate.proof.legacyCorrection.after.expression =
        candidate.proof.legacyCorrection.before.range.expression),
  ])
    assert.throws(() => assertCurrent(mutate(change)));
});
test("publisher pin, source, tree and fixed installed-artifact paths reject substitution", () => {
  for (const change of [
    (candidate) => (candidate.publisher.commit = "0".repeat(40)),
    (candidate) => (candidate.publisher.source = "https://example.invalid"),
    (candidate) => (candidate.publisher.tree = "0".repeat(40)),
    (candidate) => (candidate.installedArtifacts.files[0].path = "user-profile"),
  ])
    assert.throws(() => assertCurrent(mutate(change)));
});
test("material obligation count and issues cannot conceal unresolved items", () => {
  for (const change of [
    (candidate) => candidate.materials.obligations.pop(),
    (candidate) => candidate.materials.issues.push("unreviewed"),
  ])
    assert.throws(() => assertCurrent(mutate(change)));
});
test("old passing owner hash cannot stand in for current owner bytes", () => {
  const value = mutate((candidate) => {
    const { text: _text, commit: _commit, exists: _exists, ...facts } = historicalOwner;
    ownerFile(candidate).current = facts;
  });
  assertCurrent(value);
  assert.throws(
    () => assertFileBinding(ownerFile(value), ownerSnapshot, CORRECTION_COMMIT),
    /snapshot binding/,
  );
});
for (const field of ["sha256", "normalizedSha256", "blob", "mode"])
  test(`actual fd71001 owner rejects tampered file binding: ${field}`, () => {
    const file = structuredClone(ownerFile(matrix));
    file.current[field] = field === "mode" ? "100755" : "0".repeat(field === "blob" ? 40 : 64);
    assert.throws(
      () => assertFileBinding(file, ownerSnapshot, CORRECTION_COMMIT),
      /snapshot binding/,
    );
  });
test("latest content commit and appendix bytes cannot be misbound to old scopes", () => {
  const file = structuredClone(ownerFile(matrix));
  file.lastContentCommit = HISTORICAL_PRODUCTION_COMMIT;
  assert.throws(
    () => assertFileBinding(file, ownerSnapshot, CORRECTION_COMMIT),
    /content commit binding/,
  );
  assertFileBinding(matrix.appendix.files[0], appendixSnapshot, APPENDIX_COMMIT);
  assert.throws(
    () => assertFileBinding(matrix.appendix.files[0], ownerSnapshot),
    /snapshot binding/,
  );
});
test("protected generic method body and new eligibility span replays reject changed coordinates/digests", () => {
  const method = matrix.protected.methods.find((unit) => unit.name === "cleanEmitter");
  assert.ok(assertSpan(method.current, ownerSnapshot.text).startsWith("private cleanEmitter<T>"));
  for (const change of [{ sha256: "0".repeat(64) }, { startLine: 1 }])
    assert.throws(() => assertSpan({ ...method.current, ...change }, ownerSnapshot.text));
  const unit = matrix.ownershipExpressions.find((entry) => entry.name === "monitor-eligibility");
  assert.throws(() =>
    assertSpan({ ...unit.current, expression: "skip cleanup" }, ownerSnapshot.text),
  );
});
test("re-sealed historical anchor tampering is rejected against actual immutable Git bytes", async () => {
  await assert.rejects(
    verifyCurrent(
      root,
      mutate((candidate) => (candidate.history.files[0].sha256 = "0".repeat(64))),
    ),
  );
});
test("omitted current source references cannot pass even when re-sealed", () => {
  assert.throws(() => assertCurrent(mutate((candidate) => candidate.references.pop())));
});
test("mandatory publisher replay cannot substitute manifest-only evidence", async () => {
  await assert.rejects(
    verifyCurrent(root, matrix, { requirePublisher: true }),
    /Publisher byte verification unavailable/,
  );
});
test("actual historical checker continues to reject corrected live owner", async () => {
  await assert.rejects(verifyCandidate(root, historical), /normalized content changed/);
});
test("installed artifact raw digest tampering cannot pass byte verification", async () => {
  const artifact = matrix.installedArtifacts.files.find((entry) =>
    entry.path.endsWith("windowsPtyAgent.js"),
  );
  const actual = fingerprint(await readFile(new URL(`../../${artifact.path}`, import.meta.url)));
  assertFingerprint(actual, artifact);
  assert.throws(
    () => assertFingerprint(actual, { ...artifact, sha256: "0".repeat(64) }),
    /raw snapshot bytes changed/,
  );
});
