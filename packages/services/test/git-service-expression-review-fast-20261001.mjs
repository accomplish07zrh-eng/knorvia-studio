// Read-only lane evidence; exact matches are retention facts, never rights decisions.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { fingerprint } from "../../../scripts/provenance/model.mjs";

export const candidate = "46973a29b0186be28a946a2a2e488636e3ed4b94";
export const sourcePath = "packages/services/src/git/gitService.ts";
const matrixPath = "docs/knorvia-git-service-expression-review-fast-20261001.json";
const pins = {
  publisher: "872ad960de7ec172591f7e1952f7849229f94521",
  localImport: "7619e41b950bd52073ebf36754146cf25659d9fa",
  integrated: "0d80f9ca37b1daef162ecc69bd18f6e8fc30a146",
};
const protectedPaths = [
  "packages/services/src/git/git.ts",
  "packages/services/src/git/gitServiceReadProjection.ts",
  "packages/services/src/git/gitCommitMessageGenerator.ts",
  "packages/services/src/git/commitMessageFileScope.ts",
  "packages/services/src/git/repo/gitCliHelpers.ts",
  "packages/services/src/git/repo/gitCliRepo.ts",
];

export function expressions(text) {
  const sf = ts.createSourceFile(sourcePath, text, ts.ScriptTarget.Latest, true);
  const parts = [];
  function visit(node) {
    let name;
    if (ts.isMethodDeclaration(node)) name = node.name.getText(sf);
    if (ts.isFunctionDeclaration(node) && node.name?.text === "getCommitMessageDiffQueries")
      name = node.name.text;
    if (
      ts.isVariableDeclaration(node) &&
      ["COMMIT_MESSAGE_DIFF_FILE_LIMIT", "repo"].includes(node.name.getText(sf))
    )
      name = node.name.getText(sf);
    if (name)
      parts.push({
        name,
        startLine: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        endLine: sf.getLineAndCharacterOfPosition(node.end).line + 1,
        sha256: fingerprint(Buffer.from(node.getText(sf))).sha256,
      });
    ts.forEachChild(node, visit);
  }
  visit(sf);
  assert.equal(new Set(parts.map((p) => p.name)).size, parts.length);
  return parts;
}

export function compareExpressions(current, sources) {
  return expressions(current).map((part) => ({
    ...part,
    exact: Object.fromEntries(
      Object.entries(sources).map(([key, text]) => {
        const prior = expressions(text).find((p) => p.name === part.name);
        assert.ok(prior, `missing prior expression: ${key}/${part.name}`);
        return [key, prior.sha256 === part.sha256];
      }),
    ),
  }));
}

export function verifyReview(review, expected) {
  assert.deepEqual(review, expected, "candidate scope, bytes or expression facts changed");
}

function currentReview(publisherStorage) {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
  const current = readFileSync(sourcePath);
  assert.deepEqual(current, Buffer.from(git("show", `${candidate}:${sourcePath}`)));
  const sources = {},
    lineage = {};
  for (const [key, commit] of Object.entries(pins)) {
    const args = key === "publisher" ? [`--git-dir=${publisherStorage}`] : [];
    sources[key] = git(...args, "show", `${commit}:${sourcePath}`);
    lineage[key] = {
      commit,
      blob: git(...args, "rev-parse", `${commit}:${sourcePath}`).trim(),
      ...fingerprint(Buffer.from(sources[key])),
    };
  }
  const protectedFiles = protectedPaths.map((path) => {
    const bytes = readFileSync(path);
    assert.deepEqual(bytes, Buffer.from(git("show", `${candidate}:${path}`)));
    return { path, sha256: fingerprint(bytes).sha256 };
  });
  const nextPath = "packages/services/src/git/commitMessageFileScope.ts";
  const nextPublisher = git(
    `--git-dir=${publisherStorage}`,
    "show",
    `${pins.publisher}:${nextPath}`,
  );
  const functions = (text) => {
    const sf = ts.createSourceFile(nextPath, text, ts.ScriptTarget.Latest, true);
    return sf.statements.filter(ts.isFunctionDeclaration).map((node) => ({
      name: node.name.text,
      sha256: fingerprint(Buffer.from(node.getText(sf))).sha256,
    }));
  };
  const nextFunctions = functions(readFileSync(nextPath, "utf8"));
  assert.deepEqual(nextFunctions, functions(nextPublisher));
  return {
    schemaVersion: 1,
    kind: "lane-expression-review-facts",
    candidate,
    path: sourcePath,
    current: {
      blob: git("rev-parse", `${candidate}:${sourcePath}`).trim(),
      lastContentCommit: git("log", "-1", "--format=%H", candidate, "--", sourcePath).trim(),
      ...fingerprint(current),
    },
    publisher: {
      source: "https://github.com/zai-org/ZCode",
      tree: git(`--git-dir=${publisherStorage}`, "rev-parse", `${pins.publisher}^{tree}`).trim(),
    },
    lineage,
    policy: {
      classification: "mixed-source",
      sourceExposure: true,
      decision: null,
      license: "NOASSERTION",
    },
    expressions: compareExpressions(current.toString("utf8"), sources),
    protectedFiles,
    nextCandidate: {
      path: nextPath,
      publisherSha256: fingerprint(Buffer.from(nextPublisher)).sha256,
      exactPublisherFunctions: nextFunctions,
      changedHere: false,
    },
    emitted: [
      "packages/services/dist/git/gitService.js",
      "packages/services/dist/git/gitService.d.ts",
    ].map((path) => ({ path, sha256: fingerprint(readFileSync(path)).sha256 })),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const storage = process.argv[2];
  assert.ok(storage, "provide existing exact publisher Git storage; no automatic fetch");
  const expected = currentReview(storage);
  if (process.argv[3] === "--record")
    writeFileSync(matrixPath, JSON.stringify(expected, null, 2) + "\n");
  else verifyReview(JSON.parse(readFileSync(matrixPath, "utf8")), expected);
  console.log(
    `verified ${sourcePath} at ${candidate}: ${expected.current.sha256}; no rights decision`,
  );
}
