import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (name) => readFileSync(new URL(name, new URL("../../", import.meta.url)));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: root });
const receipt = JSON.parse(
  read("docs/evidence/knorvia-create-workflow-graph-quotient-receipt-20261001.json"),
);
const check = (record, bytes = read(record.path)) => {
  assert.equal(bytes.length, record.bytes, record.path);
  assert.equal(sha(bytes), record.sha256, record.path);
};
assert.equal(receipt.formatVersion, 1);
assert.equal(receipt.sourceExposure, true);
assert.equal(receipt.wholeFileRightsDecision, null);
for (const record of [
  ...receipt.files,
  ...receipt.unchanged,
  receipt.previousReceipt,
  receipt.checker,
])
  check(record);
const previous = JSON.parse(read(receipt.previousReceipt.path));
for (const record of previous.files.slice(1)) check(record);
check(previous.checker);
const frozen = JSON.parse(read(receipt.archive));
assert.equal(frozen.emittedSha256, previous.emitted[0].sha256);
const source = receipt.files[0];
assert.equal(
  git("rev-parse", `${receipt.production}:${source.path}`).toString().trim(),
  source.blob,
);
assert.equal(sha(git("show", `${receipt.baseline}:${source.path}`)), frozen.sourceSha256);
for (const record of receipt.files.slice(1))
  check(record, git("show", `${receipt.freeze}:${record.path}`));
const regions = (bytes) => {
  const text = bytes.toString();
  const start = text.indexOf("export function foldPhaseEdges(");
  const end = text.indexOf("/** 同一有序对折叠成一条，首见序；");
  assert.ok(start >= 0 && end > start);
  return [text.slice(0, start), text.slice(start, end), text.slice(end)];
};
const [header, body, tail] = regions(read(source.path));
assert.equal(sha(header), frozen.sourceHeaderSha256);
assert.equal(sha(tail), frozen.sourceTailSha256);
assert.equal(sha(body), receipt.ownerSha256);
assert.equal(sha(frozen.compiledBody), frozen.compiledBodySha256);
assert.equal(frozen.direct.length, 5);
assert.equal(frozen.coercion.length, 2);
if (process.argv.includes("--emitted")) {
  for (const record of receipt.emitted) check(record);
  const [head, , end] = regions(read(receipt.emitted[0].path));
  assert.equal(sha(head), frozen.compiledHeaderSha256);
  assert.equal(sha(end), frozen.compiledTailSha256);
  assert.equal(sha(head + frozen.compiledBody + end), frozen.emittedSha256);
  assert.equal(receipt.emitted[1].sha256, frozen.declarationSha256);
}
if (process.argv.includes("--logs")) {
  for (const record of receipt.checks) {
    const bytes = readFileSync(record.log.path);
    check(record.log, bytes);
    if (record.tests !== undefined)
      for (const [name, count] of Object.entries({
        tests: record.tests,
        pass: record.tests,
        fail: 0,
        cancelled: 0,
        skipped: 0,
      }))
        assert.match(bytes.toString(), new RegExp(`ℹ ${name} ${count}(?:\\r?\\n|$)`, "u"));
  }
  for (const record of previous.checks.filter(
    (item) => item.stage === "appended regression against initial implementation",
  ))
    check(record.log, readFileSync(record.log.path));
}
if (process.argv.includes("--scope")) {
  const names = (...args) =>
    git(...args)
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean);
  assert.deepEqual(
    [
      ...new Set([
        ...names("diff", "--name-only", receipt.baseline),
        ...names("ls-files", "--others", "--exclude-standard"),
      ]),
    ].sort(),
    [...receipt.scope].sort(),
  );
}
console.log(
  JSON.stringify({
    ownedFiles: receipt.scope.length,
    frozenFiles: receipt.files.length - 1,
    acceptedHelpersUnchanged: true,
    emitted: process.argv.includes("--emitted"),
    wholeFileRightsDecision: null,
  }),
);
