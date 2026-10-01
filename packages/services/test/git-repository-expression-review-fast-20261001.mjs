// Read-only exposed-source facts. Exact matches and hashes never grant rights.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const candidate = "dfac8018752da1c7b7f4d26f1cecb9721c23c58c";
export const sourcePath = "packages/services/src/git/repo/gitCliRepo.ts";
const inventoryPath = "docs/knorvia-git-repository-expression-review-fast-20261001.jsonl";
const oraclePath = "packages/services/test/git-branch-transition-legacy-fast-20261001.json";
const pins = {
  publisher: "872ad960de7ec172591f7e1952f7849229f94521",
  localImport: "7619e41b950bd52073ebf36754146cf25659d9fa",
  integrated: "0d80f9ca37b1daef162ecc69bd18f6e8fc30a146",
};
const emittedPins = {
  js: "5c2f62c2d614809c709cb1e87102a1f3638572f6d2614bd1248ab6c2d703f36a",
  "d.ts": "a6a19273740e97f89c1b0cdc88b160570d45749e6d70edbb2c39850f3f95870b",
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const metadata = ({ commit, blob, sha256 }) => ({ commit, blob, sha256 });

export function repositoryExpressions(text, path = sourcePath) {
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  assert.equal(sf.parseDiagnostics.length, 0, "malformed review source");
  const parts = [];
  const add = (name, node) => {
    const start = node.getStart(sf),
      end = node.end;
    parts.push({
      name,
      start,
      end,
      lines: [
        sf.getLineAndCharacterOfPosition(start).line + 1,
        sf.getLineAndCharacterOfPosition(end).line + 1,
      ],
      sha256: hash(text.slice(start, end)),
    });
  };
  const declarations = (statement, prefix) => {
    if (ts.isFunctionDeclaration(statement))
      add(`${prefix}/function/${statement.name.text}`, statement);
    if (ts.isInterfaceDeclaration(statement))
      add(`${prefix}/type/${statement.name.text}`, statement);
    if (ts.isVariableStatement(statement))
      for (const node of statement.declarationList.declarations)
        add(`${prefix}/value/${node.name.getText(sf)}`, node);
  };
  for (const statement of sf.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === "createGitCliRepo") {
      for (const child of statement.body.statements) {
        declarations(child, "factory");
        if (ts.isReturnStatement(child) && ts.isObjectLiteralExpression(child.expression))
          for (const method of child.expression.properties)
            if (ts.isMethodDeclaration(method)) add(`method/${method.name.getText(sf)}`, method);
      }
    } else declarations(statement, "top");
  }
  parts.sort((a, b) => a.start - b.start);
  assert.equal(new Set(parts.map((p) => p.name)).size, parts.length, "ambiguous review owner");
  const gaps = [];
  let cursor = 0;
  for (const p of parts) {
    assert.ok(p.start >= cursor, "overlapping review owners");
    if (p.start > cursor)
      gaps.push({ start: cursor, end: p.start, sha256: hash(text.slice(cursor, p.start)) });
    cursor = p.end;
  }
  if (cursor < text.length)
    gaps.push({ start: cursor, end: text.length, sha256: hash(text.slice(cursor)) });
  return { parts, gaps };
}

export function expressionFacts(text, sources) {
  const current = repositoryExpressions(text);
  const prior = Object.fromEntries(
    Object.entries(sources).map(([pin, s]) => [pin, repositoryExpressions(s).parts]),
  );
  return {
    owners: current.parts.map(({ name, lines, sha256 }) => ({
      name,
      lines,
      sha256,
      exact: Object.fromEntries(
        Object.entries(prior).map(([pin, parts]) => [
          pin,
          parts.find((p) => p.name === name)?.sha256 === sha256,
        ]),
      ),
    })),
    gaps: current.gaps,
    absentPublisherOwners: (prior.publisher ?? [])
      .filter((p) => !current.parts.some((q) => q.name === p.name))
      .map((p) => ({ name: p.name, sha256: p.sha256 })),
  };
}

export function verifyReview(record, expected) {
  assert.deepEqual(record, expected, "candidate bytes, owner coverage or lineage changed");
}

function reviewRecords(review) {
  const {
    owners,
    gaps,
    absentPublisherOwners,
    protectedProduction,
    protectedRecords,
    retiredBranchOracle,
    nextConflictOwner,
    ...header
  } = review;
  return [
    { record: "candidate", ...header },
    ...owners.map((r) => ({ record: "owner", ...r })),
    ...gaps.map((r) => ({ record: "syntax-gap", ...r })),
    ...absentPublisherOwners.map((r) => ({ record: "absent-publisher-owner", ...r })),
    ...protectedProduction.map((r) => ({ record: "protected-production", ...r })),
    ...protectedRecords.map((r) => ({ record: "protected-record", ...r })),
    { record: "retired-branch-oracle", ...retiredBranchOracle },
    { record: "next-conflict-owner", ...nextConflictOwner },
  ];
}

