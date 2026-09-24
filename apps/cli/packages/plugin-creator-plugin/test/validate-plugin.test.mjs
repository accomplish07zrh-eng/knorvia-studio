import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { scaffoldFiles } from "../skills/plugin-creator/scripts/scaffold-files.mjs";
import { validatePlugin } from "../skills/plugin-creator/scripts/validate-plugin.mjs";

test("local plugin preflight never invokes a PATH knorvia CLI implicitly", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "knorvia-plugin-preflight-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [file, content] of scaffoldFiles("sample-plugin", ["skills"])) {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  assert.deepEqual(await validatePlugin(root), { schemaValidated: false });
  await assert.rejects(validatePlugin(root, "knorvia"), /absolute Knorvia Studio CLI path/);
});
