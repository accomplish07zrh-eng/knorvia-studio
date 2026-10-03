import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createIndexes, classify } from "../../scripts/provenance/model.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");
const receiptPath = "docs/evidence/knorvia-cli-workflow-introspection-review-20261001.json";
const read = (name) => readFileSync(path.join(root, name));
const receipt = JSON.parse(read(receiptPath));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
// 固定清单超过子进程默认 1 MiB 输出上限；按已绑定输入长度读取，不改变断言或超时。
const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    maxBuffer: Math.max(1_048_576, ...receipt.inputs.map((input) => input.bytes)) + 1_024,
  });
const check = (record, bytes = read(record.path)) => {
  assert.equal(bytes.length, record.bytes, record.path);
  assert.equal(sha(bytes), record.sha256, record.path);
};

assert.equal(receipt.formatVersion, 1);
assert.equal(receipt.candidateStatus, "unresolved-retained-implementation");
assert.equal(receipt.recommendedReviewDecision, null);
assert.deepEqual(receipt.newProductionExpression, []);
assert.equal(receipt.attributionMustRemain, true);
assert.equal(receipt.sourceExposure, true);
assert.equal(receipt.publisherVerification, "committed manifest and local blob comparison only");
check(receipt.source);
check(receipt.document);
check(receipt.checker);
for (const record of receipt.inputs)
  check(record, git("show", `${receipt.baseline}:${record.path}`));
assert.equal(
  git("rev-parse", `${receipt.baseline}:${receipt.source.path}`).toString().trim(),
  receipt.source.blob,
);
assert.equal(
  git("rev-parse", `${receipt.initialCommit}:${receipt.source.path}`).toString().trim(),
  receipt.source.blob,
);
assert.deepEqual(
  git("show", `${receipt.initialCommit}:${receipt.source.path}`),
  read(receipt.source.path),
);
assert.deepEqual(
  git("log", "--format=%H", receipt.baseline, "--", receipt.source.path)
    .toString()
    .trim()
    .split("\n"),
  [receipt.initialCommit],
);

const baseline = JSON.parse(git("show", `${receipt.baseline}:licensing/upstream-baseline.json`));
const inventory = JSON.parse(git("show", `${receipt.baseline}:licensing/current-files.json`));
const reviews = JSON.parse(git("show", `${receipt.baseline}:licensing/reviews.json`));
const upstream = baseline.files.find((row) => row.path === receipt.upstream.path);
assert.equal(baseline.commit, receipt.upstream.commit);
assert.equal(upstream.blob, receipt.source.blob);
assert.equal(upstream.normalizedSha256, receipt.source.sha256);
assert.equal(upstream.bytes, receipt.source.bytes);
assert.equal(receipt.upstream.blob, upstream.blob);
assert.equal(receipt.upstream.normalizedSha256, upstream.normalizedSha256);
const current = inventory.files.find((row) => row.path === receipt.source.path);
assert.equal(current.classification, "upstream-unchanged");
assert.equal(current.review, null);
assert.equal(current.normalizedSha256, receipt.source.sha256);
assert.equal(
  reviews.files.some((row) => row.path === receipt.source.path),
  false,
);

