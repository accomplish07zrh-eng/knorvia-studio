// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cases, casesById } from "../cases/registry.mjs";
import { parseArguments } from "../harness/arguments.mjs";
import {
  buildWorld,
  contractRoot,
  contractSchema,
  defaultRepoRoot,
  FACADE_BASENAMES,
} from "../harness/build-world.mjs";
import { runDeclarationProbe } from "./check-declaration-probe.mjs";

async function collect(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink is forbidden in contract tree: ${path}`);
    if (entry.isDirectory()) files.push(...(await collect(path)));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`Unexpected contract tree entry: ${path}`);
  }
  return files;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with ${result.status}\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
  return result;
}

const args = parseArguments(process.argv.slice(2));
const repoRoot = resolve(
  typeof args["repo-root"] === "string" ? args["repo-root"] : defaultRepoRoot,
);
const adapterRoot = resolve(repoRoot, "apps/cli/packages/adapters");
const outputRoot = resolve(
  typeof args["output-root"] === "string"
    ? args["output-root"]
    : resolve(contractRoot, "static-artifacts"),
);
if (!isAbsolute(outputRoot)) throw new Error("Static output root must be absolute");
await mkdir(outputRoot, { recursive: true });

if (process.version !== contractSchema.nodeVersion) {
  throw new Error(
    `Static check requires ${contractSchema.nodeVersion}; received ${process.version}`,
  );
}
if (cases.length !== contractSchema.caseCounts.executable) {
  throw new Error(
    `Expected ${contractSchema.caseCounts.executable} cases; received ${cases.length}`,
  );
}
if (casesById.size !== cases.length) throw new Error("Duplicate contract case ID");
if (cases.some((item) => "requiredOldFailure" in item || "policy" in item)) {
  throw new Error("Permanent contract cases must not expose legacy-failure admission metadata");
}

const coverage = JSON.parse(
  await readFile(resolve(contractRoot, "fixtures/matrix-coverage.json"), "utf8"),
);
if (coverage.requiredCaseIds.length !== contractSchema.caseCounts.requiredMatrix) {
  throw new Error("Required matrix case count mismatch");
}
if (Object.hasOwn(coverage, "requiredOldFailureIds")) {
  throw new Error("Permanent matrix must not contain old-failure exemptions");
}
for (const id of coverage.requiredCaseIds) {
  if (!casesById.has(id)) throw new Error(`Missing required matrix case ${id}`);
}

const contractModules = [...contractSchema.contractModules].sort();
const runtimeModules = [...contractSchema.runtimeModules].sort();
const pureTypeModules = [...contractSchema.pureTypeModules].sort();
if (contractModules.length !== 33 || runtimeModules.length !== 32 || pureTypeModules.length !== 1) {
  throw new Error("Contract module partition must be 33 source / 32 runtime / 1 pure type");
}
if (
  JSON.stringify([...new Set([...runtimeModules, ...pureTypeModules])].sort()) !==
  JSON.stringify(contractModules)
) {
  throw new Error("Runtime and pure-type modules do not partition the contract module set");
}
if (FACADE_BASENAMES.length !== 8) throw new Error("Expected eight public facades");
if (contractSchema.timeoutsMs.workerDefault !== 15000)
  throw new Error("Worker default timeout changed");
if (contractSchema.timeoutsMs.targetOuter !== 1800000)
  throw new Error("Target outer timeout changed");
if (contractSchema.targets.dist.fallback !== null)
  throw new Error("Dist fallback must remain disabled");

const allFiles = await collect(contractRoot);
const mjsFiles = allFiles.filter((path) => extname(path) === ".mjs");
for (const path of mjsFiles) run(process.execPath, ["--check", path]);
const forbiddenPortablePath = new RegExp(
  [
    "D:[\\\\/]" + "tools",
    "tools" + "\\.cache",
    "knorvia-plugin-storage-" + "(?:acceptance|rebuild)",
    "parallel-plugins-" + "contract",
  ].join("|"),
  "iu",
);
for (const path of allFiles.filter((value) => /\.(?:mjs|ts|json|md)$/u.test(value))) {
  const source = await readFile(path, "utf8");
  if (forbiddenPortablePath.test(source)) {
    throw new Error(`Machine-specific or acceptance-only path in portable tree: ${path}`);
  }
  if (/from\s+["'](?:node:)?(?:http|https|net|tls|dns|undici)["']/u.test(source)) {
    throw new Error(`Real network module import is forbidden: ${path}`);
  }
}

const immediateEntry = resolve(contractRoot, "../plugin-storage-contract.test.ts");
const immediateSource = await readFile(immediateEntry, "utf8");
const topLevelGroups =
  immediateSource.match(/^test\("plugin storage (?:source|CLI dist) contract \(249 cases\)"/gmu) ??
  [];
if (topLevelGroups.length !== 2)
  throw new Error("Expected exactly two top-level Node contract groups");

const requireFromRepo = createRequire(resolve(repoRoot, "package.json"));
const typescriptPackagePath = await realpath(requireFromRepo.resolve("typescript/package.json"));
const typescriptMetadata = JSON.parse(await readFile(typescriptPackagePath, "utf8"));
if (typescriptMetadata.version !== contractSchema.packageVersions.typescript) {
  throw new Error(`Unexpected TypeScript version ${typescriptMetadata.version}`);
}
const tscPath = await realpath(resolve(dirname(typescriptPackagePath), typescriptMetadata.bin.tsc));
run(
  process.execPath,
  [
    tscPath,
    "--project",
    resolve(contractRoot, "tsconfig.integration.json"),
    "--pretty",
    "false",
    "--typeRoots",
    resolve(repoRoot, "node_modules/@types"),
  ],
  {
    cwd: contractRoot,
    env: {
      NODE_PATH: "",
      PATH: dirname(process.execPath),
      SystemRoot: process.env.SystemRoot ?? "",
    },
  },
);

const declaration = await runDeclarationProbe({ outputRoot, repoRoot });
const smokeRoot = await realpath(resolve(contractRoot, "fixtures/loader-smoke"));
const smokeArtifactRoot = resolve(outputRoot, "loader-smoke");
await mkdir(smokeArtifactRoot, { recursive: true });
const smokeLedger = await buildWorld({
  adapterRoot,
  graphLedgerPath: resolve(smokeArtifactRoot, "graph-ledger.json"),
  metafilePath: resolve(smokeArtifactRoot, "metafile.json"),
  moduleRoot: smokeRoot,
  outputPath: resolve(smokeArtifactRoot, "world.mjs"),
  repoRoot,
  target: "dist",
  validateRuntimeModules: false,
});
globalThis[Symbol.for("knorvia.pluginStorage.testWorld")] = {
  config: {},
  counters: { io: {}, timer: 0, uuid: 0 },
  events: [],
  observations: [],
  runRoot: smokeArtifactRoot,
  scripts: { clock: [], git: [], http: [], uuid: [] },
};
const smoke = await import(
  `${pathToFileURL(resolve(smokeArtifactRoot, "world.mjs")).href}?portable-static-check=1`
);
const identities = FACADE_BASENAMES.map((name) => smoke.facades[name].sharedIdentity);
if (!identities.every((identity) => identity === identities[0])) {
  throw new Error("Single bundled world did not preserve shared module identity");
}
if (Object.keys(smoke.facades).length !== 8)
  throw new Error("Loader smoke did not expose eight facades");

console.log(
  JSON.stringify({
    cases: cases.length,
    requiredMatrixCases: coverage.requiredCaseIds.length,
    legacyFailureAdmission: false,
    topLevelNodeGroups: 2,
    casesPerGroup: cases.length,
    declarationCompiler: `${declaration.compiler.name}@${declaration.compiler.version}`,
    publicDeclarations: declaration.publicDeclarations.length,
    loaderSmokeGraphInputs: smokeLedger.graphInputs.length,
    facadeCount: FACADE_BASENAMES.length,
    contractModules: contractModules.length,
    runtimeModules: runtimeModules.length,
    pureTypeModules,
    status: "ok",
  }),
);
