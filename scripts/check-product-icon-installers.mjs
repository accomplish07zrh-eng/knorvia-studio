import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { icoFrames, peIconFrames } from "./product-icon-package-check.mjs";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, process.argv[2] || "packages/desktop/dist");
const expected = icoFrames(await readFile(join(root, "packages/desktop/build/icon_installer.ico")));
const installers = (await readdir(dist)).filter((name) => name.endsWith(".exe"));
assert.ok(installers.length > 0, "No built Windows installers to inspect");
for (const name of installers) {
  const actual = peIconFrames(await readFile(join(dist, name)));
  for (const frame of expected)
    assert.ok(
      actual.some((candidate) => candidate.equals(frame)),
      `${name}: icon frame missing`,
    );
  console.log(`${name}: all ${expected.length} selected icon frames embedded`);
}
