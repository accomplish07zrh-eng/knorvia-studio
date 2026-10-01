import { writeFile } from "node:fs/promises";
import {
  baseline,
  cases,
  direct,
  executor,
  edge,
  json,
  publicDeclaration,
  sha,
} from "./list-saved-workflows-model-fixture.js";
const directDigests = cases.map((c) => sha(JSON.stringify(direct(c, baseline))));
const executorCases = [
  {},
  { queued: true },
  { reject: true },
  { early: true },
  { deny: true },
  { output: { workflows: [], invalid: [] } },
];
const executorDigests = [];
for (const c of executorCases)
  executorDigests.push(sha(JSON.stringify(await executor(c, baseline))));
const edgeDigests = [];
for (let depth = 0; depth < 9; depth++)
  edgeDigests.push(sha(JSON.stringify(await edge(baseline, depth))));
await writeFile(
  new URL("./list-saved-workflows-model-contract.json", import.meta.url),
  JSON.stringify(
    {
      directDigests,
      executorDigests,
      edgeDigests,
      declaration: publicDeclaration,
      metadata: json({
        ...baseline,
        handler: undefined,
        formatModelContent: undefined,
        runtimeInputSchema: undefined,
        runtimeOutputSchema: undefined,
      }),
      ordinary: direct({}, baseline),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    direct: directDigests.length,
    executor: executorDigests.length,
    edges: edgeDigests.length,
  }),
);
