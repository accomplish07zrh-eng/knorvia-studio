// Optional immutable baseline modules are supplied outside Git. Never invoke a provider.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { clock, entry, observeProjection, observeStream, projection } from "./websearch-fixture.js";

const referencePath = process.argv[2];
if (!referencePath) throw new Error("Provide the external immutable WebSearch reference directory");
const reference = await import(pathToFileURL(join(referencePath, "websearch.ts")).href);
const referenceProjection = await import(
  pathToFileURL(join(referencePath, "websearch-results.ts")).href
);
const seed = 0x57534231;
let state = seed;
const pick = (limit: number) => {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) % limit;
};
const any = () => [undefined, null, false, true, 0, 3, "", "example", [], {}][pick(10)];
const url = () =>
  [
    "https://example.invalid/a",
    "HTTPS://EXAMPLE.invalid/A",
    "http://example.invalid/b",
    "example",
    "",
  ][pick(5)];
const summary = () =>
  [
    "",
    " ",
    "partial",
    "[Example](https://example.invalid/a)",
    "![image](https://image.invalid/x) [Other](http://example.invalid/b)",
    "[x\ny](https://ignored.invalid/a)",
  ][pick(6)];
function usage() {
  const output: Record<string, unknown> = {};
  for (const key of [
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "cacheReadTokens",
    "cacheWriteTokens",
    "reasoningTokens",
  ])
    if (pick(3) === 0) output[key] = any();
  if (pick(3) === 0)
    output.serverToolUse = pick(2) ? { webSearchRequests: any(), webFetchRequests: any() } : any();
  return output;
}
function event() {
  switch (pick(8)) {
    case 0:
      return { type: "text_delta", text: pick(2) ? summary() : any() };
    case 1:
      return {
        type: "finish",
        finishReason: any(),
        usage: pick(4) ? usage() : any(),
        providerMetadata: any(),
      };
    case 2:
      return { type: "tool_call", toolCall: any() };
    case 3:
      return { type: "error", error: any() };
    case 4:
      return { type: "reasoning_delta", text: summary() };
    case 5:
      return { type: "source", url: url() };
    case 6:
      return { type: any() };
    default:
      return any();
  }
}
function tree(depth = 0): unknown {
  if (depth === 3) return any();
  switch (pick(5)) {
    case 0:
      return any();
    case 1:
      return Array.from({ length: pick(4) }, () => tree(depth + 1));
    default:
      return {
        url: pick(3) ? url() : any(),
        title: any(),
        pageAge: any(),
        type: [undefined, "", "url", "web_search_result", "other", any()][pick(6)],
        content: tree(depth + 1),
        sources: tree(depth + 1),
      };
  }
}
const digest = createHash("sha256");
await clock(async () => {
  for (let index = 0; index < 4096; index++) {
    const c = {
      label: `seeded-stream/${index}`,
      missingModel: pick(8) === 0,
      supported: pick(8) !== 0,
      maxTokens: [0, 1, 4096, 4097, 9000][pick(5)],
      levels: pick(4) ? ["low", "high"] : [],
      input: {
        query: pick(5) ? "fictional query" : any(),
        allowed_domains: any(),
        blocked_domains: any(),
        maxUses: any(),
      },
      events: Array.from({ length: pick(8) }, event),
    };
    const expected = await observeStream(c, reference.webSearchToolEntry);
    const actual = await observeStream(c, entry);
    assert.deepEqual(actual, expected, c.label);
    digest.update(JSON.stringify(expected));
  }
  for (let index = 0; index < 4096; index++) {
    const c = {
      text: pick(5) ? summary() : any(),
      finishReason: "stop",
      usage: pick(5) ? usage() : any(),
      sources: pick(3)
        ? Array.from({ length: pick(4) }, () => ({
            sourceType: ["url", "document"][pick(2)],
            url: url(),
            title: any(),
          }))
        : any(),
      toolResults: pick(3)
        ? Array.from({ length: pick(4) }, () => ({
            id: "synthetic",
            name: "web_search",
            input: {},
            output: tree(),
          }))
        : any(),
    };
    const expected = await observeProjection(c, referenceProjection);
    const actual = await observeProjection(c, projection);
    assert.deepEqual(actual, expected, `seeded-projection/${index}`);
    digest.update(JSON.stringify(expected));
  }
});
console.log(
  JSON.stringify({
    seed,
    streamComparisons: 4096,
    projectionComparisons: 4096,
    baselineObservationSha256: digest.digest("hex"),
    emitted: process.env.KNORVIA_WEBSEARCH_TEST_EMITTED === "1",
  }),
);
