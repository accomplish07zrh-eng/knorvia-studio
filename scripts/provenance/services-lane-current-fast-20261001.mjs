// Current candidate replay only. Historical tools, shared records and production remain immutable.
import assert from "node:assert/strict";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { git, readRepositoryFile } from "./git.mjs";
import { BASELINE_COMMIT, BASELINE_SOURCE, classify, createIndexes } from "./model.mjs";
import { assertAuditConsistent, auditThirdPartyInventory } from "./third-party-audit.mjs";
import {
  assertMatrix,
  assertFingerprint,
  assertSpan,
  gitFile,
} from "./services-lane-fast-20261001.mjs";
import { GROUPS, INPUT_PATHS, PUBLISHER_TREE } from "./services-lane-scope-fast-20261001.mjs";
import { assertCurrent, assertFileBinding } from "./services-lane-current-schema-fast-20261001.mjs";
import {
  MATRIX_PATH,
  SNAPSHOT_COMMIT,
  CORRECTION_COMMIT,
  HISTORICAL_CHECKPOINT,
  HISTORICAL_MATRIX_PATH,
  HISTORICAL_PRODUCTION_COMMIT,
  OWNER_PATH,
  LEGACY_TEST_PATH,
  PROTECTED_METHODS,
  LOCAL_REFERENCES,
  APPENDIX_REFERENCES,
  APPENDIX_COMMIT,
  UPDATED_PATHS,
  INSTALLED_PATHS,
} from "./services-lane-current-scope-fast-20261001.mjs";
export { assertCurrent } from "./services-lane-current-schema-fast-20261001.mjs";
export { MATRIX_PATH } from "./services-lane-current-scope-fast-20261001.mjs";
const facts = ({ text: _text, ...value }) => value;
const pathless = ({ path: _path, ...value }) => value;
export async function verifyCurrent(
  root,
  matrix,
  { publisherRepo, requirePublisher = false, verifyInstalled = false } = {},
) {
  assertCurrent(matrix);
  if (requirePublisher && !publisherRepo)
    throw new Error("Publisher byte verification unavailable: --publisher-repo is required");
  const cache = new Map();
  const readGit = (commit, path, repo = root) => {
    const key = `${repo}:${commit}:${path}`;
    if (!cache.has(key)) cache.set(key, gitFile(repo, commit, path));
    return cache.get(key);
  };
  const load = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
  const assertLive = async (path, expected) => {
    const current = await readRepositoryFile(root, path);
    assert.equal(current.kind, "file", `current file kind: ${path}`);
    assertFingerprint(current, expected, true);
  };
  const historical = await load(HISTORICAL_MATRIX_PATH);
  assertMatrix(historical);
  assert.equal(historical.payloadSha256, matrix.history.payloadSha256);
  for (const entry of matrix.history.files) {
    assert.deepEqual(facts(await readGit(HISTORICAL_CHECKPOINT, entry.path)), {
      ...pathless(entry),
      exists: true,
    });
    await assertLive(entry.path, entry);
  }
  assert.equal(matrix.publisher.source, BASELINE_SOURCE);
  assert.equal(matrix.publisher.commit, BASELINE_COMMIT);
  assert.equal(matrix.publisher.tree, PUBLISHER_TREE);
  assert.deepEqual(matrix.materials, historical.materials);
  assert.deepEqual(
    matrix.inputs.map((entry) => entry.path),
    INPUT_PATHS,
  );
  const baseline = await load("licensing/upstream-baseline.json"),
    reviews = await load("licensing/reviews.json"),
    thirdParty = await load("third-party/inventory.json");
  const indexes = createIndexes(baseline, reviews, thirdParty);
  const audit = await auditThirdPartyInventory(root, thirdParty);
  assertAuditConsistent(audit);
  assert.deepEqual(audit.reviewRequired, matrix.materials.obligations);
  for (const input of matrix.inputs) {
    const old = historical.inputs.find((entry) => entry.path === input.path);
    assert.deepEqual(input, { ...old, commit: SNAPSHOT_COMMIT });
    assert.deepEqual(facts(await readGit(SNAPSHOT_COMMIT, input.path)), {
      ...pathless(input),
      exists: true,
    });
    await assertLive(input.path, input);
    assert.deepEqual(facts(await readGit(HISTORICAL_PRODUCTION_COMMIT, input.path)), {
      ...pathless(old),
      exists: true,
    });
  }
  if (publisherRepo) {
    publisherRepo = await realpath(publisherRepo);
    const distance = relative(await realpath(root), publisherRepo);
    assert.ok(
      distance === ".." ||
        distance.startsWith("../") ||
        distance.startsWith("..\\") ||
        isAbsolute(distance),
      "publisher storage must be outside production repository",
    );
    assert.equal(
      (await git(publisherRepo, ["rev-parse", "--is-bare-repository"])).toString().trim(),
      "true",
    );
    assert.equal(
      (await git(publisherRepo, ["rev-parse", `${BASELINE_COMMIT}^{commit}`])).toString().trim(),
      BASELINE_COMMIT,
    );
    assert.equal(
      (await git(publisherRepo, ["rev-parse", `${BASELINE_COMMIT}^{tree}`])).toString().trim(),
      PUBLISHER_TREE,
    );
  }
  const references = new Map();
  for (const entry of matrix.references) {
    const old = historical.references.find((value) => value.id === entry.id);
    if (old) assert.deepEqual(entry, old);
    else {
      const expected = [...LOCAL_REFERENCES, ...APPENDIX_REFERENCES].find(
        (value) => value.id === entry.id,
      );
      assert.deepEqual(
        { id: entry.id, origin: entry.origin, path: entry.path, commit: entry.commit },
        expected,
      );
    }
    if (entry.origin === "publisher") {
      const inventory = baseline.files.find((value) => value.path === entry.path);
      assert.ok(inventory, "publisher inventory entry missing");
      for (const key of ["mode", "blob", "sha256", "normalizedSha256", "encoding", "bytes"])
        assert.equal(entry[key], inventory[key]);
      if (!publisherRepo) continue;
    }
    const actual = await readGit(
      entry.commit,
      entry.path,
      entry.origin === "publisher" ? publisherRepo : root,
    );
    const { id: _id, origin: _origin, path: _path, ...expected } = entry;
    assert.deepEqual(facts(actual), { ...expected, exists: true });
    references.set(entry.id, actual.text);
  }
  async function verifyFiles(files, commit, live) {
    let unavailablePublisherSpans = 0;
    const texts = new Map();
    for (const file of files) {
      const snapshot = await readGit(commit, file.path);
      assertFileBinding(
        file,
        snapshot,
        (await git(root, ["log", "-1", "--format=%H", commit, "--", file.path])).toString().trim(),
      );
      if (live) await assertLive(file.path, file.current);
      for (const local of file.localBaselines)
        assert.deepEqual(facts(await readGit(local.commit, file.path)), local);
      const classification = classify({ path: file.path, kind: "file", ...file.current }, indexes);
      assert.equal(
        classification.classification,
        file.classification,
        `schema classification: ${file.path}`,
      );
      assert.equal(classification.license, "NOASSERTION");
      assert.equal(classification.review, null);
      assert.deepEqual(classification.upstream, file.upstream);
      assert.deepEqual(classification.thirdParty, file.thirdParty);
      assert.equal(
        file.formatting.entireIntegratedFileRetained,
        file.localBaselines[0].exists && file.localBaselines[0].sha256 === file.current.sha256,
      );
      const group = GROUPS.find((value) => value.id === file.group);
      const allowed = new Set(
        matrix.references
          .filter(
            (value) =>
              group.inherited.some((path) => value.path === `packages/services/src/${path}`) ||
              (file.group === "terminal-runtime" &&
                [...LOCAL_REFERENCES, ...APPENDIX_REFERENCES].some((ref) => ref.id === value.id)),
          )
          .map((value) => value.id),
      );
      for (const observation of [...file.matches, ...file.literals]) {
        const expression = assertSpan(observation.current, snapshot.text);
        for (const source of observation.sources) {
          assert.ok(allowed.has(source.sourceId), "out-of-group source reference");
          const sourceText = references.get(source.sourceId);
          if (sourceText === undefined) {
            assert.equal(
              matrix.references.find((value) => value.id === source.sourceId).origin,
              "publisher",
            );
            unavailablePublisherSpans++;
          } else
            assert.equal(
              assertSpan(source.range, sourceText),
              expression,
              "source-expression binding",
            );
        }
      }
      texts.set(file.path, snapshot.text);
    }
    return { texts, unavailablePublisherSpans };
  }
  const oldReplay = await verifyFiles(historical.files, HISTORICAL_PRODUCTION_COMMIT, false);
  const currentReplay = await verifyFiles(matrix.files, SNAPSHOT_COMMIT, true);
  const appendixReplay = await verifyFiles(matrix.appendix.files, APPENDIX_COMMIT, true);
  const oldByPath = new Map(historical.files.map((entry) => [entry.path, entry]));
  const byPath = new Map(matrix.files.map((entry) => [entry.path, entry]));
  for (const path of matrix.protected.paths)
    assert.deepEqual(
      byPath.get(path).current,
      oldByPath.get(path).current,
      `protected production/context changed: ${path}`,
    );
  const owner = currentReplay.texts.get(OWNER_PATH);
  assert.equal(byPath.get(OWNER_PATH).lastContentCommit, CORRECTION_COMMIT);
  assert.equal(
    (await readGit(CORRECTION_COMMIT, OWNER_PATH)).sha256,
    byPath.get(OWNER_PATH).current.sha256,
  );
  const protectedNames = [];
  for (const unit of matrix.protected.methods) {
    const expression = assertSpan(unit.current, owner);
    assert.equal(expression, assertSpan(unit.source.range, references.get("historical-owner")));
    assert.ok(
      new RegExp(`^(?:private |get )*${unit.name}(?:<T>)?\\(`).test(expression),
      `protected method identity: ${unit.name}`,
    );
    protectedNames.push(unit.name);
  }
  assert.deepEqual(protectedNames, PROTECTED_METHODS);
  for (const unit of matrix.ownershipExpressions) assertSpan(unit.current, owner);
  const receipt = currentReplay.texts.get(matrix.proof.receiptPath);
  assertSpan(matrix.proof.red.range, receipt);
  const correction = matrix.proof.legacyCorrection;
  const legacy = currentReplay.texts.get(LEGACY_TEST_PATH),
    oldLegacy = references.get("historical-legacy-test");
  for (const [text, span] of [
    [legacy, correction.after],
    [oldLegacy, correction.before.range],
  ]) {
    assertSpan(span, text);
    const start = text.indexOf(
      'test("kill failure keeps tracked retryable PTY while retiring event resources"',
    );
    const end = text.indexOf("\ntest(", start + 1);
    assert.ok(span.start > start && span.end < end, "legacy assertion bound to intended test");
  }
  assertSpan(correction.explanation, legacy);
  assert.equal(matrix.appendix.clarification.productionChanged, false);
  assert.equal(matrix.appendix.clarification.retryOrder, "retained/requeued insertion order");
  const appendixSpec = matrix.appendix.files.find((entry) => entry.role === "spec");
  const clarification = assertSpan(
    matrix.appendix.clarification.range,
    appendixReplay.texts.get(appendixSpec.path),
  );
  assert.ok(
    clarification.includes("retained/requeued order") &&
      clarification.includes("AggregateError.errors"),
  );
  let installedVerification = "not-requested";
  if (verifyInstalled) {
    for (const artifact of matrix.installedArtifacts.files) {
      const current = await readRepositoryFile(root, artifact.path);
      assert.equal(current.kind, "file");
      assertFingerprint(current, artifact);
    }
    assert.equal(
      JSON.parse(await readFile(resolve(root, INSTALLED_PATHS[0]), "utf8")).version,
      matrix.installedArtifacts.version,
    );
    installedVerification = "verified-installed-artifact-bytes; publisher commit not verified";
  }
  let reused = 0;
  for (const file of matrix.files)
    if (!UPDATED_PATHS.includes(file.path)) {
      assert.deepEqual(
        file,
        oldByPath.get(file.path),
        `unchanged evidence substituted: ${file.path}`,
      );
      reused++;
    }
  return {
    snapshotCommit: SNAPSHOT_COMMIT,
    productionCommit: CORRECTION_COMMIT,
    historicalProductionCommit: HISTORICAL_PRODUCTION_COMMIT,
    historicalSnapshotFiles: historical.files.length,
    currentFiles: matrix.files.length,
    reusedHistoricalFiles: reused,
    updatedExistingFiles: 2,
    addedMonitorFiles: 5,
    appendixCommit: APPENDIX_COMMIT,
    appendixFiles: matrix.appendix.files.length,
    references: references.size,
    publisherVerification: publisherRepo ? "verified-exact-bytes" : "unavailable",
    unavailablePublisherSpans: {
      historical: oldReplay.unavailablePublisherSpans,
      current: currentReplay.unavailablePublisherSpans,
      appendix: appendixReplay.unavailablePublisherSpans,
    },
    installedVerification,
    protectedPaths: matrix.protected.paths.length,
    protectedMethods: protectedNames.length,
    obligations: audit.reviewRequired.length,
    acceptedReview: false,
    nativeAcceptance: false,
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {},
    args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--publisher-repo" && args[i + 1]) options.publisherRepo = args[++i];
    else if (args[i] === "--require-publisher") options.requirePublisher = true;
    else if (args[i] === "--verify-installed") options.verifyInstalled = true;
    else throw new Error(`Unknown or incomplete checker option: ${args[i]}`);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const matrix = JSON.parse(await readFile(resolve(root, MATRIX_PATH), "utf8"));
  console.log(JSON.stringify(await verifyCurrent(root, matrix, options), null, 2));
}
