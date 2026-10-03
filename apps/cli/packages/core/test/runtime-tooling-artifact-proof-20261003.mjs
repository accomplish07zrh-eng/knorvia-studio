import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { hash, repo } from "./runtime-tooling-fixture-20261003.mjs";
const bytes = await fs.readFile(
  path.join(repo, "docs/evidence/knorvia-runtime-tooling-current-20261003.json"),
);
assert.equal(hash(bytes), "5716956ef8dbac4f8d6929e3b477a924d36912e80f10ab4b41c6e93c9c242086");
const manifest = JSON.parse(bytes);
async function check(read) {
  for (const row of Object.values(manifest.files))
    for (const entry of Object.values(row))
      assert.equal(hash(await read(path.join(repo, entry.path))), entry.sha256, entry.path);
}
await check((file) => fs.readFile(file));
const selected = manifest.files["runtime/helpers/runtime-tools.ts"];
await assert.rejects(
  check((file) =>
    file === path.join(repo, selected.compiled.path)
      ? Buffer.from("owned wrong emitted artifact")
      : fs.readFile(file),
  ),
  assert.AssertionError,
);
await assert.rejects(
  check((file) =>
    file === path.join(repo, selected.declaration.path)
      ? Promise.reject(Object.assign(Error("owned missing"), { code: "ENOENT" }))
      : fs.readFile(file),
  ),
  (error) => error.code === "ENOENT",
);
const protectedBytes = await fs.readFile(
  path.join(repo, "docs/evidence/runtime-tooling-protected-20261003.json"),
);
const protectedSources = JSON.parse(protectedBytes);
for (const [file, expected] of Object.entries(protectedSources))
  assert.equal(hash(await fs.readFile(path.join(repo, file))), expected, file);
const receipt = JSON.parse(
  await fs.readFile(
    path.join(repo, "docs/evidence/knorvia-runtime-permission-current-20261003.json"),
  ),
);
let priorArtifacts = 0;
for (const row of Object.values(receipt.files))
  for (const entry of Object.values(row)) {
    assert.equal(hash(await fs.readFile(path.join(repo, entry.path))), entry.sha256);
    priorArtifacts++;
  }
console.log(
  JSON.stringify({
    currentPins: Object.keys(manifest.files).length * 3,
    wrongEmissionFailsClosed: true,
    missingDeclarationFailsClosed: true,
    protectedSources: Object.keys(protectedSources).length,
    priorPermissionArtifactMatches: priorArtifacts,
  }),
);
