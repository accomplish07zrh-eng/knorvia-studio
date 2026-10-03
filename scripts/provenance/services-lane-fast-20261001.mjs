// Source-exposed lane evidence only; no accepted review, license grant or production write.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { git, readRepositoryFile } from "./git.mjs";
import {
  BASELINE_COMMIT,
  BASELINE_SOURCE,
  assertRelativePath,
  classify,
  createIndexes,
  fingerprint,
} from "./model.mjs";
import { assertAuditConsistent, auditThirdPartyInventory } from "./third-party-audit.mjs";

import {
  PRODUCTION_COMMIT,
  INTEGRATED_COMMIT,
  IMPORTED_COMMIT,
  PUBLISHER_TREE,
  MATRIX_PATH,
  GROUPS,
  REFERENCE_PATHS,
  SCOPE,
  INPUT_PATHS,
  sourcePath,
} from "./services-lane-scope-fast-20261001.mjs";
export {
  PRODUCTION_COMMIT,
  INTEGRATED_COMMIT,
  IMPORTED_COMMIT,
  PUBLISHER_TREE,
  MATRIX_PATH,
  GROUPS,
  REFERENCE_PATHS,
  SCOPE,
  INPUT_PATHS,
};
const sha = (text) => createHash("sha256").update(text).digest("hex");
const hex = (value, length) => assert.match(value, new RegExp(`^[a-f0-9]{${length}}$`));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
function payloadDigest(matrix) {
  const { payloadSha256: _digest, ...payload } = matrix;
  return sha(JSON.stringify(canonical(payload)));
}
export function seal(matrix) {
  return { ...matrix, payloadSha256: payloadDigest(matrix) };
}
function validFingerprint(value) {
  hex(value.sha256, 64);
  hex(value.normalizedSha256, 64);
  assert.equal(value.encoding, "utf8-lf");
  assert.ok(Number.isSafeInteger(value.bytes) && value.bytes >= 0);
}
export function assertFingerprint(actual, expected, worktree = false) {
  assert.equal(actual.normalizedSha256, expected.normalizedSha256, "normalized content changed");
  assert.equal(actual.encoding, expected.encoding);
  if (!worktree) {
    assert.equal(actual.sha256, expected.sha256, "raw snapshot bytes changed");
    assert.equal(actual.bytes, expected.bytes);
  }
}
function coordinate(text, offset) {
  const prefix = text.slice(0, offset);
  return [prefix.split("\n").length, offset - prefix.lastIndexOf("\n")];
}
export function assertSpan(span, text) {
  assert.ok(Number.isSafeInteger(span.start) && Number.isSafeInteger(span.end));
  assert.ok(
    span.start >= 0 && span.end > span.start && span.end <= text.length,
    "invalid span bounds",
  );
  assert.deepEqual([span.startLine, span.startColumn], coordinate(text, span.start));
  assert.deepEqual([span.endLine, span.endColumn], coordinate(text, span.end));
  const expression = text.slice(span.start, span.end);
  assert.equal(sha(expression), span.sha256, "retained/fixture span digest changed");
  if (Object.hasOwn(span, "expression")) assert.equal(span.expression, expression);
  return expression;
}
export function assertMatrix(matrix) {
  assert.equal(matrix.schemaVersion, 1);
  assert.equal(matrix.kind, "services-lane-contribution-candidate");
  assert.equal(matrix.payloadSha256, payloadDigest(matrix), "candidate payload digest changed");
  assert.equal(matrix.productionCommit, PRODUCTION_COMMIT);
  assert.equal(matrix.publisher.source, BASELINE_SOURCE);
  assert.equal(matrix.publisher.commit, BASELINE_COMMIT);
  assert.equal(matrix.publisher.tree, PUBLISHER_TREE);
  assert.deepEqual(matrix.policy, {
    sourceExposure: true,
    cleanRoom: false,
    wholeFileLicenseGrant: false,
    acceptedReview: false,
  });
  assert.equal(matrix.materials.obligations.length, 27);
  assert.deepEqual(matrix.inputs.map((entry) => entry.path).sort(), INPUT_PATHS);
  assert.deepEqual(
    matrix.files.map((entry) => entry.path).sort(),
    SCOPE.map((entry) => entry.path).sort(),
  );
  const scopes = new Map(SCOPE.map((entry) => [entry.path, entry]));
  for (const file of matrix.files) {
    assertRelativePath(file.path);
    assert.equal(file.group, scopes.get(file.path).group);
    assert.equal(file.role, scopes.get(file.path).role);
    hex(file.lastContentCommit, 40);
    hex(file.current.blob, 40);
    validFingerprint(file.current);
    assert.equal(file.current.mode, "100644");
    assert.deepEqual(file.proposal, { decision: null, license: "NOASSERTION" });
    assert.ok(
      ["upstream-unchanged", "upstream-modified", "unreviewed"].includes(file.classification),
    );
    assert.equal(file.sourceExposure, true);
    for (const key of ["newStructures", "retainedPolicy", "futureSeparation"]) {
      assert.ok(
        Array.isArray(file[key]) &&
          file[key].every((value) => typeof value === "string" && value.trim()),
      );
    }
    assert.deepEqual(
      file.localBaselines.map((entry) => entry.commit),
      [INTEGRATED_COMMIT, IMPORTED_COMMIT],
    );
    for (const entry of file.localBaselines)
      if (entry.exists) {
        hex(entry.blob, 40);
        validFingerprint(entry);
      }
    assert.ok(Array.isArray(file.matches) && Array.isArray(file.literals));
  }
  for (const entry of matrix.inputs) {
    assertRelativePath(entry.path);
    validFingerprint(entry);
  }
  const identities = [];
  for (const reference of matrix.references) {
    assert.ok(REFERENCE_PATHS.includes(reference.path));
    const commit = {
      publisher: BASELINE_COMMIT,
      integrated: INTEGRATED_COMMIT,
      imported: IMPORTED_COMMIT,
    }[reference.origin];
    assert.equal(reference.commit, commit);
    assert.equal(reference.id, `${reference.origin}:${reference.path}`);
    assert.equal(reference.mode, "100644");
    hex(reference.blob, 40);
    validFingerprint(reference);
    identities.push(reference.id);
  }
  assert.deepEqual(
    identities.sort(),
    ["publisher", "integrated", "imported"]
      .flatMap((origin) => REFERENCE_PATHS.map((path) => `${origin}:${path}`))
      .sort(),
  );
}

