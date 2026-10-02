import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (url: URL) => readFile(url, "utf8");
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
export const surface =
  process.env.KNORVIA_COLLECTION_PLANNER_TEST_EMITTED === "1" ? "emitted" : "source";
const folder = surface === "source" ? "src" : "dist";
const extension = surface === "source" ? "ts" : "js";
export async function loadHistorical(reader = read) {
  const text = await reader(new URL("./workflow-planner-expansion-baseline.json", import.meta.url));
  assert.equal(sha(text), "6b3a7d1ef9a4dd1ceeec287f68c45a035065b7b8907e27125ed207732f6fba49");
  const value = JSON.parse(text);
  assert.equal(sha(value.source), value.sourceSha256);
  assert.equal(sha(value.compiled), value.emittedSha256);
  assert.equal(sha(value.declaration), value.declarationSha256);
  return value;
}
export const archive = await loadHistorical();
const text = await read(new URL("./workflow-planner-expansion-current.json", import.meta.url));
assert.equal(sha(text), "dbd3a5981a8d996c82f9756f778ef023ba2a530f66a5abe75ed7cb8be3e57e91");
const pins: { files: Record<string, string> } = JSON.parse(text);
export async function loadCurrent(reader = read) {
  for (const [path, digest] of Object.entries(pins.files))
    assert.equal(sha(await reader(new URL(path, root))), digest, path);
  return import(
    new URL(`${folder}/workflow/scheduler/planner-expansion.${extension}`, root).href
  ) as Promise<typeof import("../src/workflow/scheduler/planner-expansion.js")>;
}
export const current = await loadCurrent();
export const actual = await import(
  new URL(`${folder}/workflow/scheduler/planner-expansion.${extension}`, root).href
);
const rebound = archive.compiled.replace(/from "([^"]+)"/gu, (_: string, path: string) => {
  const target = path.startsWith(".")
    ? new URL(
        path.replace(/\.js$/u, `.${extension}`),
        new URL(`${folder}/workflow/scheduler/planner-expansion.${extension}`, root),
      ).href
    : import.meta.resolve(path);
  return `from ${JSON.stringify(target)}`;
});
export const historical = (await import(
  `data:text/javascript;base64,${Buffer.from(rebound).toString("base64")}`
)) as typeof current;
