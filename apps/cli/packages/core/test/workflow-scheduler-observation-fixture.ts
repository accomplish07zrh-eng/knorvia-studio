import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const read = (url: URL) => readFile(url, "utf8");
const root = new URL("../", import.meta.url);
export const surface =
  process.env.KNORVIA_WORKFLOW_RUN_SUMMARY_TEST_EMITTED === "1" ? "emitted" : "source";
const folder = surface === "emitted" ? "dist" : "src";
const extension = surface === "emitted" ? "js" : "ts";
export async function loadHistorical(readArchive = read) {
  const text = await readArchive(
    new URL("./workflow-scheduler-observation-baseline.json", import.meta.url),
  );
  assert.equal(sha(text), "4348a7528361cc1da95289b59185bca9de1747e2ba07b3536547c3b575a80553");
  const archive = JSON.parse(text);
  assert.equal(sha(archive.compiled), archive.emittedSha256);
  assert.equal(sha(archive.declaration), archive.declarationSha256);
  return archive;
}
export const archive = await loadHistorical();
const selectorURL = new URL("./workflow-scheduler-observation-pins.json", import.meta.url);
const selector = await read(selectorURL);
assert.equal(sha(selector), "0e3ba33f51a7ac11d918a25ec7ffdff1857311325b9c744dc272ad246637ea64");
export const pins: { files: Record<string, string> } = JSON.parse(selector);
export async function loadCurrent(readArtifact = read) {
  for (const [path, digest] of Object.entries(pins.files))
    assert.equal(sha(await readArtifact(new URL(path, root))), digest, path);
  return import(new URL(`${folder}/workflow/scheduler.${extension}`, root).href) as Promise<
    typeof import("../src/workflow/scheduler.js")
  >;
}
export const current = await loadCurrent();
export const actual = await import(new URL(`${folder}/workflow/scheduler.${extension}`, root).href);
export const caller = (await import(
  new URL(`${folder}/workflow/expert/scheduled-phase.${extension}`, root).href
)) as typeof import("../src/workflow/expert/scheduled-phase.js");
const historicalText = archive.compiled.replace(
  /from "([^"]+)"/gu,
  (_match: string, path: string) => {
    const target = path.startsWith(".")
      ? new URL(
          path.replace(/\.js$/u, `.${extension}`),
          new URL(`${folder}/workflow/scheduler.${extension}`, root),
        ).href
      : import.meta.resolve(path);
    return `from ${JSON.stringify(target)}`;
  },
);
export const historical = (await import(
  `data:text/javascript;base64,${Buffer.from(historicalText).toString("base64")}`
)) as typeof current;
