import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const manifest = path.join(repo, "docs/evidence/knorvia-runtime-model-tools-current-20261003.json");
const hash = (b) => createHash("sha256").update(b).digest("hex");
async function select(reader = readFile) {
  const b = await reader(manifest);
  assert.equal(
    hash(b),
    "2a1e933bbe0972e1191365df848f5de1502b1a4903b9c6b7c930874b69fc50ae",
    "exact current artifact closure",
  );
  const files = JSON.parse(b).files;
  let count = 0;
  for (const entries of Object.values(files))
    for (const e of Object.values(entries)) {
      const p = path.join(repo, e.path);
      assert.equal(hash(await reader(p)), e.sha256, p);
      count++;
    }
  return { files, count };
}
const { files, count } = await select();
assert.equal(count, 15);
const compiled = path.join(repo, files["model-request"].compiled.path);
await assert.rejects(
  select((p) => (p === compiled ? Buffer.from("wrong owned artifact") : readFile(p))),
  (e) => e.code === "ERR_ASSERTION",
);
const declaration = path.join(repo, files["turn-tool-batch"].declaration.path);
await assert.rejects(
  select((p) => {
    if (p === declaration)
      throw Object.assign(new Error("Owned missing declaration"), { code: "ENOENT" });
    return readFile(p);
  }),
  (e) => e.code === "ENOENT",
);
console.log(
  JSON.stringify({
    currentArtifactMatches: count,
    wrongCompiledFailsClosed: true,
    missingDeclarationFailsClosed: true,
    realFilesModified: false,
  }),
);
