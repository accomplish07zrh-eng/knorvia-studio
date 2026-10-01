import { writeFile } from "node:fs/promises";
import {
  baseline,
  baselineSummary,
  summaryDeclaration,
  cases,
  direct,
  executor,
  json,
  publicDeclaration,
  sha,
} from "./workflow-run-summary-fixture.js";
import { edges, edge } from "./workflow-run-summary-settlement-fixture.js";
import {
  summaryCases,
  throwingCases,
  observeSummary,
} from "./workflow-run-summary-facts-fixture.js";
const summaryDigests = [...summaryCases, ...throwingCases].map((c) =>
  sha(JSON.stringify(observeSummary(c, baselineSummary))),
);
const directDigests = [];
for (const c of cases) directDigests.push(sha(JSON.stringify(await direct(c, baseline))));
const executorCases = [
  {},
  { port: "missing" },
  { outcome: undefined },
  { port: "throw" },
  { port: "reject" },
  { port: "queued" },
  { port: "double" },
  { port: "early" },
  { port: "deny" },
  { input: { run_id: "" } },
];
const executorDigests = [];
for (const c of executorCases)
  executorDigests.push(sha(JSON.stringify(await executor(c, baseline))));
const edgeDigests = [];
for (const c of edges) edgeDigests.push(sha(JSON.stringify(await edge(baseline, c))));
await writeFile(
  new URL("./workflow-run-summary-contract.json", import.meta.url),
  JSON.stringify(
    {
      summaryDigests,
      summaryDeclaration,
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
      ordinary: await direct({}, baseline),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    summary: summaryDigests.length,
    direct: directDigests.length,
    executor: executorDigests.length,
    edges: edgeDigests.length,
  }),
);