const text = read(receipt.source.path).toString();
const lines = text.split("\n");
assert.equal(lines.pop(), "");
let next = 1;
for (const region of receipt.retainedRegions) {
  assert.equal(region.from, next);
  assert.ok(region.through >= region.from);
  assert.ok(region.material.trim());
  assert.equal(region.sha256, sha(lines.slice(region.from - 1, region.through).join("\n") + "\n"));
  next = region.through + 1;
}
assert.equal(next, lines.length + 1);
const parse = (name, contents) => ts.createSourceFile(name, contents, ts.ScriptTarget.Latest, true);
const tree = parse(receipt.source.path, text);
const exports = tree.statements.flatMap((node) => {
  if (ts.isExportDeclaration(node)) return node.exportClause.elements.map((item) => item.name.text);
  if (!node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return [];
  if (ts.isFunctionDeclaration(node)) return [node.name.text];
  if (ts.isVariableStatement(node))
    return node.declarationList.declarations.map((item) => item.name.text);
  return [];
});
assert.deepEqual(exports.sort(), [...receipt.publicExports].sort());
const importers = git(
  "grep",
  "-l",
  "-F",
  "./workflow-run-introspection.js",
  receipt.baseline,
  "--",
  "apps/cli/packages/core/src",
)
  .toString()
  .trim()
  .split("\n")
  .map((name) => name.slice(receipt.baseline.length + 1));
assert.deepEqual(importers.sort(), receipt.callers.map((caller) => caller.path).sort());
for (const caller of receipt.callers) {
  check(caller);
  check(caller.emitted);
  for (const name of [caller.path, caller.emitted.path]) {
    const imports = parse(name, read(name).toString()).statements.filter(
      (node) =>
        ts.isImportDeclaration(node) &&
        node.moduleSpecifier.text === "./workflow-run-introspection.js",
    );
    assert.equal(imports.length, 1, name);
    assert.deepEqual(
      imports[0].importClause.namedBindings.elements
        .map((item) => item.propertyName?.text ?? item.name.text)
        .sort(),
      [...caller.symbols].sort(),
      name,
    );
  }
}

const indexes = (entries = []) =>
  createIndexes({ ...baseline, files: [upstream] }, { schemaVersion: 1, files: entries }, {});
const entry = {
  path: receipt.source.path,
  normalizedSha256: receipt.source.sha256,
  decision: "original",
  license: "MIT",
  basis: "Synthetic conflict control",
  evidence: [receiptPath],
};
assert.equal(classify(current, indexes()).review, null);
for (const decision of ["original", "independent-replacement"]) {
  const result = classify(current, indexes([{ ...entry, decision }]));
  assert.equal(result.review.status, "conflict");
  assert.equal(result.license, "NOASSERTION");
}
assert.throws(
  () =>
    indexes([
      { ...entry, decision: "reviewed-retained", nature: "implementation", license: "NOASSERTION" },
    ]),
  /Invalid or duplicate provenance review/u,
);
assert.throws(() => indexes([{ ...entry, basis: " " }]), /Invalid or duplicate provenance review/u);
assert.equal(
  classify(current, indexes([{ ...entry, normalizedSha256: "0".repeat(64) }])).review.status,
  "stale",
);

if (process.argv.includes("--emitted")) {
  for (const record of receipt.emitted) check(record);
  const configPath = path.join(root, "apps/cli/packages/core/tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(configPath),
    {},
    configPath,
  );
  assert.deepEqual(parsed.errors, []);
  const absolute = path.join(root, receipt.source.path);
  const program = ts.createProgram({ rootNames: [absolute], options: parsed.options });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => root,
      getCanonicalFileName: (name) => name,
      getNewLine: () => "\n",
    }),
  );
  const compared = [];
  const result = program.emit(program.getSourceFile(absolute), (name, contents) => {
    const record = receipt.emitted.find((item) => path.join(root, item.path) === name);
    if (!record) {
      assert.equal(name, path.join(root, receipt.emitted[1].path + ".map"));
      return;
    }
    check(record, Buffer.from(contents));
    compared.push(record.path);
  });
  assert.equal(result.emitSkipped, false);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(compared.sort(), receipt.emitted.map((record) => record.path).sort());
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
if (process.argv.includes("--logs")) {
  for (const record of receipt.checks) check(record.log, readFileSync(record.log.path));
  for (const correction of receipt.evidenceCorrections)
    check(correction.log, readFileSync(correction.log.path));
}
console.log(
  JSON.stringify({
    retainedFiles: 1,
    retainedRegions: receipt.retainedRegions.length,
    publicExports: exports.length,
    sourceAndEmittedImporters: receipt.callers.length,
    schemaControls: 6,
    newProductionExpression: 0,
    reviewDecision: null,
    emitted: process.argv.includes("--emitted"),
    scope: process.argv.includes("--scope"),
  }),
);
