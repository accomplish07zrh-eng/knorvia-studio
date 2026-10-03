// Explicit capture only; final tests never rewrite inherited observations.
import { writeFile } from "node:fs/promises";
import { directCases, executorCases, getterCases } from "./plan-mode-cases.js";
import {
  clock,
  declaration,
  module,
  observe,
  observeExecutor,
  observeReads,
  publicDeclaration,
  createToolRegistry,
  handlers,
} from "./plan-mode-fixture.js";
const target = process.argv[2];
if (!target) throw new Error("Provide an explicit synthetic PlanMode capture file");
const data = await clock(async () => ({
  exports: Object.keys(module),
  publicDeclaration,
  declarations: [
    declaration(module.enterPlanModeToolEntry),
    declaration(module.exitPlanModeToolEntry),
  ],
  descriptions: [false, true].map(
    (embeddedSearchEnabled) =>
      module.createEnterPlanModeToolEntry({ embeddedSearchEnabled }).metadata.description,
  ),
  registryContracts: [false, true].map((embeddedSearchEnabled) => {
    const registry = createToolRegistry();
    handlers.registerBuiltInTools(registry, {
      allowedTools: ["EnterPlanMode", "ExitPlanMode"],
      embeddedSearchEnabled,
    });
    const contracts = registry.toContracts();
    return { keys: contracts.map((contract: object) => Object.keys(contract)), contracts };
  }),
  direct: await Promise.all(
    directCases.map(async (c) => ({ label: c.label, observed: await observe(c) })),
  ),
  executor: await Promise.all(
    executorCases.map(async ({ c, decision }) => ({
      label: c.label,
      observed: await observeExecutor(c, decision),
    })),
  ),
  getters: await Promise.all(
    getterCases.map(async ({ operation, fault }) => ({
      operation,
      fault,
      observed: await observeReads(operation, fault),
    })),
  ),
}));
await writeFile(target, JSON.stringify(data, null, 2) + "\n");
console.log(
  JSON.stringify({
    direct: data.direct.length,
    executor: data.executor.length,
    getters: data.getters.length,
  }),
);
