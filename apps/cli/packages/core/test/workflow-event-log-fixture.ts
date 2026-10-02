import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const read = (url: URL) => readFile(url, "utf8");
export const sha = (value: string) => createHash("sha256").update(value).digest("hex");
export const surface =
  process.env.KNORVIA_WORKFLOW_RUN_SUMMARY_TEST_EMITTED === "1" ? "emitted" : "source";
const folder = surface === "emitted" ? "dist" : "src";
const extension = surface === "emitted" ? "js" : "ts";
export async function loadHistorical(readArchive = read) {
  const text = await readArchive(new URL("./workflow-event-log-baseline.json", import.meta.url));
  assert.equal(sha(text), "42587916188ac52126294bbf248edb456461e9f6b95092756b9ec1bb13f84876");
  const archive = JSON.parse(text);
  assert.equal(sha(archive.compiled), archive.emittedSha256);
  assert.equal(sha(archive.declaration), archive.declarationSha256);
  return archive;
}
export const archive = await loadHistorical();
const selector = await read(new URL("./workflow-event-log-pins.json", import.meta.url));
assert.equal(sha(selector), "340e14254fbbe5fce2a123065448b2baedcaed7f8f2b36b6e52d44b5d8a13a05");
export const pins: { files: Record<string, string> } = JSON.parse(selector);
export async function loadCurrent(readArtifact = read) {
  for (const [path, digest] of Object.entries(pins.files))
    assert.equal(sha(await readArtifact(new URL(path, root))), digest, path);
  return import(new URL(`${folder}/workflow/scheduler/events.${extension}`, root).href) as Promise<
    typeof import("../src/workflow/scheduler/events.js")
  >;
}
export const current = await loadCurrent();
export const actual = await import(
  new URL(`${folder}/workflow/scheduler/events.${extension}`, root).href
);
export const consumer = await import(
  new URL(`${folder}/workflow/scheduler.${extension}`, root).href
);
const mapped = archive.compiled.replace(/from "([^"]+)"/gu, (_match: string, path: string) => {
  assert.equal(path, "./graph.js");
  return `from ${JSON.stringify(new URL(`${folder}/workflow/scheduler/graph.${extension}`, root).href)}`;
});
export const historical = (await import(
  `data:text/javascript;base64,${Buffer.from(mapped).toString("base64")}`
)) as typeof current;
