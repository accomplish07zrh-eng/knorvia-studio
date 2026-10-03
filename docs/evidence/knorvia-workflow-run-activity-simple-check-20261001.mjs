// Read-only correction digest/scope check; root retains expression and rights decisions.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import ts from "typescript";
const root = fileURLToPath(new URL("../../", import.meta.url));
const exec = promisify(execFile);
const git = async (...args) => (await exec("git", args, { cwd: root, encoding: "buffer" })).stdout;
const read = (p) => readFile(new URL(`../../${p}`, import.meta.url));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const r = JSON.parse(
  await read("docs/evidence/knorvia-workflow-run-activity-simple-receipt-20261001.json"),
);
assert.equal(r.formatVersion, 1);
assert.equal(r.lane, "parallel/cli-tools-fast-20261001");
assert.equal(r.licenseDecision, null);
await git("merge-base", "--is-ancestor", r.baseline, r.production);
await git("merge-base", "--is-ancestor", r.production, "HEAD");
const priorBytes = await read(r.previousReceipt.path);
assert.equal(sha(priorBytes), r.previousReceipt.sha256);
assert.deepEqual(priorBytes, await git("show", `${r.baseline}:${r.previousReceipt.path}`));
const prior = JSON.parse(priorBytes),
  target = r.files[0].path;
for (const f of prior.files) {
  const bytes =
    f.path === target ? await git("show", `${r.baseline}:${f.path}`) : await read(f.path);
  assert.equal(sha(bytes), f.sha256, f.path);
}
for (const f of r.files) {
  const bytes = await read(f.path);
  assert.deepEqual([bytes.length, sha(bytes)], [f.bytes, f.sha256], f.path);
  assert.deepEqual(bytes, await git("show", `${r.production}:${f.path}`));
  assert.equal((await git("rev-parse", `${r.production}:${f.path}`)).toString().trim(), f.blob);
}
for (const command of [
  ["diff", "--name-only", r.baseline],
  ["ls-files", "--others", "--exclude-standard"],
])
  for (const p of (await git(...command)).toString().trim().split("\n").filter(Boolean))
    assert.ok(r.scope.includes(p), p);
for (const [name, count] of [
  ["source", 5],
  ["emitted", 5],
  ["consumers", 4],
])
  assert.deepEqual(
    [
      r.checks[name].tests,
      r.checks[name].pass,
      r.checks[name].fail,
      r.checks[name].cancelled,
      r.checks[name].skipped,
    ],
    [count, count, 0, 0, 0],
  );
for (const [name, c] of Object.entries(r.checks)) {
  assert.match(c.sha256, /^[a-f0-9]{64}$/u);
  assert.ok(Number.isSafeInteger(c.bytes));
  if (!("tests" in c)) assert.equal(c.pass, true);
  if (process.argv.includes("--logs")) {
    const bytes = await readFile(`${r.logPrefix}${name}.log`);
    assert.deepEqual([bytes.length, sha(bytes)], [c.bytes, c.sha256], name);
  }
}
const source = (await read(target)).toString();
let awaits = 0;
const walk = (n) => {
  if (ts.isAwaitExpression(n)) awaits++;
  ts.forEachChild(n, walk);
};
walk(ts.createSourceFile(target, source, ts.ScriptTarget.ESNext, true));
assert.equal(awaits, 0);
if (process.argv.includes("--emitted")) {
  for (const f of r.emitted) {
    const bytes = await read(f.path);
    assert.deepEqual([bytes.length, sha(bytes)], [f.bytes, f.sha256], f.path);
  }
  for (const f of prior.emitted.filter(
    (f) => !f.path.endsWith("/get-workflow-run-activity-program.js"),
  ))
    assert.equal(sha(await read(f.path)), f.sha256, f.path);
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      esModuleInterop: true,
    },
  }).outputText;
  assert.equal((await read(r.emitted[0].path)).toString(), compiled);
}
console.log(
  JSON.stringify({
    files: r.files.length,
    priorFilesChecked: prior.files.length,
    trackedChangesConfinedTo: r.scope,
    emittedChecked: process.argv.includes("--emitted"),
    logsChecked: process.argv.includes("--logs"),
    licenseDecision: null,
  }),
);
