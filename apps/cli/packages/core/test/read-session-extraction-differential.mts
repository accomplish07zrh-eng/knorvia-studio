// Compare against an externally materialized, source-exposed baseline runner.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { material } from "./read-session-extraction-fixture.js";
const baselinePath = process.argv[2];
if (!baselinePath) throw new Error("Pass the baseline extraction runner path");
const { extractWithLite } = await import(pathToFileURL(baselinePath).href);
const emitted = process.env.KNORVIA_SESSION_EXTRACTION_TARGET === "dist";
const { runSessionExtraction } = await import(
  new URL(
    emitted
      ? "../dist/tool/handlers/read-session-context-extraction.js"
      : "../src/tool/handlers/read-session-context-extraction.ts",
    import.meta.url,
  ).href
);
const digest = createHash("sha256");
let state = 0x52534358;
function next() {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state;
}
const responses = [
  "",
  " ",
  "NO_RELEVANT_CONTEXT",
  "no_relevant_context",
  "kept",
  " raw note ",
  "NO_RELEVANT_CONTEXT plus",
  "x".repeat(4001),
];
for (let index = 0; index < 4096; index += 1) {
  const sample = material(next() % 9);
  sample.allContentChars = [0, 79999, 80000, 80001, 999999][next() % 5];
  const parsed = {
    sessionId: "sess_owned",
    query: "owned",
    strategy: "relevant",
    maxTokens: [undefined, 1, 1600, 3200, 6000, 12000][next() % 6],
  };
  const budget = [0, 15, 4000, 24000, 48000][next() % 5];
  const queue = Array.from({ length: 7 }, () => responses[next() % responses.length]);
  async function observe(old: boolean) {
    const requests: unknown[] = [];
    let cursor = 0;
    const extract = async (request: any) => {
      const { material, maxOutputTokens, sourceLabel, synthesize } = request;
      requests.push({
        material,
        maxOutputTokens,
        sourceLabel,
        ...(synthesize === undefined ? {} : { synthesize }),
      });
      return queue[cursor++] ?? "";
    };
    const input = {
      material: structuredClone(sample),
      parsed: { ...parsed },
      outputCharBudget: budget,
    };
    const result = old
      ? await extractWithLite({ ...input, session: {}, context: { extract } })
      : await runSessionExtraction(input, extract);
    return { result, requests };
  }
  const before = await observe(true);
  const after = await observe(false);
  assert.deepEqual(after, before, `case ${index}`);
  digest.update(JSON.stringify(after));
}
console.log(
  JSON.stringify({
    cases: 4096,
    seed: 0x52534358,
    mode: emitted ? "emitted" : "source",
    digest: digest.digest("hex"),
  }),
);
