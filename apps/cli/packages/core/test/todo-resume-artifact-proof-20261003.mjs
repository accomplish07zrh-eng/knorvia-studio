import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import ts from "typescript";
import { hash, repo } from "./todo-resume-fixture-20261003.mjs";
const read = (file) => fs.readFile(path.join(repo, file));
const bytes = await read("docs/evidence/knorvia-todo-resume-current-20261003.json");
assert.equal(hash(bytes), "2d5d04b499c6d6aaaded5b43d27d8627f9ad03c03c6bf561091cb8d90ec7e7eb");
const manifest = JSON.parse(bytes);
async function check(reader) {
  for (const row of Object.values(manifest.files))
    for (const kind of ["source", "compiled", "declaration"]) {
      const entry = row[kind];
      assert.equal(hash(await reader(entry.path)), entry.sha256, entry.path);
    }
}
await check(read);
const selected = manifest.files["todo.ts"];
await assert.rejects(
  check((file) =>
    file === selected.compiled.path ? Buffer.from("Owned wrong artifact") : read(file),
  ),
  assert.AssertionError,
);
await assert.rejects(
  check((file) =>
    file === selected.declaration.path
      ? Promise.reject(Object.assign(Error("Owned missing"), { code: "ENOENT" }))
      : read(file),
  ),
  (error) => error.code === "ENOENT",
);
const freezeBytes = await read("docs/evidence/todo-resume-checks-20261003/freeze.json");
assert.equal(hash(freezeBytes), "eec79d06249deacd95e6fdd72b1d23a331485fd47e26ef35a5942d5389bf95f8");
const freeze = JSON.parse(freezeBytes);
for (const [file, expected] of Object.entries(freeze.files)) {
  let b = await read(file);
  if (file.endsWith("todo-resume-fixture-20261003.mjs"))
    b = Buffer.from(b.toString().replace(hash(bytes), "CURRENT_" + "PIN"));
  assert.equal(hash(b), expected, file);
}
const protectedBytes = await read("docs/evidence/todo-resume-author-20261003/protected.json");
assert.equal(
  hash(protectedBytes),
  "7558f9524bbf18598ef7256288b4bfdc7cf2f572a2446d919e9f0a74d1b0dc02",
);
const protectedSources = JSON.parse(protectedBytes);
for (const [file, expected] of Object.entries(protectedSources))
  assert.equal(hash(await read(file)), expected, file);
const previous = {},
  unique = new Set();
for (const owner of [
  "mcp-config",
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
      unique.add(entry.path);
    }
  previous[owner] = count;
}
const root = "docs/evidence/todo-resume-author-20261003/draft-01/";
const sealBytes = await read(root + "seal.json");
assert.equal(hash(sealBytes), "980b9752b407ce46728001adcd2c6c2f7f33135187707297a4f23e45cf48e428");
const seal = JSON.parse(sealBytes);
for (const [file, expected] of Object.entries(seal.files))
  assert.equal(hash(await read(root + file)), expected, file);
const focusedBytes = await read("docs/evidence/todo-resume-checks-20261003/focused-freeze.json");
assert.equal(
  hash(focusedBytes),
  "99ed090715f063de60e2af19659834a45e3f5e8dc2339304fd051aa68ac77f17",
);
for (const [file, expected] of Object.entries(JSON.parse(focusedBytes).files)) {
  const selected = file.endsWith("todo-resume-focused-proof-20261003.mjs")
    ? "docs/evidence/todo-resume-checks-20261003/focused-proof-before-format.mjs.txt"
    : file;
  assert.equal(hash(await read(selected)), expected, selected);
}
function shape(node) {
  if (ts.isParenthesizedExpression(node)) return shape(node.expression);
  const children = [];
  ts.forEachChild(node, (child) => {
    children.push(shape(child));
  });
  return [
    node.kind,
    ts.isIdentifier(node) || ts.isLiteralExpression(node) ? node.text : null,
    children,
  ];
}
const parse = (text) =>
  shape(ts.createSourceFile("proof.js", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS));
assert.deepEqual(
  parse(
    (
      await read("docs/evidence/todo-resume-checks-20261003/focused-proof-before-format.mjs.txt")
    ).toString(),
  ),
  parse(
    (await read("apps/cli/packages/core/test/todo-resume-focused-proof-20261003.mjs")).toString(),
  ),
);
console.log(
  JSON.stringify({
    currentPins: Object.keys(manifest.files).length * 3,
    wrongEmissionFailsClosed: true,
    missingDeclarationFailsClosed: true,
    freezeEntries: Object.keys(freeze.files).length,
    protectedSources: Object.keys(protectedSources).length,
    previous,
    previousUniquePaths: unique.size,
    authorSealFiles: Object.keys(seal.files).length,
    unchangedHistoricalSourceCompiledDeclaration: true,
    unchangedFrozenAssertions: true,
  }),
);
