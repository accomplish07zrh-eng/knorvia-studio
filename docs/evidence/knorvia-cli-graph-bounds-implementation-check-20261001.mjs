import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path) => readFileSync(new URL(path, new URL("../../", import.meta.url)));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: root });
const receipt = JSON.parse(
  read("docs/evidence/knorvia-cli-graph-bounds-implementation-20261001.json"),
);
const check = (file, bytes = read(file.path)) => {
  assert.equal(bytes.length, file.bytes, file.path);
  assert.equal(sha(bytes), file.sha256, file.path);
};
assert.equal(receipt.formatVersion, 1);
assert.equal(receipt.sourceExposure, true);
assert.equal(receipt.wholeFileRightsDecision, null);
for (const file of [...receipt.files, receipt.checker, receipt.previousReview]) check(file);
check(receipt.production, git("show", `${receipt.implementation}:${receipt.production.path}`));
assert.equal(
  git("rev-parse", `${receipt.implementation}:${receipt.production.path}`).toString().trim(),
  receipt.production.blob,
);
for (const file of receipt.files.filter((file) => file.path !== receipt.production.path))
  check(file, git("show", `${receipt.freeze}:${file.path}`));
const prior = JSON.parse(read(receipt.previousReview.path));
for (const file of [...prior.files, ...prior.previousReceipts, prior.checker, ...prior.protected])
  check(file);
for (const file of prior.previousReceipts) {
  const historical = JSON.parse(read(file.path));
  check(historical.checker);
  for (const frozen of historical.files.slice(1)) check(frozen);
}
const partition = (text) => {
  const begin = text.indexOf("export function boundCausalityGraph("),
    end = text.indexOf("// Bug 预防：actor 名");
  assert.ok(begin > 0 && end > begin);
  return [text.slice(0, begin), text.slice(begin, end), text.slice(end)];
};
const archive = JSON.parse(read(receipt.archivePath));
const current = read(receipt.production.path).toString();
const old = git("show", `${receipt.baseline}:${receipt.production.path}`).toString();
const [header, , tail] = partition(current);
assert.equal(sha(header), archive.sourceHeaderSha256);
assert.equal(sha(tail), archive.sourceTailSha256);
const signature = (text) => {
  const start = text.indexOf("export function boundCausalityGraph(");
  return text.slice(start, text.indexOf("{", start) + 1);
};
assert.equal(signature(current), signature(old));
const ts = createRequire(import.meta.url)("typescript");
const strings = (text) => {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text),
    result = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan())
    if (
      kind === ts.SyntaxKind.StringLiteral ||
      kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral
    )
      result.push(scanner.getTokenText());
  return result;
};
assert.deepEqual(strings(current), strings(old), "runtime/import string tokens");
for (const path of receipt.historicalLoaders)
  assert.deepEqual(read(path), git("show", `${receipt.baseline}:${path}`));
const oldPin = JSON.parse(
  read("apps/cli/packages/core/test/create-workflow-graph-fold-baseline.json"),
).boundsSha256;
assert.equal(oldPin, archive.emittedSha256);
if (process.argv.includes("--emitted")) {
  for (const file of receipt.emitted) check(file);
  const [emittedHeader, , emittedTail] = partition(read(receipt.emitted[0].path).toString());
  assert.equal(sha(emittedHeader), archive.emittedHeaderSha256);
  assert.equal(sha(emittedTail), archive.emittedTailSha256);
  assert.equal(sha(emittedHeader + archive.owner + emittedTail), archive.emittedSha256);
  assert.equal(receipt.emitted[1].sha256, archive.declarationSha256);
  assert.notEqual(
    receipt.emitted[0].sha256,
    oldPin,
    "unchanged historical loader needs an aggregate migration decision",
  );
}
if (process.argv.includes("--logs"))
  for (const file of [...receipt.logs, ...receipt.preservedOriginalSccRedLogs])
    check(file, readFileSync(file.path));
if (process.argv.includes("--scope")) {
  const changed = git("diff", "--name-only", receipt.baseline)
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);
  assert.deepEqual(changed.sort(), [...receipt.scope].sort());
}
console.log(
  JSON.stringify({
    files: receipt.files.length,
    protectedPriorRecords:
      prior.files.length + prior.previousReceipts.length + prior.protected.length + 1,
    declarationAndHelperPreservation: true,
    runtimeStringsUnchanged: true,
    reconstructedBaseline: true,
    historicalLoaderPin: "preserved; aggregate migration pending",
    wholeFileRightsDecision: null,
  }),
);
