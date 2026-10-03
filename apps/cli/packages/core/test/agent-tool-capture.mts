// Explicit baseline capture only. Tests never update these observations.
import { writeFile } from "node:fs/promises";
import {
  directCases,
  getterCases,
  executorCases,
  formatCases,
  descriptionCases,
} from "./agent-tool-cases.js";
import {
  clock,
  declaration,
  describe,
  module,
  observe,
  observeExecutor,
  formatObservation,
  publicDeclaration,
  registryObservation,
  permissionObservation,
  projectionMatrix,
} from "./agent-tool-fixture.js";
const target = process.argv[2];
if (!target) throw new Error("Provide an explicit synthetic Agent capture file");
const data = await clock(async () => ({
  exports: Object.keys(module),
  publicDeclaration,
  declarations: [declaration(module.agentToolEntry), declaration(module.taskToolEntry)],
  descriptions: descriptionCases.map(describe),
  permissions: permissionObservation(),
  projectionMatrix: projectionMatrix(),
  registry: [
    {},
    { includeAgent: false },
    { includeDynamicWorkflow: false },
    { embeddedSearchEnabled: true },
    { disallowedTools: ["Task"] },
  ].map(registryObservation),
  direct: await Promise.all(
    directCases.map(async (c) => ({ label: c.label, observed: await observe(c) })),
  ),
  getters: await Promise.all(
    getterCases.map(async (fault) => ({
      fault,
      observed: await observe(
        {
          label: "getters",
          model: { syntheticModel: true },
          override: { syntheticOverride: true },
        },
        fault,
      ),
    })),
  ),
  formatting: formatCases.map(formatObservation),
  executor: await Promise.all(
    executorCases.map(async ({ c, decision }) => ({
      label: c.label,
      observed: await observeExecutor(c, decision),
    })),
  ),
}));
await writeFile(target, JSON.stringify(data, null, 2) + "\n");
console.log(
  JSON.stringify({
    direct: data.direct.length,
    getters: data.getters.length,
    formatting: data.formatting.length,
    executor: data.executor.length,
  }),
);
