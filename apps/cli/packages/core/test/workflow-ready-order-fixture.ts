import { verifyCurrentArtifacts } from "./current-artifact-receipt-20261003.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const read = (url: URL) => readFile(url, "utf8");
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
export const surface =
  process.env.KNORVIA_COLLECTION_PLANNER_TEST_EMITTED === "1" ? "emitted" : "source";
const folder = surface === "source" ? "src" : "dist",
  extension = surface === "source" ? "ts" : "js";
export async function loadHistorical(reader = read) {
  const text = await reader(new URL("./workflow-ready-order-baseline.json", import.meta.url));
  assert.equal(sha(text), "2b531cb55669db3a233b5031e160443651a1324e8b014bbe487743f34813e723");
  const value = JSON.parse(text);
  assert.equal(sha(value.source), value.sourceSha256);
  assert.equal(sha(value.compiled), value.emittedSha256);
  assert.equal(sha(value.declaration), value.declarationSha256);
  assert.equal(sha(value.schedulerCompiled), value.dependencyPins["dist/workflow/scheduler.js"]);
  return value;
}
export const archive = await loadHistorical();
const text = await read(new URL("./workflow-ready-order-current.json", import.meta.url));
assert.equal(sha(text), "e5a1716504bb240bddd2dd8a311482dfb3a702f7d7cddc052d5b62c90c5996df");
const pins: { files: Record<string, string> } = JSON.parse(text);
export async function loadCurrent(reader = read) {
  await verifyCurrentArtifacts(
    "workflow-ready-order-current.json",
    text,
    pins.files,
    root,
    reader,
  );
  return import(new URL(`${folder}/workflow/scheduler/graph.${extension}`, root).href) as Promise<
    typeof import("../src/workflow/scheduler/graph.js")
  >;
}
export const current = await loadCurrent();
export const actual = await import(
  new URL(`${folder}/workflow/scheduler/graph.${extension}`, root).href
);
const dataUrl = (text: string) =>
  `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
function rebind(text: string, path: string, graphUrl?: string) {
  return text.replace(/from "([^"]+)"/gu, (_: string, target: string) => {
    const url =
      graphUrl && target === "./scheduler/graph.js"
        ? graphUrl
        : target.startsWith(".")
          ? new URL(
              target.replace(/\.js$/u, `.${extension}`),
              new URL(`${folder}/workflow/${path}.${extension}`, root),
            ).href
          : import.meta.resolve(target);
    return `from ${JSON.stringify(url)}`;
  });
}
const oldGraphUrl = dataUrl(rebind(archive.compiled, "scheduler/graph"));
export const historical = (await import(oldGraphUrl)) as typeof current;
export const scheduler = (await import(
  new URL(`${folder}/workflow/scheduler.${extension}`, root).href
)) as typeof import("../src/workflow/scheduler.js");
export const historicalScheduler = (await import(
  dataUrl(rebind(archive.schedulerCompiled, "scheduler", oldGraphUrl))
)) as typeof scheduler;
