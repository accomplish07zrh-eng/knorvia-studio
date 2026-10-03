// Explicit freeze destination; synthetic ports only. Run before replacing production.
import { writeFile } from "node:fs/promises";
import { cases, getterCases, executorCases } from "./escalate-orchestration-cases.js";
import {
  clock,
  entry,
  json,
  observeDirect,
  observeExecutor,
  publicDeclaration,
  registryObservations,
  runtimeObservations,
} from "./escalate-orchestration-fixture.js";
import {
  delayedObservation,
  settlement,
  settlementCases,
} from "./escalate-orchestration-settlement-fixture.js";
const destination = process.argv[2];
if (!destination) throw new Error("An explicit freeze destination is required");
const result = await clock(async () => ({
  metadata: json(entry.metadata),
  declaration: publicDeclaration,
  inputSchema: entry.inputSchema,
  outputSchema: entry.outputSchema,
  permission: entry.permission,
  resultBudget: entry.resultBudget,
  timeout: entry.timeout,
  cancellation: entry.cancellation,
  trace: entry.trace,
  capability: entry.capability,
  direct: await Promise.all(
    cases.map(async (c) => ({ label: c.label, observed: await observeDirect(c) })),
  ),
  getters: await Promise.all(
    getterCases.map(async (c) => ({ label: c.label, observed: await observeDirect(c) })),
  ),
  executor: await Promise.all(
    executorCases.map(async (c) => ({ label: c.label, observed: await observeExecutor(c) })),
  ),
  registry: registryObservations(),
  runtime: runtimeObservations(),
}));
// Serial clock/port runs prevent one fixture restoring the clock while another still owns it.
const edges: any[] = [];
for (const driver of ["deadline", "executor"])
  for (const c of settlementCases)
    edges.push({
      driver,
      ...c,
      observed: await settlement(entry, driver, c.kind, c.flavor, c.stage, c.depth),
    });
const delayed = [];
for (const stale of [false, true])
  delayed.push({ stale, observed: await delayedObservation(entry, stale) });
await writeFile(destination, JSON.stringify({ ...result, edges, delayed }, null, 2) + "\n");
