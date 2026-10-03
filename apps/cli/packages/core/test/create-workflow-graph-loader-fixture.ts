import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { emitted, sha } from "./workflow-run-summary-fixture.js";
import { verifyCurrentArtifacts } from "./current-artifact-receipt-20261003.js";

export type GraphModule = "fold" | "bounds" | "analysis";
type ReadArtifact = (url: URL) => Promise<string>;
const read: ReadArtifact = (url) => readFile(url, "utf8");
const contractText = await read(new URL("./create-workflow-graph-loader-contract.json", import.meta.url));
const contract = JSON.parse(contractText);
const oldBounds = JSON.parse(
  await read(
    new URL("./create-workflow-graph-bounds-implementation-baseline.json", import.meta.url),
  ),
);
const modules: Record<GraphModule, string> = {
  fold: "create-workflow-graph-fold",
  bounds: "create-workflow-graph-bounds",
  analysis: "workflow-analysis-display",
};

// 旧夹具把当前产物当成历史 oracle；重组原摘要绑定的字节，当前模块仍从自己的真实路径加载。
export function historicalBoundsBytes(): string {
  const historical = contract.historical;
  assert.equal(sha(historical.boundsHeader), historical.boundsHeaderSha256);
  assert.equal(historical.boundsHeaderSha256, oldBounds.emittedHeaderSha256);
  assert.equal(sha(historical.boundsTail), historical.boundsTailSha256);
  assert.equal(historical.boundsTailSha256, oldBounds.emittedTailSha256);
  assert.equal(sha(oldBounds.owner), oldBounds.ownerSha256);
  const code = historical.boundsHeader + oldBounds.owner + historical.boundsTail;
  assert.equal(sha(code), oldBounds.emittedSha256);
  assert.equal(sha(code), historical.boundsSha256);
  return code;
}
export function historicalAnalysisBytes(): string {
  assert.equal(sha(contract.historical.analysis), contract.historical.analysisSha256);
  return contract.historical.analysis;
}
export function currentGraphUrl(name: GraphModule): URL {
  return new URL(
    `../${emitted ? "dist" : "src"}/tool/handlers/${modules[name]}.${emitted ? "js" : "ts"}`,
    import.meta.url,
  );
}
export async function loadCurrentGraph(name: GraphModule, readArtifact = read) {
  // Verify the caller's complete graph closure even when its namespace is already cached.
  const historicalFiles: Record<string, string> = {};
  for (const role of ["fold", "bounds", "analysis"] as const) {
    const expected = contract.current[role];
    assert.equal(expected.module, modules[role]);
    for (const [directory, extension, pin] of [
      ["src", ".ts", expected.sourceSha256],
      ["dist", ".js", expected.emittedSha256],
      ["dist", ".d.ts", expected.declarationSha256],
    ]) {
      historicalFiles[`${directory}/tool/handlers/${modules[role]}${extension}`] = pin;
    }
  }
  await verifyCurrentArtifacts(
    "create-workflow-graph-loader-contract.json",
    contractText,
    historicalFiles,
    new URL("../", import.meta.url),
    readArtifact,
  );
  return import(currentGraphUrl(name).href);
}
