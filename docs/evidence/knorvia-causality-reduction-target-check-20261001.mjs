import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertDeclarationShape,
  inspectComments,
} from "../../apps/cli/packages/core/test/causality-reduction-documentation-proof.ts";
import { loadTargetBaseline } from "../../apps/cli/packages/core/test/causality-reduction-target-fixture.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (p) => readFileSync(path.join(root, p));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const receipt = JSON.parse(read("docs/evidence/knorvia-causality-reduction-target-20261001.json"));
const gitRead = (commit, p) => execFileSync("git", ["show", `${commit}:${p}`], { cwd: root });
for (const entry of [...receipt.files, ...receipt.emitted, ...receipt.logs]) {
  const bytes = path.isAbsolute(entry.path) ? readFileSync(entry.path) : read(entry.path);
  assert.equal(bytes.length, entry.bytes, entry.path);
  assert.equal(sha(bytes), entry.sha256, entry.path);
}
for (const p of receipt.unchanged) assert.deepEqual(read(p), gitRead(receipt.baseline, p), p);
for (const p of receipt.immutableFreeze) assert.deepEqual(read(p), gitRead(receipt.freeze, p), p);
const archive = await loadTargetBaseline();
assert.equal(archive.source, gitRead(receipt.baseline, receipt.owner).toString("utf8"));
const documentary = JSON.parse(
  read("docs/evidence/knorvia-causality-reduction-documentation-20261001.json"),
);
assert.equal(archive.sourceSha256, documentary.files[0].sha256);
assert.equal(archive.emittedSha256, documentary.emitted[0].sha256);
const source = read(receipt.owner).toString("utf8");
assert.deepEqual(inspectComments(source), inspectComments(archive.source));
assert.deepEqual(
  inspectComments(read(receipt.emitted[0].path).toString("utf8"), true),
  inspectComments(archive.compiled, true),
);
const declaration = read(receipt.emitted[1].path);
assert.equal(sha(declaration), documentary.emitted[1].sha256);
await assertDeclarationShape(
  declaration.toString("utf8"),
  "347f2cacda781da42d0b1d9b7a6857d316f63d65f001837986784676357f74e5",
);
const pins = JSON.parse(read("apps/cli/packages/core/test/causality-reduction-current.json"));
assert.equal(sha(read(receipt.owner)), pins.sourceSha256);
assert.equal(sha(read(receipt.emitted[0].path)), pins.emittedSha256);
assert.equal(sha(declaration), pins.declarationSha256);
for (const failure of receipt.preservedFailures)
  assert.equal(sha(readFileSync(failure.path)), failure.sha256);
const changes = execFileSync("git", ["diff", "--name-only", receipt.baseline], {
  cwd: root,
  encoding: "utf8",
}).trim();
for (const p of changes ? changes.split("\n") : []) assert.ok(receipt.scope.includes(p), p);
console.log(
  JSON.stringify({
    digests: receipt.files.length + receipt.emitted.length,
    logs: receipt.logs.length,
    frozen: receipt.immutableFreeze.length,
    historical: receipt.unchanged.length,
    currentPins: true,
    documentationUnchanged: true,
    outsideScopeUnchanged: true,
    ok: true,
  }),
);
