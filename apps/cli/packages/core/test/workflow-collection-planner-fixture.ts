import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (url: URL) => readFile(url, "utf8");
export const sha = (text: string) => createHash("sha256").update(text).digest("hex");
export const surface =
  process.env.KNORVIA_COLLECTION_PLANNER_TEST_EMITTED === "1" ? "emitted" : "source";
const folder = surface === "source" ? "src" : "dist";
const extension = surface === "source" ? "ts" : "js";

export async function loadHistorical(readArchive = read) {
  const text = await readArchive(
    new URL("./workflow-collection-planner-baseline.json", import.meta.url),
  );
  assert.equal(sha(text), "d280e53af9b42aef8af9d6f17bdb469be83718010afb8caa0a9f94cdcc3043ba");
  const archive = JSON.parse(text);
  assert.equal(sha(archive.compiled), archive.emittedSha256);
  assert.equal(sha(archive.declaration), archive.declarationSha256);
  return archive;
}
export const archive = await loadHistorical();
const pinText = await read(new URL("./workflow-collection-planner-current.json", import.meta.url));
assert.equal(sha(pinText), "21e1c5dbd2a8fe8537650262dcd7f7df39591755d9fdd2524ecdae99012601a9");
export const pins: { files: Record<string, string> } = JSON.parse(pinText);
export async function loadCurrent(readArtifact = read) {
  for (const [path, digest] of Object.entries(pins.files))
    assert.equal(sha(await readArtifact(new URL(path, root))), digest, path);
  return import(
    new URL(`${folder}/workflow/scheduler/collection-planner.${extension}`, root).href
  ) as Promise<typeof import("../src/workflow/scheduler/collection-planner.js")>;
}
export const current = await loadCurrent();
export const actual = await import(
  new URL(`${folder}/workflow/scheduler/collection-planner.${extension}`, root).href
);
export const consumer = (await import(
  new URL(`${folder}/workflow/scheduler.${extension}`, root).href
)) as typeof import("../src/workflow/scheduler.js");
export const events = (await import(
  new URL(`${folder}/workflow/scheduler/events.${extension}`, root).href
)) as typeof import("../src/workflow/scheduler/events.js");
const historicalText = archive.compiled.replace(
  /from "([^"]+)"/gu,
  (_match: string, path: string) => {
    const target = path.startsWith(".")
      ? new URL(
          path.replace(/\.js$/u, `.${extension}`),
          new URL(`${folder}/workflow/scheduler/collection-planner.${extension}`, root),
        ).href
      : import.meta.resolve(path);
    return `from ${JSON.stringify(target)}`;
  },
);
export const historical = (await import(
  `data:text/javascript;base64,${Buffer.from(historicalText).toString("base64")}`
)) as typeof current;