export async function gitFile(root, commit, path) {
  assertRelativePath(path);
  const listed = (await git(root, ["ls-tree", commit, "--", path])).toString().trim();
  if (!listed) return { commit, exists: false };
  const match = /^(\d+) blob ([a-f0-9]{40})\t(.+)$/u.exec(listed);
  assert.ok(match && match[3] === path, `unexpected Git entry: ${path}`);
  assert.equal(match[1], "100644");
  const bytes = await git(root, ["cat-file", "blob", match[2]]);
  return {
    commit,
    exists: true,
    mode: match[1],
    blob: match[2],
    ...fingerprint(bytes),
    text: bytes.toString("utf8"),
  };
}
const withoutText = ({ text: _text, ...facts }) => facts;
export async function verifyCandidate(
  root,
  matrix,
  { publisherRepo, requirePublisher = false } = {},
) {
  assertMatrix(matrix);
  if (requirePublisher && !publisherRepo)
    throw new Error("Publisher byte verification unavailable: --publisher-repo is required");
  const load = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
  for (const input of matrix.inputs) {
    const current = await readRepositoryFile(root, input.path);
    assert.equal(current.kind, "file");
    assertFingerprint(current, input, true);
    const snapshot = await gitFile(root, PRODUCTION_COMMIT, input.path);
    assertFingerprint(snapshot, input);
    assert.equal(snapshot.blob, input.blob);
    assert.equal(snapshot.mode, input.mode);
    assert.equal(input.commit, PRODUCTION_COMMIT);
  }
  const baseline = await load("licensing/upstream-baseline.json");
  const reviews = await load("licensing/reviews.json");
  const thirdParty = await load("third-party/inventory.json");
  const indexes = createIndexes(baseline, reviews, thirdParty);
  const audit = await auditThirdPartyInventory(root, thirdParty);
  assertAuditConsistent(audit);
  assert.deepEqual(audit.reviewRequired, matrix.materials.obligations);
  const references = new Map();
  if (publisherRepo) {
    const repo = await realpath(publisherRepo),
      local = await realpath(root);
    const distance = relative(local, repo);
    assert.ok(
      distance === ".." ||
        distance.startsWith("../") ||
        distance.startsWith("..\\") ||
        isAbsolute(distance),
      "publisher storage must be outside production repository",
    );
    assert.equal(
      (await git(repo, ["rev-parse", "--is-bare-repository"])).toString().trim(),
      "true",
    );
    assert.equal(
      (await git(repo, ["rev-parse", `${BASELINE_COMMIT}^{commit}`])).toString().trim(),
      BASELINE_COMMIT,
    );
    assert.equal(
      (await git(repo, ["rev-parse", `${BASELINE_COMMIT}^{tree}`])).toString().trim(),
      PUBLISHER_TREE,
    );
    publisherRepo = repo;
  }
  for (const reference of matrix.references) {
    if (reference.origin === "publisher") {
      const inventory = baseline.files.find((entry) => entry.path === reference.path);
      assert.ok(inventory, "publisher inventory entry missing");
      for (const key of ["mode", "blob", "sha256", "normalizedSha256", "encoding", "bytes"])
        assert.equal(reference[key], inventory[key]);
      if (!publisherRepo) continue;
    }
    const actual = await gitFile(
      reference.origin === "publisher" ? publisherRepo : root,
      reference.commit,
      reference.path,
    );
    const expected = { ...reference };
    delete expected.id;
    delete expected.origin;
    delete expected.path;
    assert.deepEqual(withoutText(actual), { ...expected, exists: true });
    references.set(reference.id, actual.text);
  }
  let unavailablePublisherMatches = 0;
  for (const file of matrix.files) {
    const snapshot = await gitFile(root, PRODUCTION_COMMIT, file.path);
    assert.equal(snapshot.blob, file.current.blob);
    assertFingerprint(snapshot, file.current);
    assert.equal(
      (await git(root, ["log", "-1", "--format=%H", PRODUCTION_COMMIT, "--", file.path]))
        .toString()
        .trim(),
      file.lastContentCommit,
    );
    const current = await readRepositoryFile(root, file.path);
    assert.equal(current.kind, "file");
    assertFingerprint(current, file.current, true);
    for (const entry of file.localBaselines)
      assert.deepEqual(withoutText(await gitFile(root, entry.commit, file.path)), entry);
    const classification = classify({ path: file.path, kind: "file", ...file.current }, indexes);
    assert.equal(
      classification.classification,
      file.classification,
      `schema classification changed: ${file.path}`,
    );
    assert.equal(classification.license, "NOASSERTION");
    assert.equal(classification.review, null);
    assert.deepEqual(classification.upstream, file.upstream);
    assert.deepEqual(classification.thirdParty, file.thirdParty);
    assert.equal(
      file.formatting.entireIntegratedFileRetained,
      file.localBaselines[0].exists && file.current.sha256 === file.localBaselines[0].sha256,
    );
    const allowedReferences = new Set(
      GROUPS.find((group) => group.id === file.group).inherited.map(sourcePath),
    );
    for (const evidence of [...file.matches, ...file.literals]) {
      const expression = assertSpan(evidence.current, snapshot.text);
      for (const match of evidence.sources) {
        const reference = matrix.references.find((entry) => entry.id === match.sourceId);
        assert.ok(reference && allowedReferences.has(reference.path), "out-of-group reference");
        const text = references.get(match.sourceId);
        if (text === undefined) {
          assert.equal(reference.origin, "publisher");
          unavailablePublisherMatches++;
        } else
          assert.equal(assertSpan(match.range, text), expression, "retained expression mismatch");
      }
    }
  }
  return {
    files: matrix.files.length,
    references: references.size,
    publisherVerification: publisherRepo ? "verified-exact-bytes" : "unavailable",
    unavailablePublisherMatches,
    obligations: audit.reviewRequired.length,
    acceptedReview: false,
    productionCommit: PRODUCTION_COMMIT,
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let publisherRepo,
    requirePublisher = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--publisher-repo" && args[i + 1]) publisherRepo = args[++i];
    else if (args[i] === "--require-publisher") requirePublisher = true;
    else throw new Error(`Unknown or incomplete checker option: ${args[i]}`);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const matrix = JSON.parse(await readFile(resolve(root, MATRIX_PATH), "utf8"));
  console.log(
    JSON.stringify(
      await verifyCandidate(root, matrix, { publisherRepo, requirePublisher }),
      null,
      2,
    ),
  );
}
