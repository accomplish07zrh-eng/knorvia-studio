import assert from "node:assert/strict";
import { test } from "node:test";
import {
  expressionFacts,
  repositoryExpressions,
  verifyReview,
} from "./git-repository-expression-review-fast-20261001.mjs";

const source = `// owned synthetic fixed prose
const MARKERS = ["owned"];
function read(){return "owned";}
export function createGitCliRepo(options){
const requests = new Map();
function invalidate(key){requests.delete(key);}
return {async switchBranch(path,name){return await options.read(path,name);}};
}`;
const expected = {
  candidate: "owned-checkpoint",
  sourceSha256: "owned-fixed-digest",
  emitted: "owned-emitted-digest",
  ...expressionFacts(source, { publisher: source }),
};
test("whole source is partitioned into ordered owners and exact syntax/prose gaps", () => {
  const { parts, gaps } = repositoryExpressions(source);
  assert.deepEqual(
    parts.map((p) => p.name),
    [
      "top/value/MARKERS",
      "top/function/read",
      "factory/value/requests",
      "factory/function/invalidate",
      "method/switchBranch",
    ],
  );
  const ranges = [...parts, ...gaps].sort((a, b) => a.start - b.start);
  assert.equal(ranges[0].start, 0);
  assert.equal(ranges.at(-1).end, source.length);
  for (let i = 1; i < ranges.length; i++) assert.equal(ranges[i - 1].end, ranges[i].start);
  assert.equal(ranges.map((r) => source.slice(r.start, r.end)).join(""), source);
  assert.ok(expected.owners.every((r) => r.exact.publisher));
  verifyReview(structuredClone(expected), expected);
});
test("changed, added and absent owners are retention facts rather than rights grants", () => {
  const changed = expressionFacts(source.replace('return "owned";', 'return "changed";'), {
    publisher: source,
  });
  assert.equal(changed.owners.find((p) => p.name === "top/function/read").exact.publisher, false);
  const absent = expressionFacts(source.replace('function read(){return "owned";}\n', ""), {
    publisher: source,
  });
  assert.deepEqual(
    absent.absentPublisherOwners.map((p) => p.name),
    ["top/function/read"],
  );
  const added = expressionFacts(source + "\nfunction added(){return 1;}", { publisher: source });
  assert.equal(added.owners.at(-1).exact.publisher, false);
});
for (const kind of ["omitted-owner", "retention", "gap", "emitted", "candidate"])
  test(`reject ${kind} evidence`, () => {
    const changed = structuredClone(expected);
    if (kind === "omitted-owner") changed.owners.pop();
    if (kind === "retention") changed.owners[0].exact.publisher = false;
    if (kind === "gap") changed.gaps[0].sha256 = "0".repeat(64);
    if (kind === "emitted") changed.emitted = "owned-unrelated-output";
    if (kind === "candidate") changed.candidate = "owned-wrong-checkpoint";
    assert.throws(
      () => verifyReview(changed, expected),
      /candidate bytes, owner coverage or lineage changed/,
    );
  });
test("malformed or ambiguous declarations cannot claim complete owner coverage", () => {
  assert.throws(
    () => repositoryExpressions(source + "\nfunction read(){}"),
    /ambiguous review owner/,
  );
  assert.throws(() => repositoryExpressions("function {"), /malformed review source/);
});
