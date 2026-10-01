// Lane-specific evidence checks; no production/native/user-data operations.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createIndexes, fingerprint } from "./model.mjs";
import {
  MATRIX_PATH,
  PRODUCTION_COMMIT,
  SCOPE,
  assertFingerprint,
  assertMatrix,
  assertSpan,
  seal,
  verifyCandidate,
} from "./services-lane-fast-20261001.mjs";

const root = new URL("../../", import.meta.url);
const matrix = JSON.parse(await readFile(new URL(MATRIX_PATH, root), "utf8"));
const copy = () => structuredClone(matrix);
const mutate = (change) => {
  const value = copy();
  change(value);
  return seal(value);
};

test("candidate round-trip binds all scoped paths and corrected production", () => {
  assertMatrix(matrix);
  assert.equal(matrix.productionCommit, PRODUCTION_COMMIT);
  assert.equal(matrix.files.length, SCOPE.length);
  assert.equal(matrix.materials.obligations.length, 27);
  assert.ok(matrix.files.every((file) => file.proposal.decision === null));
  assertMatrix(JSON.parse(JSON.stringify(matrix)));
});
test("unsealed edits and changed nested contribution notes fail digest", () => {
  const value = copy();
  value.files[0].newStructures.push("unreviewed extra claim");
  assert.throws(() => assertMatrix(value), /payload digest/);
});
for (const path of ["../user-data", "/tmp/unowned", "packages/services/src/creation/x.ts", "a\\b"])
  test(`re-sealed out-of-scope path rejects: ${path}`, () => {
    assert.throws(() => assertMatrix(mutate((value) => (value.files[0].path = path))));
  });
test("duplicate/missing candidates cannot disguise scope completion", () => {
  assert.throws(() => assertMatrix(mutate((value) => (value.files[1] = value.files[0]))));
  assert.throws(() => assertMatrix(mutate((value) => value.files.pop())));
});
test("malformed current and reference digests reject even after re-sealing", () => {
  assert.throws(() => assertMatrix(mutate((value) => (value.files[0].current.sha256 = "invalid"))));
  assert.throws(() => assertMatrix(mutate((value) => (value.references[0].blob = "0"))));
});
test("authorship decisions, authorizing licenses and source-code nature are forbidden", () => {
  for (const change of [
    (value) => (value.files[0].proposal.decision = "original"),
    (value) => (value.files[0].proposal.license = "MIT"),
    (value) => (value.files[0].proposal.nature = "source-code"),
    (value) => (value.policy.cleanRoom = true),
    (value) => (value.policy.sourceExposure = false),
  ])
    assert.throws(() => assertMatrix(mutate(change)));
});
test("production, inherited and publisher identity cannot drift", () => {
  for (const change of [
    (value) => (value.productionCommit = "0".repeat(40)),
    (value) => (value.references[0].commit = "0".repeat(40)),
    (value) => (value.publisher.tree = "0".repeat(40)),
    (value) => (value.publisher.commit = "0".repeat(40)),
  ])
    assert.throws(() => assertMatrix(mutate(change)));
});
test("span replay rejects wrong digest, expression, boundaries and coordinates", () => {
  const text = "prefix\nowned fixture\nsuffix";
  const span = {
    start: 7,
    end: 20,
    startLine: 2,
    startColumn: 1,
    endLine: 2,
    endColumn: 14,
    sha256: fingerprint(Buffer.from("owned fixture")).sha256,
    expression: "owned fixture",
  };
  assert.equal(assertSpan(span, text), "owned fixture");
  for (const change of [
    { start: -1 },
    { end: 99 },
    { startLine: 1 },
    { endColumn: 1 },
    { sha256: "0".repeat(64) },
    { expression: "different fixture" },
  ])
    assert.throws(() => assertSpan({ ...span, ...change }, text));
});
test("raw snapshot binding and normalized worktree checks distinguish CRLF from content changes", () => {
  const lf = fingerprint(Buffer.from("owned\nfixture\n"));
  const crlf = fingerprint(Buffer.from("owned\r\nfixture\r\n"));
  assert.doesNotThrow(() => assertFingerprint(crlf, lf, true));
  assert.throws(() => assertFingerprint(crlf, lf, false));
  assert.throws(() => assertFingerprint(fingerprint(Buffer.from("changed\nfixture\n")), lf, true));
});
test("actual review schema rejects source-code retained nature rather than relabeling mixed code", () => {
  assert.throws(
    () =>
      createIndexes(
        { schemaVersion: 1, commit: matrix.publisher.commit, files: [] },
        {
          schemaVersion: 1,
          files: [
            {
              path: "mixed.ts",
              normalizedSha256: "0".repeat(64),
              decision: "reviewed-retained",
              nature: "source-code",
              license: "NOASSERTION",
              basis: "Synthetic mixed source",
              evidence: ["owned fixture"],
            },
          ],
        },
        {},
      ),
    /provenance review/,
  );
});

test("full replay rejects a re-sealed stale current snapshot without changing production", async () => {
  const value = mutate((candidate) => {
    candidate.files[0].current.normalizedSha256 = "0".repeat(64);
  });
  await assert.rejects(verifyCandidate(fileURLToPath(root), value), /normalized content changed/);
});
test("full replay rejects re-sealed publisher inventory and local reference substitutions", async () => {
  for (const origin of ["publisher", "integrated"])
    await assert.rejects(
      verifyCandidate(
        fileURLToPath(root),
        mutate((candidate) => {
          candidate.references.find((reference) => reference.origin === origin).blob = "0".repeat(
            40,
          );
        }),
      ),
    );
});
test("full replay rejects re-sealed retained span and schema classification tampering", async () => {
  for (const change of [
    (candidate) =>
      (candidate.files.find((file) => file.matches.length).matches[0].current.sha256 = "0".repeat(
        64,
      )),
    (candidate) =>
      (candidate.files.find((file) => file.classification === "upstream-modified").classification =
        "unreviewed"),
  ])
    await assert.rejects(verifyCandidate(fileURLToPath(root), mutate(change)));
});
test("required publisher verification cannot silently use inventory when bytes are absent", async () => {
  await assert.rejects(
    verifyCandidate(fileURLToPath(root), matrix, { requirePublisher: true }),
    /Publisher byte verification unavailable/,
  );
});
test("production checkout cannot stand in for separate bare publisher storage", async () => {
  await assert.rejects(
    verifyCandidate(fileURLToPath(root), matrix, {
      publisherRepo: fileURLToPath(root),
      requirePublisher: true,
    }),
    /outside production repository/,
  );
});
