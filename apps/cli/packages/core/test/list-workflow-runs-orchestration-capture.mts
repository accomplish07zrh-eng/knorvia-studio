import { edge, edgeCases } from "./list-workflow-runs-orchestration-settlement-fixture.js";
import { writeFile } from "node:fs/promises";
import {
  baseline,
  cases,
  direct,
  executor,
  registry,
  json,
  publicDeclaration,
} from "./list-workflow-runs-orchestration-fixture.js";
const directFacts = [];
for (const c of cases) directFacts.push(await direct(c, baseline));
const executorCases = [
  {},
  { port: "missing" },
  { port: "throw" },
  { port: "reject" },
  { port: "queued" },
  { port: "double" },
  { port: "early" },
  { port: "deny" },
  { input: { cwd: "synthetic-other" } },
  { outcome: { runs: [] } },
];
const executorFacts = [];
for (const c of executorCases) executorFacts.push(await executor(c, baseline));
const edgeFacts = [];
for (const c of edgeCases)
  edgeFacts.push(await edge(baseline, c.driver, c.stage, c.depth, c.flavor));
const contract = {
  directFacts,
  executorCases,
  executorFacts,
  edgeFacts,
  registry: registry(),
  declaration: publicDeclaration,
  metadata: json({
    ...baseline,
    handler: undefined,
    formatModelContent: undefined,
    runtimeInputSchema: undefined,
    runtimeOutputSchema: undefined,
  }),
};
await writeFile(
  new URL("./list-workflow-runs-orchestration-contract.json", import.meta.url),
  JSON.stringify(contract, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    direct: directFacts.length,
    executor: executorFacts.length,
    edges: edgeFacts.length,
  }),
);
