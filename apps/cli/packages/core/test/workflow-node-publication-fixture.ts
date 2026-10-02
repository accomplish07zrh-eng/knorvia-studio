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
export async function loadBaseline(readArchive = read) {
  const bytes = await readArchive(
    new URL("./workflow-node-publication-baseline.json", import.meta.url),
  );
  assert.equal(sha(bytes), "50ca9dcc03b563db48049c7296c4aad25914beabbd2b0d9fb0a4036a11da1370");
  const archive = JSON.parse(bytes);
  assert.equal(sha(archive.compiled), archive.emittedSha256);
  assert.equal(sha(archive.declaration), archive.declarationSha256);
  return archive;
}
export const archive = await loadBaseline();
const selector = await read(new URL("./workflow-node-publication-current.json", import.meta.url));
assert.equal(sha(selector), "58dd4aadceb7c0271b19a3a83e3ccf7511219c1bc6477ee23c06d762197a5b1a");
export const pins: { files: Record<string, string> } = JSON.parse(selector);
export async function loadCurrent(readArtifact = read) {
  for (const [path, pin] of Object.entries(pins.files))
    assert.equal(sha(await readArtifact(new URL(path, root))), pin, path);
  assert.equal(
    await readArtifact(new URL("dist/workflow/scheduler/node-runner.d.ts", root)),
    archive.declaration,
  );
  return import(
    new URL(`${folder}/workflow/scheduler/node-runner.${extension}`, root).href
  ) as Promise<typeof import("../src/workflow/scheduler/node-runner.js")>;
}
export const current = await loadCurrent();
const selectedURL = new URL(`${folder}/workflow/scheduler/node-runner.${extension}`, root);
export const actual = await import(selectedURL.href);
function historical(code: string, location: string, overrides: Record<string, string> = {}) {
  const mapped = code.replace(/from "([^"]+)"/gu, (_match, path: string) => {
    const target =
      overrides[path] ??
      (path.startsWith(".")
        ? new URL(
            path.replace(/\.js$/u, `.${extension}`),
            new URL(`${folder}/${location}.${extension}`, root),
          ).href
        : import.meta.resolve(path));
    return `from ${JSON.stringify(target)}`;
  });
  return `data:text/javascript;base64,${Buffer.from(mapped).toString("base64")}`;
}
const oldNodeURL = historical(archive.compiled, "workflow/scheduler/node-runner");
export const baseline = (await import(oldNodeURL)) as typeof current;
const callerJS = await read(new URL("dist/workflow/scheduler.js", root));
assert.equal(sha(callerJS), archive.callerEmittedSha256);
export const oldScheduler = (await import(
  historical(callerJS, "workflow/scheduler", {
    "./scheduler/node-runner.js": oldNodeURL,
  })
)) as typeof import("../src/workflow/scheduler.js");
export const scheduler = (await import(
  new URL(`${folder}/workflow/scheduler.${extension}`, root).href
)) as typeof oldScheduler;
