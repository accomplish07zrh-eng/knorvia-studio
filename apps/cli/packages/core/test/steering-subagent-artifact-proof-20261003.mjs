import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { hash, repo } from "./steering-subagent-fixture-20261003.mjs";

const evidence = "docs/evidence/";
const read = (file) => fs.readFile(path.join(repo, file));
const manifestBytes = await read(evidence + "knorvia-steering-subagent-current-20261003.json");
assert.equal(
  hash(manifestBytes),
  "ee7919ddfb7cc62e7a6c68e0baa55c2c400a1f785d9471e13bd0348b103ba960",
);
const manifest = JSON.parse(manifestBytes);
async function check(reader) {
  for (const row of Object.values(manifest.files))
    for (const entry of Object.values(row))
      assert.equal(hash(await reader(entry.path)), entry.sha256, entry.path);
}
await check(read);
const selected = manifest.files["subagent.ts"];
await assert.rejects(
  check((file) =>
    file === selected.compiled.path ? Buffer.from("owned wrong emitted artifact") : read(file),
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
const oldBytes = await read("apps/cli/packages/core/test/steering-subagent-baseline-20261003.json");
assert.equal(hash(oldBytes), "ca03acb0d6b1510c32235ddc78921e27ef74bff19dba54e0bd3eab246b131151");
const old = JSON.parse(oldBytes);
for (const [name, row] of Object.entries(old.files)) {
  for (const kind of ["source", "compiled", "declaration"])
    assert.equal(hash(row[kind]), row[kind + "Sha256"]);
  assert.notEqual(manifest.files[name].compiled.sha256, row.compiledSha256);
}
const protectedSources = JSON.parse(
  await read(evidence + "steering-subagent-protected-20261003.json"),
);
for (const [file, expected] of Object.entries(protectedSources))
  assert.equal(hash(await read(file)), expected, file);
const priorCounts = {};
const priorPaths = new Set();
for (const name of ["runtime-tooling", "runtime-permission", "subagent-owners"]) {
  const prior = JSON.parse(await read(evidence + "knorvia-" + name + "-current-20261003.json"));
  let count = 0;
  for (const row of Object.values(prior.files))
    for (const entry of Object.values(row)) {
      assert.equal(hash(await read(entry.path)), entry.sha256, entry.path);
      priorPaths.add(entry.path);
      count++;
    }
  priorCounts[name] = count;
}
const authorRoot = evidence + "steering-subagent-author-20261003/";
let sealedFiles = 0;
for (const owner of ["steering", "subagent"]) {
  const base = authorRoot + owner + "/draft-01/";
  const seal = JSON.parse(await read(base + "seal.json"));
  if (owner === "steering") {
    for (const [file, expected] of Object.entries(seal.packet_sha256)) {
      assert.equal(hash(await read(path.relative(repo, file))), expected);
      sealedFiles++;
    }
    for (const group of [seal.initial_draft_sha256, seal.final_draft_sha256])
      for (const [file, expected] of Object.entries(group)) {
        assert.equal(hash(await read(base + file)), expected);
        sealedFiles++;
      }
    assert.equal(hash(await read(base + "access-log.json")), seal.access_log_sha256);
    sealedFiles++;
  } else {
    for (const entry of seal.packetInputs) {
      assert.equal(hash(await read(path.relative(repo, entry.path))), entry.sha256);
      sealedFiles++;
    }
    for (const entry of seal.draftAndAuditFiles) {
      const bytes = await read(base + entry.path);
      assert.equal(hash(bytes), entry.sha256);
      assert.equal(bytes.length, entry.bytes);
      sealedFiles++;
    }
  }
}
console.log(
  JSON.stringify({
    currentPins: Object.keys(manifest.files).length * 3,
    wrongEmissionFailsClosed: true,
    missingDeclarationFailsClosed: true,
    unchangedHistoricalOracle: true,
    currentEntriesDifferFromOracle: 2,
    protectedSources: Object.keys(protectedSources).length,
    priorCounts,
    priorUniquePaths: priorPaths.size,
    authorSealMatches: sealedFiles,
  }),
);
