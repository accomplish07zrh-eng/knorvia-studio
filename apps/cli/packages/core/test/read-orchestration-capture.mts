// Explicit synthetic baseline capture; tests never overwrite frozen observations.
import { writeFile } from "node:fs/promises";
import { cacheEntry, directCases, executorCases, getterCases } from "./read-orchestration-cases.js";
import {
  declaration,
  observe,
  publicDeclaration,
  readModule,
} from "./read-orchestration-fixture.js";
import {
  freshnessMatrix,
  modelContexts,
  modelObservation,
  observeExecutor,
  permissionObservations,
  registryObservation,
  registryVariants,
} from "./read-orchestration-consumer-fixture.js";
const target = process.argv[2];
if (!target) throw new Error("Provide an explicit synthetic Read orchestration capture path");
const direct = [],
  getters = [],
  executor = [];
for (const c of directCases) direct.push({ label: c.label, observed: await observe(c) });
for (const p of getterCases) {
  const c = {
    label: "getters",
    ...(p.route === "cached" ? { cache: cacheEntry } : {}),
    ...(p.route === "image" ? { suffix: "png" } : {}),
    ...(p.route === "video" ? { suffix: "mp4" } : {}),
    ...(p.route === "pdf" ? { suffix: "pdf", pdf: true } : {}),
  };
  getters.push({ ...p, observed: await observe(c, p) });
}
for (const c of executorCases)
  executor.push({ label: c.label, observed: await observeExecutor(c) });
const data = {
  exports: Object.keys(readModule),
  publicDeclaration,
  declaration: declaration(),
  direct,
  getters,
  executor,
  permissions: permissionObservations(),
  registry: registryVariants.map(registryObservation),
  models: modelContexts.map(modelObservation),
  freshnessMatrix: await freshnessMatrix(),
};
await writeFile(target, JSON.stringify(data, null, 2) + "\n");
console.log(
  JSON.stringify({
    direct: direct.length,
    getters: getters.length,
    executor: executor.length,
    matrix: data.freshnessMatrix,
  }),
);
