import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const repo = process.cwd();
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytes = await fs.readFile("docs/evidence/knorvia-runtime-permission-current-20261003.json");
const expected = "03dcdc43775b83950afaadcfbf75776f9e5df6ecb392859f31d9f45bd778c1e8";
assert.equal(hash(bytes), expected);
const manifest = JSON.parse(bytes);
let count = 0;
async function check(read) {
  for (const row of Object.values(manifest.files)) {
    for (const entry of Object.values(row)) {
      assert.equal(hash(await read(path.join(repo, entry.path))), entry.sha256, entry.path);
    }
  }
}
await check((file) => {
  count++;
  return fs.readFile(file);
});
const runner = manifest.files["permission-full-access.ts"];
await assert.rejects(
  check((file) =>
    file === path.join(repo, runner.compiled.path)
      ? Buffer.from("owned wrong artifact")
      : fs.readFile(file),
  ),
  assert.AssertionError,
);
await assert.rejects(
  check((file) =>
    file === path.join(repo, runner.declaration.path)
      ? Promise.reject(Object.assign(Error("owned missing"), { code: "ENOENT" }))
      : fs.readFile(file),
  ),
  (error) => error.code === "ENOENT",
);
console.log(
  JSON.stringify({
    manifestSha256: expected,
    currentMatches: count,
    wrongCompiledFailsClosed: true,
    missingDeclarationFailsClosed: true,
  }),
);
