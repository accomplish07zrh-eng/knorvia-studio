import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syntaxDigest } from "../../apps/cli/packages/core/test/causality-reduction-documentation-proof.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (p) => readFileSync(path.join(root, p));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const receipt = JSON.parse(read("docs/evidence/knorvia-causality-lane-facts-20261001.json"));
for (const item of [...receipt.files, ...receipt.emitted, ...receipt.protected]) {
  assert.equal(sha(read(item.path)), item.sha256, item.path);
  assert.equal(read(item.path).length, item.bytes, item.path);
}
const old = (p) =>
  execFileSync("git", ["show", `${receipt.baseline}:${p}`], { cwd: root }).toString("utf8");
const ts = createRequire(path.join(root, "package.json"))("typescript");
const parse = (text, js = false) =>
  ts.createSourceFile(
    js ? "owned.js" : "owned.ts",
    text,
    ts.ScriptTarget.Latest,
    true,
    js ? ts.ScriptKind.JS : ts.ScriptKind.TS,
  );
const fn = (text, name, js = false) =>
  parse(text, js)
    .statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name)
    ?.getText();
const current = read(receipt.owner).toString("utf8"),
  previous = old(receipt.owner);
assert.equal(fn(current, "expandMaySetLanes"), fn(previous, "expandMaySetLanes"));
assert.equal(fn(current, "weakest"), fn(previous, "weakest"));
assert.equal(sha(read(receipt.emitted[1].path)), receipt.declarationSha256);
const publisher = execFileSync("git", ["cat-file", "blob", receipt.upstream.blob], { cwd: root })
  .toString("utf8")
  .replace(/\r\n/gu, "\n");
assert.equal(sha(publisher), receipt.upstream.normalizedSha256);
assert.equal(fn(current, "weakest"), fn(publisher, "weakest"));
for (const p of receipt.immutableFreeze)
  assert.equal(
    read(p).toString("utf8"),
    execFileSync("git", ["show", `${receipt.freeze}:${p}`], { cwd: root, encoding: "utf8" }),
    p,
  );
const archive = JSON.parse(
  read("apps/cli/packages/core/test/may-set-lane-expansion-baseline.json"),
);
const nodes = (text, spread) => {
  const file = parse(text, true),
    found = [];
  const visit = (node) => {
    if (
      ts.isObjectLiteralExpression(node) &&
      node.properties.some((p) => ts.isSpreadAssignment(p) && p.expression.getText(file) === spread)
    )
      found.push(node.getText(file));
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.equal(found.length, 1);
  return found[0];
};
const js = read(receipt.emitted[0].path).toString("utf8");
for (const spread of ["edge", "step", "fact"])
  assert.equal(
    syntaxDigest(`const clone = ${nodes(js, spread)};`, true),
    syntaxDigest(`const clone = ${nodes(archive.compiled, spread)};`, true),
    spread,
  );
for (const p of execFileSync("git", ["diff", "--name-only", receipt.baseline], {
  cwd: root,
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean))
  assert.ok(receipt.scope.includes(p), p);
if (process.argv.includes("--local-logs"))
  for (const log of receipt.logs) assert.equal(sha(readFileSync(log.path)), log.sha256, log.path);
console.log(
  JSON.stringify({
    ok: true,
    digests: receipt.files.length + receipt.emitted.length,
    protected: receipt.protected.length,
    frozen: receipt.immutableFreeze.length,
    publisherCloneExpressions: 3,
    weakestExact: true,
    expansionUnchanged: true,
  }),
);
