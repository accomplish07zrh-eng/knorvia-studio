import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import ts from "typescript";
import { repo, hash } from "./agent-runtime-fixture-20261003.mjs";
const read = (file) => fs.readFile(path.join(repo, file));
const manifestBytes = await read("docs/evidence/knorvia-agent-runtime-current-20261003.json");
assert.equal(
  hash(manifestBytes),
  "98c565b37e40e409b6ed3e0d67bef6192a5711d3c8cc12604006633d8bd5a9b2",
);
const manifest = JSON.parse(manifestBytes);
async function check(reader) {
  for (const r of Object.values(manifest.files))
    for (const e of Object.values(r)) assert.equal(hash(await reader(e.path)), e.sha256, e.path);
}
await check(read);
const selected = manifest.files["agent-runtime.ts"];
await assert.rejects(
  check((file) => (file === selected.compiled.path ? Buffer.from("Owned wrong") : read(file))),
  assert.AssertionError,
);
await assert.rejects(
  check((file) =>
    file === selected.declaration.path
      ? Promise.reject(Object.assign(new Error("Owned missing"), { code: "ENOENT" }))
      : read(file),
  ),
  (e) => e.code === "ENOENT",
);
const oldBytes = await read("apps/cli/packages/core/test/agent-runtime-baseline-20261003.json");
assert.equal(hash(oldBytes), "9f984bbe8006567a20894bfac07830c3cc04481bd6e872c9d6385518ef6e9a66");
const old = JSON.parse(oldBytes).files["agent-runtime.ts"];
for (const k of ["source", "compiled", "declaration"])
  assert.equal(hash(old[k]), old[k + "Sha256"]);
const parse = (text, kind = ts.ScriptKind.TS) =>
  ts.createSourceFile("x.ts", text, ts.ScriptTarget.Latest, true, kind);
function shape(n) {
  if (ts.isParenthesizedExpression(n)) return shape(n.expression);
  const children = [];
  ts.forEachChild(n, (c) => {
    children.push(shape(c));
  });
  return [n.kind, ts.isIdentifier(n) || ts.isLiteralExpression(n) ? n.text : null, children];
}
const original = parse(old.source),
  current = parse((await read(selected.source.path)).toString()),
  oldClass = original.statements.find(ts.isClassDeclaration),
  currentClass = current.statements.find(ts.isClassDeclaration);
assert.deepEqual(
  oldClass.members.filter(ts.isPropertyDeclaration).map(shape),
  currentClass.members.filter(ts.isPropertyDeclaration).map(shape),
);
const oldAPI = original.statements.find(ts.isInterfaceDeclaration),
  api = parse(
    (await read(manifest.files["agent-runtime-api.ts"].source.path)).toString(),
  ).statements.find(ts.isInterfaceDeclaration);
assert.deepEqual(oldAPI.members.map(shape), api.members.map(shape));
const docs = (members) => members.flatMap((m) => (m.jsDoc ?? []).map((d) => d.getText()));
assert.deepEqual(docs(oldAPI.members), docs(api.members));
assert.deepEqual(
  shape(parse(old.compiled, ts.ScriptKind.JS)),
  shape(parse((await read(selected.compiled.path)).toString(), ts.ScriptKind.JS)),
);
const freezeBytes = await read("docs/evidence/agent-runtime-checks-20261003/freeze.json");
assert.equal(hash(freezeBytes), "ab063d6398a1dc5c03d4aa1ef49381e9aff915eb41df62431ebd41f069f8245d");
for (const [file, expected] of Object.entries(JSON.parse(freezeBytes).files)) {
  let b = await read(file);
  if (file.endsWith("agent-runtime-fixture-20261003.mjs"))
    b = Buffer.from(b.toString().replace(hash(manifestBytes), "CURRENT_" + "PIN"));
  assert.equal(hash(b), expected, file);
}
const protectedBytes = await read("docs/evidence/agent-runtime-author-20261003/protected.json");
assert.equal(
  hash(protectedBytes),
  "6c5d35bccd5091362778b85f2d28606cc000bb37dcb25e42bf556e24019b20e1",
);
const protectedSources = JSON.parse(protectedBytes);
for (const [file, expected] of Object.entries(protectedSources))
  assert.equal(hash(await read(file)), expected, file);
const sealBytes = await read("docs/evidence/agent-runtime-author-20261003/draft-01/seal.json");
assert.equal(hash(sealBytes), "3f1f6605cef9eb6ec5a6de2a3723e7bcf287c2731ceecc66680d13f4a2cdb0d0");
const seal = JSON.parse(sealBytes);
for (const [file, expected] of Object.entries(seal.files))
  assert.equal(
    hash(await read("docs/evidence/agent-runtime-author-20261003/draft-01/" + file)),
    expected,
  );
console.log(
  JSON.stringify({
    currentPins: 6,
    wrongEmissionAndMissingDeclarationFailClosed: true,
    retainedFieldsAndDefaultsASTEqual: true,
    retainedPublicMemberASTEqual: true,
    retainedPublicJSDocBlocks: docs(oldAPI.members).length,
    wholeRuntimeJSASTEqualsPredecessor: true,
    originalityCreditFromRelocationOrASTEquality: 0,
    protectedSources: Object.keys(protectedSources).length,
    freezeEntries: Object.keys(JSON.parse(freezeBytes).files).length,
    sealedFiles: Object.keys(seal.files).length,
  }),
);
