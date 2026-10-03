// Explicit source-exposed baseline capture only; final tests never update observations.
import { writeFile } from "node:fs/promises";
import {
  directCases,
  getterCases,
  executorCases,
  formatCases,
} from "./collaboration-tool-cases.js";
import { verdictProbes, observeVerdictProbe } from "./collaboration-tool-verdict-probes.js";
import {
  clock,
  declaration,
  entryFor,
  modules,
  publicDeclarations,
  observe,
  observeExecutor,
  formatObservation,
  factoryObservations,
  registryObservation,
  registryVariants,
  permissionObservations,
  projectionMatrix,
} from "./collaboration-tool-fixture.js";
const target = process.argv[2];
if (!target) throw new Error("Provide an explicit synthetic collaboration capture path");
const data = await clock(async () => ({
  exports: Object.fromEntries(
    Object.entries(modules).map(([key, module]) => [key, Object.keys(module)]),
  ),
  publicDeclarations,
  declarations: ["send", "respond", "submit"].map((operation: any) =>
    declaration(entryFor(operation)),
  ),
  factories: factoryObservations(),
  registry: registryVariants.map(registryObservation),
  permissions: permissionObservations(),
  projectionMatrix: projectionMatrix(),
  direct: await Promise.all(
    directCases.map(async (c) => ({ label: c.label, observed: await observe(c) })),
  ),
  getters: await Promise.all(
    getterCases.map(async ({ operation, fault }) => ({
      operation,
      fault,
      observed: await observe({ label: "getters", operation }, fault),
    })),
  ),
  formatting: Object.fromEntries(
    Object.entries(formatCases).map(([operation, values]) => [
      operation,
      values.map((value) => formatObservation(operation as any, value)),
    ]),
  ),
  verdicts: await Promise.all(
    verdictProbes.map(async (probe) => ({ probe, observed: await observeVerdictProbe(probe) })),
  ),
  executor: await Promise.all(
    executorCases.map(async ({ c, decision, typed }) => ({
      label: c.label,
      observed: await observeExecutor(c, decision, typed),
    })),
  ),
}));
await writeFile(target, JSON.stringify(data, null, 2) + "\n");
console.log(
  JSON.stringify({
    direct: data.direct.length,
    getters: data.getters.length,
    verdicts: data.verdicts.length,
    executor: data.executor.length,
    matrix: data.projectionMatrix,
  }),
);
