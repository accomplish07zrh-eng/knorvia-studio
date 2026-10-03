import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const receiptPath = "docs/evidence/knorvia-create-workflow-graph-components-receipt-20261001.json";
const read = (name) => readFileSync(path.join(root, name));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: root });
const receipt = JSON.parse(read(receiptPath));
const check = (record, bytes = read(record.path)) => {
  assert.equal(bytes.length, record.bytes, record.path);
  assert.equal(sha(bytes), record.sha256, record.path);
};
assert.equal(receipt.formatVersion, 1);
assert.equal(receipt.sourceExposure, true);
assert.equal(receipt.wholeFileRightsDecision, null);
for (const record of [...receipt.files, receipt.previousReview, receipt.checker]) check(record);
const source = receipt.files[0];
assert.equal(
  git("rev-parse", `${receipt.production}:${source.path}`).toString().trim(),
  source.blob,
);
const before = git("show", `${receipt.baseline}:${source.path}`);
assert.equal(sha(before), receipt.baselineSourceSha256);
assert.equal(
  sha(git("show", `${receipt.initialProduction}:${source.path}`)),
  receipt.regression.initialSourceSha256,
);
assert.deepEqual(
  read(source.path).subarray(0, receipt.retainedPrefixBytes),
  before.subarray(0, receipt.retainedPrefixBytes),
);
for (const record of receipt.files.slice(1)) {
  check(record, git("show", `${record.commit}:${record.path}`));
}
const archive = JSON.parse(read(receipt.archive));
assert.equal(archive.sourceSha256, sha(before));
assert.equal(archive.compiledSha256, sha(archive.compiled));
assert.equal(archive.declarationSha256, sha(archive.declaration));
const gold = JSON.parse(read(receipt.contract));
assert.equal(gold.direct.length, 24);
assert.equal(gold.project.length, 7);
assert.equal(gold.executor.length, 4);
assert.match(gold.concurrent, /^[a-f0-9]{64}$/u);
assert.equal(
  sha(read("apps/cli/packages/core/dist/tool/handlers/create-workflow-graph-bounds.js")),
  archive.boundsSha256,
);
assert.equal(
  sha(read("apps/cli/packages/core/dist/tool/handlers/workflow-analysis-display.js")),
  archive.analysisSha256,
);
if (process.argv.includes("--emitted")) {
  for (const record of receipt.emitted) check(record);
  assert.equal(read(receipt.emitted[1].path).toString(), archive.declaration);
}
if (process.argv.includes("--logs")) {
  for (const record of receipt.checks) {
    const bytes = readFileSync(record.log.path);
    check(record.log, bytes);
    if (record.tests !== undefined) {
      const text = bytes.toString();
      for (const [name, expected] of Object.entries({
        tests: record.tests,
        pass: record.pass ?? record.tests,
        fail: record.fail ?? 0,
        cancelled: 0,
        skipped: 0,
      }))
        assert.match(text, new RegExp(`ℹ ${name} ${expected}(?:\\r?\\n|$)`, "u"));
    }
  }
}
if (process.argv.includes("--scope")) {
  const changed = git("diff", "--name-only", receipt.baseline)
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);
  const untracked = git("ls-files", "--others", "--exclude-standard")
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);
  assert.deepEqual([...new Set([...changed, ...untracked])].sort(), [...receipt.scope].sort());
}
console.log(
  JSON.stringify({
    ownedFiles: receipt.scope.length,
    frozenFiles: receipt.files.length - 1,
    retainedPrefixBytes: receipt.retainedPrefixBytes,
    emitted: process.argv.includes("--emitted"),
    scope: process.argv.includes("--scope"),
    wholeFileRightsDecision: null,
  }),
);
