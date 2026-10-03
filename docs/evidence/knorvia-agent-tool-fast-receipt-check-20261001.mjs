// Read-only receipt validation; no runtime child, notification, model or file-output effects.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = promisify(execFile);
const git = async (...args) => (await run("git", args, { cwd: root, encoding: "buffer" })).stdout;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const blobHash = (bytes) =>
  createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
const normalized = (bytes) => Buffer.from(bytes.toString("utf8").replace(/\r\n?/gu, "\n"));
const hex = (value, length) => assert.match(value, new RegExp(`^[a-f0-9]{${length}}$`));
const receipt = JSON.parse(
  await readFile(
    new URL("./knorvia-agent-tool-fast-checks-20261001.json", import.meta.url),
    "utf8",
  ),
);
assert.equal(receipt.formatVersion, 1);
assert.equal(receipt.lane, "parallel/cli-tools-fast-20261001");
assert.equal(receipt.kind, "Agent/Task source-exposed implementation receipt");
for (const commit of [
  receipt.baselineCommit,
  receipt.freezeCommit,
  receipt.productionCommit,
  receipt.verificationCommit,
])
  hex(commit, 40);
assert.equal(receipt.licenseDecision, null);
assert.equal(receipt.unresolvedMaterialObligations, 27);
assert.equal(receipt.checks.fullRegression.fail, 0);
assert.equal(receipt.checks.fullRegression.cancelled, 0);
assert.equal(receipt.checks.source.tests, 22);
assert.equal(receipt.checks.emitted.tests, 22);
assert.equal(receipt.frozen.projectionMatrix.comparisons, 512);

const unique = new Set();
for (const file of receipt.files) {
  assert.equal(unique.has(file.path), false);
  unique.add(file.path);
  assert.equal(file.commit, receipt.verificationCommit);
  assert.equal(file.licenseDecision, null);
  hex(file.blob, 40);
  hex(file.sha256, 64);
  hex(file.normalizedSha256, 64);
  const bytes = await readFile(new URL(`../../${file.path}`, import.meta.url));
  assert.equal(bytes.length, file.bytes, file.path);
  assert.equal(sha(bytes), file.sha256, file.path);
  assert.equal(sha(normalized(bytes)), file.normalizedSha256, file.path);
  const spec = `${file.commit}:${file.path}`;
  assert.equal((await git("rev-parse", spec)).toString().trim(), file.blob, file.path);
  assert.deepEqual(bytes, await git("show", spec), file.path);
  if (file.role === "production")
    assert.deepEqual(
      bytes,
      await git("show", `${receipt.productionCommit}:${file.path}`),
      file.path,
    );
}
const tuple =
  receipt.files
    .map((f) => [f.commit, f.path, f.blob, f.bytes, f.sha256, f.normalizedSha256].join("\t"))
    .sort()
    .join("\n") + "\n";
assert.equal(sha(tuple), receipt.filesTupleSha256);
for (const file of receipt.protectedInputs) {
  const bytes = await readFile(new URL(`../../${file.path}`, import.meta.url));
  assert.equal(sha(bytes), file.sha256, file.path);
  const baselineBlob = (await git("rev-parse", `${receipt.baselineCommit}:${file.path}`))
    .toString()
    .trim();
  assert.equal(file.blob, baselineBlob, file.path);
  assert.equal(blobHash(bytes), baselineBlob, file.path);
}
for (const file of receipt.checks.coreLint.unchangedFiles) {
  const bytes = await readFile(new URL(`../../${file.path}`, import.meta.url));
  assert.equal(sha(bytes), file.sha256, file.path);
  assert.deepEqual(bytes, await git("show", `${receipt.baselineCommit}:${file.path}`), file.path);
}
const allowed = new Set(receipt.allowedPaths);
for (const file of unique) assert.equal(allowed.has(file), true);
const changed = (await git("diff", "--name-only", receipt.baselineCommit))
  .toString()
  .trim()
  .split("\n")
  .filter(Boolean);
const untracked = (await git("ls-files", "--others", "--exclude-standard"))
  .toString()
  .trim()
  .split("\n")
  .filter(Boolean);
for (const path of [...changed, ...untracked]) assert.equal(allowed.has(path), true, path);

const handler = "apps/cli/packages/core/src/tool/handlers/agent.ts";
const old = (await git("show", `${receipt.baselineCommit}:${handler}`)).toString();
const current = await readFile(new URL(`../../${handler}`, import.meta.url), "utf8");
for (const region of receipt.retainedRegions) {
  const extract = (source, end) =>
    source.slice(source.indexOf(region.start), end ? source.indexOf(end) : undefined).trim();
  let baseline = extract(old, region.baselineEnd);
  if (region.name === "declaration")
    baseline = baseline
      .replace("handler: agentHandler", "handler: invokeAgent")
      .replace(
        "formatModelContent: formatAgentOutputForModel",
        "formatModelContent: projectAgentModelContent",
      );
  const now = extract(current, region.currentEnd);
  assert.equal(now, baseline, region.name);
  assert.equal(sha(now), region.sha256, region.name);
}
const golden = await readFile(new URL(`../../${receipt.frozen.path}`, import.meta.url));
assert.equal(sha(golden), receipt.frozen.sha256);
assert.deepEqual(golden, await git("show", `${receipt.freezeCommit}:${receipt.frozen.path}`));
const data = JSON.parse(golden);
assert.equal(data.direct.length, 40);
assert.equal(data.getters.length, 20);
assert.equal(data.formatting.length, 24);
assert.equal(data.executor.length, 11);
assert.equal(data.permissions.length, 40);
assert.equal(data.descriptions.length, 12);
assert.deepEqual(data.projectionMatrix, receipt.frozen.projectionMatrix);
if (process.argv.includes("--emitted")) {
  for (const file of receipt.emittedFiles) {
    const bytes = await readFile(new URL(`../../${file.path}`, import.meta.url));
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(sha(bytes), file.sha256, file.path);
  }
  assert.equal(
    await readFile(
      new URL("../../apps/cli/packages/core/dist/tool/handlers/agent.d.ts", import.meta.url),
      "utf8",
    ),
    data.publicDeclaration,
  );
}
console.log(
  JSON.stringify({
    files: unique.size,
    protectedInputs: receipt.protectedInputs.length,
    unchangedLintInputs: receipt.checks.coreLint.unchangedFiles.length,
    changedPaths: changed.length,
    tupleSha256: receipt.filesTupleSha256,
    emittedChecked: process.argv.includes("--emitted"),
    licenseDecision: null,
  }),
);
