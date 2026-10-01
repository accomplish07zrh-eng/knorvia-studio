// Read-only clause receipt verification; no licence grant or inventory mutation.
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
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const blob = (bytes) =>
  createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
const receiptPath = "docs/evidence/knorvia-workflow-run-summary-clauses-fast-receipt-20261001.json";
const r = JSON.parse(await read(receiptPath));
assert.equal(r.formatVersion, 1);
assert.equal(r.lane, "parallel/cli-tools-fast-20261001");
assert.equal(r.licenseDecision, null);
for (const [before, after] of [
  [r.baseline, r.freeze],
  [r.freeze, r.production],
  [r.production, "HEAD"],
])
  await git("merge-base", "--is-ancestor", before, after);
assert.equal(sha(await read(r.previousReceipt.path)), r.previousReceipt.sha256);
const previous = JSON.parse(await read(r.previousReceipt.path));
assert.equal(
  (await git("show", `${r.baseline}:${r.previousReceipt.path}`)).toString(),
  (await read(r.previousReceipt.path)).toString(),
);
assert.equal(r.files.length, 4);
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
const target = r.unchangedAssembly.path;
const protectedPaths = new Set([
  ...previous.protectedInputs.map((f) => f.path),
  ...previous.allowedPaths,
]);
protectedPaths.delete(target);
for (const path of protectedPaths)
  assert.equal(
    blob(await read(path)),
    (await git("rev-parse", `${r.baseline}:${path}`)).toString().trim(),
    path,
  );
const region = r.unchangedAssembly;
const extract = (s) => s.slice(s.indexOf(region.start), s.indexOf(region.end)).trim();
const old = (await git("show", `${r.baseline}:${target}`)).toString(),
  current = (await read(target)).toString();
assert.equal(extract(old), extract(current));
assert.equal(sha(extract(current)), region.sha256);
const changed = (await git("diff", "--name-only", r.baseline))
  .toString()
  .trim()
  .split("\n")
  .filter(Boolean);
const untracked = (await git("ls-files", "--others", "--exclude-standard"))
  .toString()
  .trim()
  .split("\n")
  .filter(Boolean);
for (const path of [...changed, ...untracked]) assert.equal(r.scope.includes(path), true, path);
for (const [name, count] of [
  ["source", 10],
  ["emitted", 10],
  ["consumers", 10],
  ["freeze-source", 2],
  ["freeze-emitted", 2],
]) {
  const c = r.checks[name];
  assert.equal(c.tests, count);
  assert.equal(c.pass, count);
  for (const key of ["fail", "skipped", "cancelled"]) assert.equal(c[key], 0);
}
for (const [name, c] of Object.entries(r.checks)) {
  if (!("tests" in c)) assert.equal(c.pass, name !== "refs", name);
  assert.match(c.sha256, /^[a-f0-9]{64}$/u);
  assert.ok(Number.isSafeInteger(c.bytes));
  if (process.argv.includes("--logs")) {
    const bytes = await readFile(`${r.logPrefix}${name}.log`);
    assert.equal(bytes.length, c.bytes, name);
    assert.equal(sha(bytes), c.sha256, name);
    if (name.startsWith("native-")) {
      const fact = JSON.parse(bytes);
      assert.deepEqual(fact.current, fact.old);
      assert.equal(fact.old.name, "RangeError");
    }
  }
}
if (process.argv.includes("--emitted")) {
  for (const f of r.emitted) {
    const bytes = await read(f.path);
    assert.equal(bytes.length, f.bytes);
    assert.equal(sha(bytes), f.sha256, f.path);
  }
  for (const f of previous.emittedFiles.filter(
    (f) => !f.path.endsWith("/get-workflow-run-summary.js"),
  ))
    assert.equal(sha(await read(f.path)), f.sha256, f.path);
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