function currentReview(publisherStorage) {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
  const object = (commit, path, publisher = false) => {
    const args = publisher ? [`--git-dir=${publisherStorage}`] : [];
    const text = git(...args, "show", `${commit}:${path}`);
    return {
      text,
      commit,
      blob: git(...args, "rev-parse", `${commit}:${path}`).trim(),
      sha256: hash(text),
    };
  };
  const text = readFileSync(sourcePath, "utf8"),
    current = object(candidate, sourcePath);
  assert.equal(text, current.text, "current production differs from candidate");
  const sources = {},
    lineage = {};
  for (const [key, commit] of Object.entries(pins)) {
    const { text: s, ...facts } = object(commit, sourcePath, key === "publisher");
    sources[key] = s;
    lineage[key] = facts;
  }
  const protectedPaths = git(
    "ls-tree",
    "-r",
    "--name-only",
    candidate,
    "--",
    "packages/services/src/git",
  )
    .trim()
    .split("\n");
  const protectedProduction = protectedPaths.map((path) => {
    const bytes = readFileSync(path);
    assert.equal(
      git("hash-object", "--no-filters", "--", path).trim(),
      git("rev-parse", `${candidate}:${path}`).trim(),
      path,
    );
    return { path, sha256: hash(bytes) };
  });
  const protectedRecords = [
    "licensing/current-files.json",
    "licensing/reviews.json",
    "licensing/upstream-baseline.json",
    "LICENSE",
    "NOTICE.md",
  ].map((path) => {
    assert.equal(
      git("hash-object", "--no-filters", "--", path).trim(),
      git("rev-parse", `${candidate}:${path}`).trim(),
      path,
    );
    return { path, sha256: hash(readFileSync(path)) };
  });
  const inventory = JSON.parse(readFileSync("licensing/current-files.json", "utf8"));
  const oldRow = inventory.files.find((r) => r.path === sourcePath);
  assert.ok(oldRow);
  const oracle = JSON.parse(readFileSync(oraclePath, "utf8"));
  assert.equal(oracle.commit, candidate);
  assert.equal(oracle.sourceSha256, hash(text));
  assert.equal(oracle.copiedExposedTestOnly, true);
  assert.deepEqual(oracle.publisher, {
    commit: pins.publisher,
    blob: lineage.publisher.blob,
    tree: git(`--git-dir=${publisherStorage}`, "rev-parse", `${pins.publisher}^{tree}`).trim(),
  });
  const parts = repositoryExpressions(text).parts;
  assert.deepEqual(
    oracle.spans.map(({ name, text: s, sha256 }) => {
      const p = parts.find((p) => p.name === `method/${name}`);
      assert.equal(s, text.slice(p.start, p.end));
      assert.equal(hash(s), sha256);
      return name;
    }),
    ["switchBranch", "createBranchAndSwitch"],
  );
  const nextPath = "packages/services/src/git/repo/gitCheckpointRepo.ts";
  const next = object(candidate, nextPath),
    nextPublisher = object(pins.publisher, nextPath, true);
  const collector = (s) => {
    const sf = ts.createSourceFile(nextPath, s, ts.ScriptTarget.Latest, true);
    let found;
    function visit(n) {
      if (ts.isFunctionDeclaration(n) && n.name?.text === "collectWorkspaceConflicts") found = n;
      ts.forEachChild(n, visit);
    }
    visit(sf);
    assert.ok(found);
    return {
      sha256: hash(found.getText(sf)),
      lines: [
        sf.getLineAndCharacterOfPosition(found.getStart(sf)).line + 1,
        sf.getLineAndCharacterOfPosition(found.end).line + 1,
      ],
    };
  };
  const emitted = ["js", "d.ts"].map((suffix) => {
    const path = `packages/services/dist/git/repo/gitCliRepo.${suffix}`;
    const sha256 = hash(readFileSync(path));
    assert.equal(
      sha256,
      emittedPins[suffix],
      "emitted bytes differ from validated selected-index checkpoint",
    );
    return { path, sha256 };
  });
  return {
    schemaVersion: 1,
    kind: "lane-expression-review-facts",
    candidate,
    path: sourcePath,
    current: metadata(current),
    emitted,
    lineage,
    sharedInventoryHistorical: {
      sha256: oldRow.sha256,
      classification: oldRow.classification,
      license: oldRow.license,
      review: oldRow.review,
    },
    ...expressionFacts(text, sources),
    protectedProduction,
    protectedRecords,
    retiredBranchOracle: {
      path: oraclePath,
      sha256: hash(readFileSync(oraclePath)),
      productTestsRun: false,
    },
    nextConflictOwner: {
      path: nextPath,
      current: metadata(next),
      publisher: metadata(nextPublisher),
      collector: collector(next.text),
      publisherCollector: collector(nextPublisher.text),
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const storage = process.argv[2];
  assert.ok(storage, "supply existing exact publisher storage; this checker never fetches");
  const expected = currentReview(storage);
  const records = reviewRecords(expected);
  if (process.argv.includes("--write"))
    writeFileSync(inventoryPath, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  else
    verifyReview(
      readFileSync(inventoryPath, "utf8")
        .trimEnd()
        .split("\n")
        .map((r) => JSON.parse(r)),
      records,
    );
  console.log(
    `repository expression review OK: ${expected.owners.length} owners, source/emitted and protected digests; no rights decision`,
  );
}
