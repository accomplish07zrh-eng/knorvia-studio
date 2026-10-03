// Read-only digest/scope/emission check; root retains all rights decisions.
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
  await read("docs/evidence/knorvia-get-workflow-run-orchestration-fast-receipt-20261001.json"),
);
assert.equal(r.formatVersion, 1);
assert.equal(r.lane, "parallel/cli-tools-fast-20261001");
assert.equal(r.licenseDecision, null);
for (const [a, b] of [
  [r.baseline, r.freeze],
  [r.freeze, r.regression.initialProduction],
  [r.regression.initialProduction, r.regression.proof],
  [r.regression.proof, r.production],
  [r.production, "HEAD"],
])
  await git("merge-base", "--is-ancestor", a, b);
assert.equal(r.regression.correction, r.production);
const priors = [];
for (const p of r.previousReceipts) {
  const bytes = await read(p.path);
  assert.equal(sha(bytes), p.sha256, p.path);
  assert.deepEqual(await git("show", `${r.baseline}:${p.path}`), bytes);
  priors.push(JSON.parse(bytes));
}
const [clauses, assembly] = priors;
assert.equal(clauses.previousReceipt.path, r.previousReceipts[1].path);
assert.equal(clauses.previousReceipt.sha256, r.previousReceipts[1].sha256);
const target = r.files[0].path;
const protectedPaths = new Set([
  ...assembly.protectedInputs.map((f) => f.path),
  ...assembly.allowedPaths,
  ...clauses.scope,
]);
protectedPaths.delete(target);
assert.equal(protectedPaths.size, r.protectedCount);
for (const p of protectedPaths)
  assert.equal(
    blob(await read(p)),
    (await git("rev-parse", `${r.baseline}:${p}`)).toString().trim(),
    p,
  );
assert.equal(r.files.length, 6);
const rows = [];
for (const f of r.files) {
  const bytes = await read(f.path);
  assert.equal(bytes.length, f.bytes, f.path);
  assert.equal(sha(bytes), f.sha256, f.path);
  assert.equal(blob(bytes), f.blob, f.path);
  assert.equal((await git("rev-parse", `${r.production}:${f.path}`)).toString().trim(), f.blob);
  assert.equal(
    (await git("log", "-1", "--format=%H", r.production, "--", f.path)).toString().trim(),
    f.lastChange,
  );
  rows.push([f.path, f.blob, f.bytes, f.sha256, f.lastChange].join("\t"));
}
assert.equal(sha(`${rows.sort().join("\n")}\n`), r.filesTupleSha256);
const old = (await git("show", `${r.baseline}:${target}`)).toString(),
  current = (await read(target)).toString();
for (const region of r.unchangedRegions) {
  const extract = (s, end) => s.slice(s.indexOf(region.start), end ? s.indexOf(end) : undefined);
  const pinned = extract(old, region.oldEnd ?? region.end);
  assert.equal(extract(current, region.end), pinned, region.start);
  assert.equal(sha(pinned), region.sha256);
}
const archive = JSON.parse(await read(r.lineage.archive));
assert.equal(archive.consumer.source, old);
assert.equal(sha(old), r.lineage.sourceSha256);
assert.equal(sha(archive.consumer.compiled), r.lineage.emittedSha256);
const countAwaits = (source) => {
  let count = 0;
  const walk = (node) => {
    if (ts.isAwaitExpression(node)) count++;
    ts.forEachChild(node, walk);
  };
  walk(ts.createSourceFile("owned.ts", source, ts.ScriptTarget.ESNext, true));
  return count;
};
assert.equal(countAwaits(old), 1);
assert.equal(countAwaits(current), 1);
assert.equal(countAwaits((await read(r.files[1].path)).toString()), 0);
for (const command of [
  ["diff", "--name-only", r.baseline],
  ["ls-files", "--others", "--exclude-standard"],
])
  for (const p of (await git(...command)).toString().trim().split("\n").filter(Boolean))
    assert.equal(r.scope.includes(p), true, p);
for (const [name, count] of [
  ["freeze-source", 2],
  ["freeze-emitted", 2],
  ["source", 8],
  ["emitted", 8],
  ["corrected-source", 9],
  ["corrected-emitted", 9],
  ["corrected-consumers", 10],
  ["corrected-consumers-emitted", 6],
]) {
  assert.equal(r.checks[name].tests, count);
  assert.equal(r.checks[name].pass, count);
  for (const k of ["fail", "cancelled", "skipped"]) assert.equal(r.checks[name][k], 0);
}
for (const name of ["field-write-red-source", "field-write-red-emitted"]) {
  const c = r.checks[name];
  assert.deepEqual([c.tests, c.pass, c.fail, c.cancelled, c.skipped], [3, 2, 1, 0, 0]);
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
if (process.argv.includes("--emitted")) {
  for (const f of r.emitted) {
    const bytes = await read(f.path);
    assert.equal(bytes.length, f.bytes, f.path);
    assert.equal(sha(bytes), f.sha256, f.path);
  }
  const previous = [
    ...clauses.emitted,
    ...assembly.emittedFiles.filter(
      (f) =>
        !f.path.endsWith("/get-workflow-run.js") &&
        !f.path.endsWith("/get-workflow-run-summary.js"),
    ),
  ];
  for (const f of previous) assert.equal(sha(await read(f.path)), f.sha256, f.path);
  for (const f of r.regression.initialEmitted) {
    const sourcePath = f.path.replace("/dist/", "/src/").replace(/\.js$/u, ".ts");
    const compiled = ts.transpileModule(
      (await git("show", `${r.regression.initialProduction}:${sourcePath}`)).toString(),
      {
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          esModuleInterop: true,
        },
      },
    ).outputText;
    assert.equal(Buffer.byteLength(compiled), f.bytes, f.path);
    assert.equal(sha(compiled), f.sha256, f.path);
  }
  for (const f of r.files.filter((f) => f.path.includes("/src/"))) {
    const actual = await read(f.path.replace("/src/", "/dist/").replace(/\.ts$/u, ".js"));
    const compiled = ts.transpileModule((await read(f.path)).toString(), {
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        esModuleInterop: true,
      },
    }).outputText;
    assert.equal(actual.toString(), compiled, f.path);
  }
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
