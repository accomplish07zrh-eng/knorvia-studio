import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { hash, repo } from "./mcp-config-fixture-20261003.mjs";
const read = (file) => fs.readFile(path.join(repo, file));
const bytes = await read("docs/evidence/knorvia-mcp-config-current-20261003.json");
assert.equal(hash(bytes), "c04d9319795fbb444a25315e4e21f7ce7bfc482bca492cd972b8989f04a45a45");
const manifest = JSON.parse(bytes);
async function check(reader) {
  for (const row of Object.values(manifest.files))
    for (const entry of Object.values(row))
      assert.equal(hash(await reader(entry.path)), entry.sha256, entry.path);
}
await check(read);
const selected = manifest.files["mcp.ts"];
await assert.rejects(
  check((file) =>
    file === selected.compiled.path ? Buffer.from("owned incorrect artifact") : read(file),
  ),
  assert.AssertionError,
);
await assert.rejects(
  check((file) =>
    file === selected.declaration.path
      ? Promise.reject(Object.assign(Error("owned missing"), { code: "ENOENT" }))
      : read(file),
  ),
  (error) => error.code === "ENOENT",
);
const old = await read("apps/cli/packages/core/test/mcp-config-baseline-20261003.json");
assert.equal(hash(old), "c62abf9d549977fcba1ec7b46174e74a8b6e727ef245cd8714b82cc708cffe0b");
for (const row of Object.values(JSON.parse(old).files))
  for (const kind of ["source", "compiled", "declaration"])
    assert.equal(hash(row[kind]), row[kind + "Sha256"]);
const protectedSources = JSON.parse(
  await read("docs/evidence/mcp-config-author-20261003/protected.json"),
);
for (const [file, expected] of Object.entries(protectedSources))
  assert.equal(hash(await read(file)), expected, file);
const priorCounts = {},
  paths = new Set();
for (const owner of [
  "steering-subagent",
  "runtime-tooling",
  "runtime-permission",
  "subagent-owners",
]) {
  const prior = JSON.parse(await read("docs/evidence/knorvia-" + owner + "-current-20261003.json"));
  let count = 0;
  for (const row of Object.values(prior.files))
    for (const entry of Object.values(row)) {
      assert.equal(hash(await read(entry.path)), entry.sha256, entry.path);
      count++;
      paths.add(entry.path);
    }
  priorCounts[owner] = count;
}
const root = "docs/evidence/mcp-config-author-20261003/draft-01/";
const sealBytes = await read(root + "SEAL.json");
assert.equal(hash(sealBytes), "b0245575456fac51d9b1ca7b638cad0123d01a1f332242f7f9d6c7f37ac9c59f");
const seal = JSON.parse(sealBytes);
const sums = await read(root + "SHA256SUMS");
assert.equal(hash(sums), seal.allFilesManifestSHA256);
let sealEntries = 0;
for (const line of sums.toString().trim().split("\n")) {
  const [expected, file] = line.split(/\s+/u);
  assert.equal(hash(await read(root + file)), expected, file);
  sealEntries++;
}
for (const [name, field] of [
  ["manifest.json", "manifestSHA256"],
  ["access.log", "accessLogSHA256"],
  ["packet-access-sha256.txt", "packetAccessSHA256"],
])
  assert.equal(hash(await read(root + name)), seal[field]);
for (const [group, prefix] of [
  ["initialSHA256", "initial"],
  ["finalSHA256", "final"],
])
  for (const [file, expected] of Object.entries(seal[group]))
    assert.equal(hash(await read(root + prefix + "/" + file)), expected);
console.log(
  JSON.stringify({
    currentPins: 6,
    wrongEmissionFailsClosed: true,
    missingDeclarationFailsClosed: true,
    unchangedHistoricalOracle: true,
    protectedSources: Object.keys(protectedSources).length,
    priorCounts,
    priorUniquePaths: paths.size,
    authorSealEntries: sealEntries,
    sessionModeFacadeUnchanged: true,
  }),
);
