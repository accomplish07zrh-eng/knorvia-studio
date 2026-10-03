import { verifyCurrentArtifacts } from "./current-artifact-receipt-20261003.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const root = new URL("../../", import.meta.url),
  read = (url: URL) => readFile(url, "utf8");
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
export const surface =
  process.env.KNORVIA_COLLECTION_PLANNER_TEST_EMITTED === "1" ? "emitted" : "source";
const folder = surface === "source" ? "src" : "dist",
  extension = surface === "source" ? "ts" : "js";
export async function loadHistorical(reader = read) {
  const text = await reader(new URL("./workflow-scheduler-state-baseline.json", import.meta.url));
  assert.equal(sha(text), "7e50244bfb7ea66e8915394e7017d78b3829ad6ebfcba2d416e6e6477e228839");
  const value = JSON.parse(text);
  assert.equal(sha(value.sourceFragment), value.sourceFragmentSha256);
  assert.equal(sha(value.compiledFragment), value.compiledFragmentSha256);
  return value;
}
export const archive = await loadHistorical();
const text = await read(new URL("./workflow-scheduler-state-current.json", import.meta.url));
assert.equal(sha(text), "2b7107fc822aa0848ddd6a8dbd24931ae7cda0e30610a945978b16a015a66a66");
const pins: { files: Record<string, string> } = JSON.parse(text);
export async function loadCurrent(reader = read) {
  await verifyCurrentArtifacts(
    "workflow-scheduler-state-current.json",
    text,
    pins.files,
    root,
    reader,
  );
  return import(new URL(`contracts/${folder}/workflow/index.${extension}`, root).href) as Promise<
    typeof import("@knorvia/contracts")
  >;
}
export const current = await loadCurrent();
export const actual = await import(
  new URL(`contracts/${folder}/workflow/index.${extension}`, root).href
);
const data = (text: string) =>
  `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
const oldUrl = data(archive.compiledFragment);
export const historical = (await import(oldUrl)) as Pick<
  typeof current,
  "deriveWorkflowSchedulerState"
>;
const contractsOverlay = data(
  `export * from ${JSON.stringify(import.meta.resolve("@knorvia/contracts"))};\nexport { deriveWorkflowSchedulerState } from ${JSON.stringify(oldUrl)};`,
);
const graphHistoryText = await read(
  new URL("./workflow-graph-boundary-baseline.json", import.meta.url),
);
assert.equal(
  sha(graphHistoryText),
  "6366a05a77ff4c24b61cf1338ed731c27b46fa01bcf6c318f7c651cfe2f4bfe3",
);
const oldGraph: string = JSON.parse(graphHistoryText).records.graph.compiled;
assert.equal(sha(oldGraph), archive.dependencyPins["core/dist/workflow/scheduler/graph.js"]);
const graphUrl = data(
  oldGraph.replace('from "@knorvia/contracts"', `from ${JSON.stringify(contractsOverlay)}`),
);
// 不能让当前 dist 字节冒充旧 dependencyPins；使用同摘要的已有 scheduler archive。
const schedulerArchive = JSON.parse(
  await read(new URL("./workflow-scheduler-observation-baseline.json", import.meta.url)),
);
const schedulerText: string = schedulerArchive.compiled;
assert.equal(sha(schedulerText), schedulerArchive.emittedSha256);
assert.equal(sha(schedulerText), archive.dependencyPins["core/dist/workflow/scheduler.js"]);
const schedulerOld = schedulerText.replace(/from "([^"]+)"/gu, (_: string, path: string) => {
  const target =
    path === "./scheduler/graph.js"
      ? graphUrl
      : path.startsWith(".")
        ? new URL(
            path.replace(/\.js$/u, `.${extension}`),
            new URL(`core/${folder}/workflow/scheduler.${extension}`, root),
          ).href
        : import.meta.resolve(path);
  return `from ${JSON.stringify(target)}`;
});
export const historicalScheduler = (await import(
  data(schedulerOld)
)) as typeof import("../src/workflow/scheduler.js");
export const scheduler = (await import(
  new URL(`core/${folder}/workflow/scheduler.${extension}`, root).href
)) as typeof historicalScheduler;
