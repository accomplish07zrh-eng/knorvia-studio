// Explicit synthetic capture; final tests never regenerate old observations.
import { writeFile } from "node:fs/promises";
import { directCases, getterCases } from "./webfetch-orchestration-cases.js";
import {
  declaration,
  handlerModule,
  microtaskObservation,
  observe,
  publicDeclaration,
} from "./webfetch-orchestration-fixture.js";
import {
  cacheMatrix,
  executorCases,
  observeExecutor,
  permissions,
  registryObservation,
  registryVariants,
} from "./webfetch-orchestration-consumer-fixture.js";
const target = process.argv[2];
if (!target) throw new Error("Provide an explicit synthetic WebFetch capture path");
const direct = [],
  getters = [],
  executor = [],
  microtasks = [];
for (const c of directCases) direct.push({ label: c.label, observed: await observe(c) });
for (const p of getterCases)
  getters.push({ ...p, observed: await observe({ label: "getter" }, p) });
for (const c of executorCases)
  executor.push({ label: c.label, observed: await observeExecutor(c) });
// Global synthetic clocks are intentionally serial, never shared across observations.
for (const hit of [false, true]) microtasks.push(await microtaskObservation(hit));
const data = {
  exports: Object.keys(handlerModule),
  publicDeclaration,
  declaration: declaration(),
  direct,
  getters,
  executor,
  permissions: permissions(),
  registry: registryVariants.map(registryObservation),
  cacheMatrix: await cacheMatrix(),
  microtasks,
};
await writeFile(target, JSON.stringify(data, null, 2) + "\n");
console.log(
  JSON.stringify({
    direct: direct.length,
    getters: getters.length,
    executor: executor.length,
    permissions: data.permissions.length,
    matrix: data.cacheMatrix,
  }),
);
