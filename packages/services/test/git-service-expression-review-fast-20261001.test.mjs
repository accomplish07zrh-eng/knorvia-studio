import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareExpressions,
  expressions,
  verifyReview,
} from "./git-service-expression-review-fast-20261001.mjs";

const owned = `const COMMIT_MESSAGE_DIFF_FILE_LIMIT = 8;
function getCommitMessageDiffQueries(files){return files;}
export function createGitService(options){const repo=options.repo;return {
async generateCommitMessage(params){return await repo.read(params);},
async refresh(params){return await repo.snapshot(params);}
};}`;
const expected = {
  candidate: "owned-fixed-checkpoint",
  path: "owned/synthetic.ts",
  expressions: compareExpressions(owned, { publisher: owned, localImport: owned }),
};
test("exact synthetic declarations are covered in source order", () => {
  assert.deepEqual(
    expressions(owned).map((p) => p.name),
    [
      "COMMIT_MESSAGE_DIFF_FILE_LIMIT",
      "getCommitMessageDiffQueries",
      "repo",
      "generateCommitMessage",
      "refresh",
    ],
  );
  assert.ok(expected.expressions.every((p) => Object.values(p.exact).every(Boolean)));
  verifyReview(structuredClone(expected), expected);
});
test("changed synthetic expression is retention evidence only", () => {
  const rows = compareExpressions(
    owned.replace("repo.snapshot(params)", "repo.snapshot({...params})"),
    { publisher: owned },
  );
  assert.equal(rows.at(-1).exact.publisher, false);
  assert.ok(rows.slice(0, -1).every((r) => r.exact.publisher));
});
for (const kind of ["omitted", "digest", "retention", "checkpoint"])
  test(`reject ${kind} candidate evidence`, () => {
    const changed = structuredClone(expected);
    if (kind === "omitted") changed.expressions.pop();
    if (kind === "digest") changed.expressions[0].sha256 = "0".repeat(64);
    if (kind === "retention") changed.expressions[0].exact.publisher = false;
    if (kind === "checkpoint") changed.candidate = "owned-unrelated-checkpoint";
    assert.throws(
      () => verifyReview(changed, expected),
      /candidate scope, bytes or expression facts changed/,
    );
  });
test("missing and ambiguous synthetic declarations cannot claim exact coverage", () => {
  assert.throws(() => compareExpressions(owned, { publisher: "" }), /missing prior expression/);
  assert.throws(() =>
    expressions(owned + "\nfunction getCommitMessageDiffQueries(files){return [];}"),
  );
});
