// Read-only scope/digest check. Independent expression and rights review remains root-owned.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import ts from "typescript";
const root = fileURLToPath(new URL("../../", import.meta.url));
const exec = promisify(execFile);
const git = async (...args) =>
  (await exec("git", args, { cwd: root, encoding: "buffer", maxBuffer: 2 ** 20 })).stdout;
const read = (p) => readFile(new URL(`../../${p}`, import.meta.url));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const blob = (b) => createHash("sha1").update(`blob ${b.length}\0`).update(b).digest("hex");
const r = JSON.parse(
  await read("docs/evidence/knorvia-workflow-run-activity-fast-receipt-20261001.json"),
);
assert.equal(r.formatVersion, 1);
assert.equal(r.lane, "parallel/cli-tools-fast-20261001");
assert.equal(r.licenseDecision, null);
for (const [a, b] of [
  [r.baseline, r.freeze],
  [r.freeze, r.production],
  [r.production, "HEAD"],
])
  await git("merge-base", "--is-ancestor", a, b);
const priors = [];
for (const p of r.previousReceipts) {
  const bytes = await read(p.path);
  assert.equal(sha(bytes), p.sha256, p.path);
  assert.deepEqual(await git("show", `${r.baseline}:${p.path}`), bytes);
  priors.push(JSON.parse(bytes));
}
const [assembly, clauses, orchestration] = priors;
const protectedPaths = new Set([
  ...assembly.protectedInputs.map((f) => f.path),
  ...assembly.allowedPaths,
  ...clauses.scope,
  ...orchestration.scope,
]);
const target = r.files[0].path;
protectedPaths.delete(target);
assert.equal(protectedPaths.size, r.protectedCount);
for (const p of protectedPaths)
  assert.equal(
    blob(await read(p)),
    (await git("rev-parse", `${r.baseline}:${p}`)).toString().trim(),
    p,
  );
assert.equal(r.files.length, 7);
const rows = [];
for (const f of r.files) {
  const bytes = await read(f.path);
  assert.deepEqual([bytes.length, sha(bytes), blob(bytes)], [f.bytes, f.sha256, f.blob], f.path);
  assert.equal((await git("rev-parse", `${r.production}:${f.path}`)).toString().trim(), f.blob);
  assert.equal(
    (await git("log", "-1", "--format=%H", r.production, "--", f.path)).toString().trim(),
    f.lastChange,
  );
  rows.push([f.path, f.blob, f.bytes, f.sha256, f.lastChange].join("\t"));
}
assert.equal(sha(`${rows.sort().join("\n")}\n`), r.filesTupleSha256);
const old = (await git("show", `${r.baseline}:${target}`)).toString();
const current = (await read(target)).toString();
const archive = JSON.parse(await read(r.archive));
assert.equal(archive.baseline, r.baseline);
assert.equal(archive.path, target);
assert.equal(sha(old), archive.sourceSha256);
assert.equal(blob(Buffer.from(old)), archive.sourceBlob);
assert.equal(sha(archive.compiled), archive.compiledSha256);
assert.equal(sha(archive.declaration), archive.declarationSha256);
const marker = "// ————————————————————————————————————————————————\n// <log_tail>";
const before = old.slice(old.indexOf("/** 列之间"), old.indexOf("function subagentActivityCell("));
const after = current.slice(current.indexOf("/** 列之间"), current.indexOf(marker));
assert.equal(
  after.replace(
    "renderWorkflowRunActivity(subagent, run.generatedAt, askedAtByQid)",
    "subagentActivityCell(subagent, run.generatedAt, askedAtByQid)",
  ),
  before,
);
assert.equal(current.slice(current.indexOf(marker)), old.slice(old.indexOf(marker)));
assert.equal(
  current.slice(0, current.indexOf("import type")),
  old.slice(0, old.indexOf("import type")),
);
const countAwaits = (source) => {
  let count = 0;
  const walk = (n) => {
    if (ts.isAwaitExpression(n)) count++;
    ts.forEachChild(n, walk);
  };
  walk(ts.createSourceFile("owned.ts", source, ts.ScriptTarget.ESNext, true));
  return count;
};
assert.equal(countAwaits(old), 0);
for (const f of r.files.filter((f) => f.path.includes("/src/")))
  assert.equal(countAwaits((await read(f.path)).toString()), 0);
for (const command of [
  ["diff", "--name-only", r.baseline],
  ["ls-files", "--others", "--exclude-standard"],
])
  for (const p of (await git(...command)).toString().trim().split("\n").filter(Boolean))
    assert.ok(r.scope.includes(p), p);
for (const [name, count] of [
  ["freeze-source", 5],
  ["freeze-emitted", 5],
  ["source", 5],
  ["emitted", 5],
  ["consumers", 4],
]) {
  const c = r.checks[name];
  assert.deepEqual([c.tests, c.pass, c.fail, c.cancelled, c.skipped], [count, count, 0, 0, 0]);
}
for (const [name, c] of Object.entries(r.checks)) {
  assert.match(c.sha256, /^[a-f0-9]{64}$/u);
  assert.ok(Number.isSafeInteger(c.bytes));
  if (!("tests" in c)) assert.equal(c.pass, true, name);
  if (process.argv.includes("--logs")) {
    const bytes = await readFile(`${r.logPrefix}${name}.log`);
    assert.equal(bytes.length, c.bytes, name);
    assert.equal(sha(bytes), c.sha256, name);
  }
}
const compiled = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      esModuleInterop: true,
    },
  }).outputText;
assert.equal(compiled(old), archive.compiled);
if (process.argv.includes("--emitted")) {
  for (const f of r.emitted) {
    const bytes = await read(f.path);
    assert.deepEqual([bytes.length, sha(bytes)], [f.bytes, f.sha256], f.path);
  }
  const replaced = new Set([
    "get-workflow-run.js",
    "get-workflow-run-summary.js",
    "get-workflow-run-format-roster.js",
  ]);
  const previous = [
    ...orchestration.emitted,
    ...clauses.emitted,
    ...assembly.emittedFiles.filter((f) => !replaced.has(f.path.split("/").at(-1))),
  ];
  for (const f of previous) assert.equal(sha(await read(f.path)), f.sha256, f.path);
  for (const f of r.files.filter((f) => f.path.includes("/src/")))
    assert.equal(
      (await read(f.path.replace("/src/", "/dist/").replace(/\.ts$/u, ".js"))).toString(),
      compiled((await read(f.path)).toString()),
      f.path,
    );
  assert.equal(
    (await read(target.replace("/src/", "/dist/").replace(/\.ts$/u, ".d.ts"))).toString(),
    archive.declaration,
  );
  assert.equal(
    sha(await read("apps/cli/packages/core/dist/tool/handlers/get-workflow-run-format.js")),
    archive.parentEmittedSha256,
  );
}
console.log(
  JSON.stringify({
    files: r.files.length,
    protected: protectedPaths.size,
    tuple: r.filesTupleSha256,
    emittedChecked: process.argv.includes("--emitted"),
    logsChecked: process.argv.includes("--logs"),
    licenseDecision: null,
  }),
);
