import { verifyCurrentArtifacts } from "./current-artifact-receipt-20261003.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const root = new URL("../../", import.meta.url);
const read = (url: URL) => readFile(url, "utf8");
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
export const surface =
  process.env.KNORVIA_COLLECTION_PLANNER_TEST_EMITTED === "1" ? "emitted" : "source";
const folder = surface === "source" ? "src" : "dist",
  ext = surface === "source" ? "ts" : "js";
export async function loadHistorical(reader = read) {
  const text = await reader(new URL("./workflow-graph-artifacts-baseline.json", import.meta.url));
  assert.equal(sha(text), "4eff13c7ab1c4bdebecfe49d6f0a7a3d7730d80698d18bebd418e510b75d23bb");
  const value = JSON.parse(text);
  assert.equal(sha(value.source), value.sourceSha256);
  assert.equal(sha(value.compiled), value.emittedSha256);
  assert.equal(sha(value.declaration), value.declarationSha256);
  return value;
}
export const archive = await loadHistorical();
const pinText = await read(new URL("./workflow-graph-artifacts-current.json", import.meta.url));
assert.equal(sha(pinText), "22816e4d40feedc60de5fcb4961699f24e2a5f5c1e3ca916de61b9c3607d44ba");
const pins: { files: Record<string, string> } = JSON.parse(pinText);
export async function loadCurrent(reader = read) {
  await verifyCurrentArtifacts(
    "workflow-graph-artifacts-current.json",
    pinText,
    pins.files,
    root,
    reader,
  );
  return import(
    new URL(`core/${folder}/workflow/expert/graph-artifacts.${ext}`, root).href
  ) as Promise<typeof import("../src/workflow/expert/graph-artifacts.js")>;
}
export const current = await loadCurrent();
export const actual = await import(
  new URL(`core/${folder}/workflow/expert/graph-artifacts.${ext}`, root).href
);
const data = (text: string) =>
  `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
function rebind(text: string, location: string, overrides: Record<string, string> = {}) {
  return text.replace(/from "([^"]+)"/gu, (_: string, path: string) => {
    const target =
      overrides[path] ??
      (path.startsWith(".")
        ? new URL(
            path.replace(/\.js$/u, `.${ext}`),
            new URL(`core/${folder}/workflow/expert/${location}.${ext}`, root),
          ).href
        : import.meta.resolve(path));
    return `from ${JSON.stringify(target)}`;
  });
}
const oldUrl = data(rebind(archive.compiled, "graph-artifacts"));
export const historical = (await import(oldUrl)) as typeof current;
const callerText = await read(new URL("core/dist/workflow/expert/run-loop.js", root));
const historicalCallerText = archive.callerCompiled;
assert.equal(
  sha(historicalCallerText),
  "5a2d8a8dcb4c2ed560eb3d5f361350876e16054f6e765fabc78f9e8aea293efd",
);
const guard = data(
  `const unexpected = () => { throw new Error("Owned unused runtime path"); }; export { unexpected as runFinalCriticLoop, unexpected as runScheduledPhase, unexpected as latestWorkflowActivity, unexpected as workflowFailureFromError, unexpected as workflowRecoveryActions, unexpected as compactWorkflowPayload, unexpected as lifecyclePayload, unexpected as buildReport };`,
);
const phase = data(
  `export async function runPhase(ctx, snapshot, definition, options) { return ctx.ownedPhase(snapshot, definition, options); }`,
);
async function caller(owner: string, text = callerText) {
  return import(
    data(
      rebind(text, "run-loop", {
        "./graph-artifacts.js": owner,
        "./phase-runner.js": phase,
        "./critic-loop.js": guard,
        "./scheduled-phase.js": guard,
        "./failures.js": guard,
        "./runtime-context.js": guard,
        "./prompts.js": guard,
      }),
    )
  ) as Promise<typeof import("../src/workflow/expert/run-loop.js")>;
}
export const currentCaller = await caller(
  new URL(`core/${folder}/workflow/expert/graph-artifacts.${ext}`, root).href,
);
export const historicalCaller = await caller(oldUrl, historicalCallerText);
