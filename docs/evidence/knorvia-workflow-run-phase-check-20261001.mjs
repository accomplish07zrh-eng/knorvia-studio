// Read-only phase checkpoint check; root owns expression and rights decisions.
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
const compiled = (s) =>
  ts.transpileModule(s, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      esModuleInterop: true,
    },
  }).outputText;
const r = JSON.parse(await read("docs/evidence/knorvia-workflow-run-phase-receipt-20261001.json"));
assert.equal(r.formatVersion, 1);
assert.equal(r.lane, "parallel/cli-tools-fast-20261001");
assert.equal(r.licenseDecision, null);
for (const [a, b] of [
  [r.baseline, r.freeze],
  [r.freeze, r.appendedFreeze],
  [r.appendedFreeze, r.regression.initialProduction],
  [r.regression.initialProduction, r.regression.proof],
  [r.regression.proof, r.production],
  [r.production, "HEAD"],
])
  await git("merge-base", "--is-ancestor", a, b);
const priorBytes = await read(r.previousReceipt.path),
  prior = JSON.parse(priorBytes);
assert.equal(sha(priorBytes), r.previousReceipt.sha256);
assert.deepEqual(priorBytes, await git("show", `${r.baseline}:${r.previousReceipt.path}`));
for (const f of prior.files) assert.equal(sha(await read(f.path)), f.sha256, f.path);
const originalBytes = await read(prior.previousReceipt.path),
  original = JSON.parse(originalBytes);
assert.equal(sha(originalBytes), prior.previousReceipt.sha256);
assert.deepEqual(originalBytes, await git("show", `${r.baseline}:${prior.previousReceipt.path}`));
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
const target = r.files[0].path,
  old = (await git("show", `${r.baseline}:${target}`)).toString(),
  current = (await read(target)).toString();
const gold = JSON.parse(await read(r.contract)),
  frozen = JSON.parse(await git("show", `${r.freeze}:${r.contract}`));
for (const [k, v] of Object.entries(frozen)) assert.deepEqual(gold[k], v, k);
assert.deepEqual(
  [gold.direct.length, gold.appendedWidth.length, gold.consumers.length, gold.edges.length],
  [29, 3, 3, 2],
);
assert.equal(sha(old), gold.sourceSha256);
assert.equal(sha(compiled(old)), gold.emittedSha256);
const archiveBytes = await read(gold.archive),
  archive = JSON.parse(archiveBytes);
assert.equal(sha(archiveBytes), gold.archiveSha256);
const phase = (s) => s.slice(s.indexOf("// <phases>"), s.indexOf("// <subagents>"));
assert.equal(phase(compiled(old)), phase(archive.compiled));
assert.equal(sha(phase(compiled(old))), gold.phaseRegionSha256);
const layout = (s) => s.slice(s.indexOf("/** 列之间"), s.indexOf("// <health>"));
assert.equal(layout(compiled(old)), layout(archive.compiled));
const prefix = (s) => s.slice(0, s.indexOf("  const lines = phases.map("));
assert.equal(prefix(current).replaceAll("phaseColumnWidth(", "columnWidth("), prefix(old));
const suffix = (s) => s.slice(s.indexOf("// <subagents>"));
assert.equal(suffix(current), suffix(old));
let awaits = 0;
const walk = (n) => {
  if (ts.isAwaitExpression(n)) awaits++;
  ts.forEachChild(n, walk);
};
walk(ts.createSourceFile(target, current, ts.ScriptTarget.ESNext, true));
assert.equal(awaits, 0);
for (const [name, count] of [
  ["freeze-source", 4],
  ["freeze-emitted", 4],
  ["initial-row-source", 9],
  ["initial-row-emitted", 9],
  ["pre-native-source", 10],
  ["pre-native-emitted", 10],
  ["source", 11],
  ["emitted", 11],
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
for (const name of ["native-red-source", "native-red-emitted"])
  assert.deepEqual(
    [
      r.checks[name].tests,
      r.checks[name].pass,
      r.checks[name].fail,
      r.checks[name].cancelled,
      r.checks[name].skipped,
    ],
    [1, 0, 1, 0, 0],
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
if (process.argv.includes("--logs")) {
  const bytes = await readFile(r.evidenceCorrection.log);
  assert.deepEqual(
    [bytes.length, sha(bytes), r.evidenceCorrection.exitCode],
    [r.evidenceCorrection.bytes, r.evidenceCorrection.sha256, 1],
  );
}
if (process.argv.includes("--emitted")) {
  const initial = compiled(
    (await git("show", `${r.regression.initialProduction}:${target}`)).toString(),
  );
  assert.deepEqual(
    [Buffer.byteLength(initial), sha(initial)],
    [r.regression.initialEmitted.bytes, r.regression.initialEmitted.sha256],
  );
  for (const f of r.emitted) {
    const bytes = await read(f.path);
    assert.deepEqual([bytes.length, sha(bytes)], [f.bytes, f.sha256], f.path);
  }
  for (const f of prior.emitted) assert.equal(sha(await read(f.path)), f.sha256, f.path);
  const declaration = original.emitted.find((f) =>
    f.path.endsWith("/get-workflow-run-format-roster.d.ts"),
  );
  assert.equal(sha(await read(declaration.path)), declaration.sha256);
  assert.equal((await read(r.emitted[0].path)).toString(), compiled(current));
}
console.log(
  JSON.stringify({
    files: r.files.length,
    originalPhaseObservations: 29,
    appendedWidth: 3,
    priorReceiptsUnchanged: true,
    scopeChecked: true,
    emittedChecked: process.argv.includes("--emitted"),
    logsChecked: process.argv.includes("--logs"),
    licenseDecision: null,
  }),
);
