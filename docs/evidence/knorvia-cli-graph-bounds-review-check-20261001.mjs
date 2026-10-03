import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (name) => readFileSync(new URL(name, new URL("../../", import.meta.url)));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: root });
const ts = createRequire(import.meta.url)("typescript");
const evidence = JSON.parse(read("docs/evidence/knorvia-cli-graph-bounds-review-20261001.json"));
const check = (record, bytes = read(record.path)) => {
  assert.equal(bytes.length, record.bytes, record.path);
  assert.equal(sha(bytes), record.sha256, record.path);
};
assert.equal(evidence.formatVersion, 1);
assert.equal(evidence.sourceExposure, true);
assert.equal(evidence.implementationChange, false);
assert.equal(evidence.wholeFileRightsDecision, null);
assert.equal(ts.version, evidence.lexical.typescript);
for (const record of [
  ...evidence.files,
  ...evidence.protected,
  ...evidence.previousReceipts,
  evidence.reviewed,
  evidence.checker,
])
  check(record);
for (const record of evidence.files)
  check(record, git("show", `${evidence.freeze}:${record.path}`));
check(evidence.reviewed, git("show", `${evidence.baseline}:${evidence.reviewed.path}`));
assert.equal(
  git("rev-parse", `${evidence.baseline}:${evidence.reviewed.path}`).toString().trim(),
  evidence.reviewed.blob,
);
for (const record of evidence.previousReceipts) {
  const prior = JSON.parse(read(record.path));
  check(prior.checker);
  for (const frozen of prior.files.slice(1)) check(frozen);
}
const current = read(evidence.reviewed.path).toString();
for (const region of evidence.regions) {
  const bytes = Buffer.from(
    current
      .split(/(?<=\n)/u)
      .slice(region.firstLine - 1, region.lastLine)
      .join(""),
  );
  assert.equal(bytes.length, region.bytes);
  assert.equal(sha(bytes), region.sha256);
}
const fingerprint = (source) => {
  const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      true,
      ts.LanguageVariant.Standard,
      source,
    ),
    tokens = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan())
    tokens.push([kind, scanner.getTokenText()]);
  const trivia = ts.createScanner(
      ts.ScriptTarget.Latest,
      false,
      ts.LanguageVariant.Standard,
      source,
    ),
    comments = [];
  for (let kind = trivia.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = trivia.scan())
    if (
      kind === ts.SyntaxKind.SingleLineCommentTrivia ||
      kind === ts.SyntaxKind.MultiLineCommentTrivia
    )
      comments.push(trivia.getTokenText());
  return {
    sourceSha256: sha(source),
    tokens: tokens.length,
    tokenSha256: sha(JSON.stringify(tokens)),
    comments: comments.length,
    commentSha256: sha(JSON.stringify(comments)),
  };
};
assert.deepEqual(fingerprint(current), evidence.lexical.current);
assert.deepEqual(
  fingerprint(git("show", `${evidence.initial}:${evidence.reviewed.path}`).toString()),
  evidence.lexical.initial,
);
assert.equal(evidence.lexical.current.tokenSha256, evidence.lexical.initial.tokenSha256);
assert.equal(evidence.lexical.current.commentSha256, evidence.lexical.initial.commentSha256);
if (process.argv.includes("--emitted")) for (const record of evidence.emitted) check(record);
if (process.argv.includes("--logs"))
  for (const record of evidence.checks) {
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
        ...names("diff", "--name-only", evidence.baseline),
        ...names("ls-files", "--others", "--exclude-standard"),
      ]),
    ].sort(),
    [...evidence.scope].sort(),
  );
}
console.log(
  JSON.stringify({
    ownedFiles: evidence.scope.length,
    regions: evidence.regions.length,
    implementationChange: false,
    initialExpressionRetained: true,
    wholeFileRightsDecision: null,
  }),
);
