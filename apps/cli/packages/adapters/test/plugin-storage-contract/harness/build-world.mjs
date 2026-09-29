// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { createHash } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const harnessDirectory = dirname(fileURLToPath(import.meta.url));
export const contractRoot = resolve(harnessDirectory, "..");
export const defaultAdapterRoot = resolve(contractRoot, "../..");
export const defaultCliRoot = resolve(defaultAdapterRoot, "../..");
export const defaultRepoRoot = resolve(defaultCliRoot, "../..");
const seamsDirectory = resolve(contractRoot, "seams");
export const contractSchema = JSON.parse(
  await readFile(resolve(contractRoot, "contract-schema.json"), "utf8"),
);

export const FACADE_BASENAMES = Object.freeze([...contractSchema.facades]);

const seamAliases = new Map([
  ["@knorvia/contracts", "contracts.mjs"],
  ["@knorvia/shared", "shared.mjs"],
  ["semver", null],
  ["yauzl", "yauzl.mjs"],
  ["node:fs", "fs.mjs"],
  ["fs", "fs.mjs"],
  ["node:fs/promises", "fs-promises.mjs"],
  ["fs/promises", "fs-promises.mjs"],
  ["node:child_process", "child-process.mjs"],
  ["child_process", "child-process.mjs"],
  ["node:process", "process.mjs"],
  ["process", "process.mjs"],
  ["node:crypto", "crypto.mjs"],
  ["crypto", "crypto.mjs"],
  ["node:os", "os.mjs"],
  ["os", "os.mjs"],
  ["node:timers", "timers.mjs"],
  ["timers", "timers.mjs"],
]);

const allowedExternalBuiltins = new Set([
  "node:assert",
  "node:buffer",
  "node:events",
  "node:path",
  "node:stream",
  "node:url",
  "node:util",
]);

const ownedSeamNativeBuiltins = new Set([
  ...allowedExternalBuiltins,
  "node:child_process",
  "node:crypto",
  "node:fs",
  "node:fs/promises",
  "node:os",
  "node:process",
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isInside(root, path) {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

async function packageRecord(requireFromAnchor, request, expectedName, expectedVersion) {
  const packagePath = await realpath(requireFromAnchor.resolve(`${request}/package.json`));
  const bytes = await readFile(packagePath);
  const metadata = JSON.parse(bytes.toString("utf8"));
  if (metadata.name !== expectedName || metadata.version !== expectedVersion) {
    throw new Error(
      `Contract requires ${expectedName}@${expectedVersion}; resolved ${metadata.name}@${metadata.version}`,
    );
  }
  return {
    metadata,
    packagePath,
    packageSha256: sha256(bytes),
  };
}

async function resolveToolchain({ repoRoot, adapterRoot }) {
  const cliAnchor = resolve(repoRoot, "apps/cli/package.json");
  const adapterAnchor = resolve(adapterRoot, "package.json");
  const requireFromCli = createRequire(cliAnchor);
  const requireFromAdapter = createRequire(adapterAnchor);

  const esbuildPackage = await packageRecord(
    requireFromCli,
    "esbuild",
    "esbuild",
    contractSchema.packageVersions.esbuild,
  );
  const esbuildEntry = await realpath(requireFromCli.resolve("esbuild"));
  const esbuildEntryBytes = await readFile(esbuildEntry);

  const semverPackage = await packageRecord(
    requireFromAdapter,
    "semver",
    "semver",
    contractSchema.packageVersions.semver,
  );
  const semverEntry = await realpath(requireFromAdapter.resolve("semver"));

  return {
    esbuild: {
      anchor: cliAnchor,
      entryPath: esbuildEntry,
      entrySha256: sha256(esbuildEntryBytes),
      packagePath: esbuildPackage.packagePath,
      packageSha256: esbuildPackage.packageSha256,
      requireFromAnchor: requireFromCli,
      version: esbuildPackage.metadata.version,
    },
    semver: {
      anchor: adapterAnchor,
      entryPath: semverEntry,
      packagePath: semverPackage.packagePath,
      packageSha256: semverPackage.packageSha256,
      root: dirname(semverPackage.packagePath),
      version: semverPackage.metadata.version,
    },
  };
}

async function selectEntries(moduleRoot, extension) {
  const selected = new Map();
  for (const name of FACADE_BASENAMES) {
    const candidate = resolve(moduleRoot, `${name}.${extension}`);
    let entry;
    try {
      entry = await realpath(candidate);
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new Error(
          `Missing ${extension} facade ${name} in ${moduleRoot}; target fallback is forbidden`,
        );
      }
      throw error;
    }
    if (!isInside(moduleRoot, entry)) {
      throw new Error(`Facade ${name} escapes the selected module root`);
    }
    selected.set(name, entry);
  }
  return selected;
}

function worldEntrySource(entries) {
  const imports = [];
  const properties = [];
  let index = 0;
  for (const [name, path] of entries) {
    const binding = `facade${index++}`;
    imports.push(`import * as ${binding} from ${JSON.stringify(path)};`);
    properties.push(`${JSON.stringify(name)}: ${binding}`);
  }
  return `${imports.join("\n")}\nexport const facades = Object.freeze({${properties.join(",")}});\n`;
}

function ownedSeamPlugin(semverEntry, moduleRoot) {
  return {
    name: "knorvia-owned-seams",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        const normalizedImporter = args.importer ? resolve(args.importer) : "";
        const importedBuiltin = args.path.startsWith("node:") ? args.path : `node:${args.path}`;
        if (
          normalizedImporter &&
          isInside(seamsDirectory, normalizedImporter) &&
          ownedSeamNativeBuiltins.has(importedBuiltin)
        ) {
          return { path: importedBuiltin, external: true };
        }
        const direct = seamAliases.get(args.path);
        if (args.path === "semver") return { path: semverEntry };
        if (direct) return { path: resolve(seamsDirectory, direct) };
        if (/(?:^|\/)skills\/scan\.js$/u.test(args.path)) {
          return { path: resolve(seamsDirectory, "scan.mjs") };
        }
        if (/(?:^|\/)http\/index\.js$/u.test(args.path)) {
          return { path: resolve(seamsDirectory, "http.mjs") };
        }
        if (/(?:^|\/)network\/subprocess-env\.js$/u.test(args.path)) {
          return { path: resolve(seamsDirectory, "network-env.mjs") };
        }
        if (
          isInside(moduleRoot, normalizedImporter) &&
          /(?:^|\/)plugin-components\.js$/u.test(args.path)
        ) {
          return { path: resolve(seamsDirectory, "plugin-components.mjs") };
        }
        if (isInside(moduleRoot, normalizedImporter) && /(?:^|\/)mcp\.js$/u.test(args.path)) {
          return { path: resolve(seamsDirectory, "mcp.mjs") };
        }
        if (args.path.startsWith("@knorvia/")) {
          return { errors: [{ text: `Undeclared Knorvia runtime dependency: ${args.path}` }] };
        }
        if (args.path.startsWith("node:") || allowedExternalBuiltins.has(importedBuiltin)) {
          const normalized = args.path.startsWith("node:") ? args.path : importedBuiltin;
          if (!allowedExternalBuiltins.has(normalized)) {
            return { errors: [{ text: `Unapproved Node runtime dependency: ${args.path}` }] };
          }
          return { path: normalized, external: true };
        }
        return null;
      });
    },
  };
}

async function canonicalInputPath(inputKey, moduleRoot) {
  if (inputKey.startsWith("knorvia-world:")) return inputKey;
  const candidate = isAbsolute(inputKey) ? inputKey : resolve(moduleRoot, inputKey);
  return realpath(candidate);
}

async function verifyGraph({ metafile, moduleRoot, semverRoot }) {
  const canonicalContractRoot = await realpath(contractRoot);
  const canonicalSemverRoot = await realpath(semverRoot);
  const inputs = [];
  for (const [inputKey, metadata] of Object.entries(metafile.inputs)) {
    if (inputKey.startsWith("knorvia-world:")) {
      inputs.push({ path: inputKey, kind: "synthetic-world", bytes: metadata.bytes });
      continue;
    }
    const path = await canonicalInputPath(inputKey, moduleRoot);
    let kind;
    if (isInside(moduleRoot, path)) kind = "selected-module-root";
    else if (isInside(canonicalContractRoot, path)) kind = "owned-test-seam";
    else if (isInside(canonicalSemverRoot, path)) kind = "approved-semver";
    else throw new Error(`Metafile input escapes the closed graph: ${path}`);

    const bytes = await readFile(path);
    inputs.push({ path, kind, bytes: bytes.byteLength, sha256: sha256(bytes) });
    const externalAllowlist =
      kind === "owned-test-seam" ? ownedSeamNativeBuiltins : allowedExternalBuiltins;
    for (const imported of metadata.imports ?? []) {
      if (imported.external && !externalAllowlist.has(imported.path)) {
        throw new Error(`Unapproved external import ${imported.path} from ${path}`);
      }
    }
  }
  return inputs.sort((left, right) => left.path.localeCompare(right.path));
}

function verifyRuntimeModuleSet(graphInputs, extension) {
  const actual = graphInputs
    .filter((entry) => entry.kind === "selected-module-root")
    .map((entry) => basename(entry.path, `.${extension}`))
    .sort();
  const expected = [...contractSchema.runtimeModules].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const missing = expected.filter((name) => !actual.includes(name));
    const extra = actual.filter((name) => !expected.includes(name));
    throw new Error(
      `Runtime module graph mismatch: missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)}`,
    );
  }
  return actual;
}

export async function buildWorld({
  adapterRoot = defaultAdapterRoot,
  graphLedgerPath,
  metafilePath,
  moduleRoot: requestedRoot,
  outputPath,
  repoRoot = defaultRepoRoot,
  target,
  validateRuntimeModules = true,
}) {
  if (!requestedRoot || !isAbsolute(requestedRoot)) {
    throw new Error("moduleRoot must be an absolute path");
  }
  const extension = contractSchema.targets[target]?.extension;
  if (!extension) throw new Error(`Unknown contract target: ${target}`);

  const moduleRoot = await realpath(requestedRoot);
  const entries = await selectEntries(moduleRoot, extension);
  const toolchain = await resolveToolchain({
    repoRoot: resolve(repoRoot),
    adapterRoot: resolve(adapterRoot),
  });
  const esbuild = toolchain.esbuild.requireFromAnchor(toolchain.esbuild.entryPath);
  const result = await esbuild.build({
    absWorkingDir: moduleRoot,
    bundle: true,
    format: "esm",
    logLevel: "silent",
    metafile: true,
    outfile: "world.mjs",
    platform: "node",
    plugins: [ownedSeamPlugin(toolchain.semver.entryPath, moduleRoot)],
    sourcemap: false,
    stdin: {
      contents: worldEntrySource(entries),
      loader: "js",
      resolveDir: moduleRoot,
      sourcefile: "knorvia-world:entry",
    },
    target: "node24",
    treeShaking: false,
    write: false,
  });
  const graphInputs = await verifyGraph({
    metafile: result.metafile,
    moduleRoot,
    semverRoot: toolchain.semver.root,
  });
  const runtimeModules = validateRuntimeModules
    ? verifyRuntimeModuleSet(graphInputs, extension)
    : undefined;
  if (result.outputFiles.length !== 1) {
    throw new Error(`Expected one bundled output, received ${result.outputFiles.length}`);
  }
  const output = result.outputFiles[0].contents;
  await writeFile(outputPath, output);
  await writeFile(metafilePath, `${JSON.stringify(result.metafile, null, 2)}\n`);
  const ledger = {
    version: 1,
    target,
    moduleRoot,
    extension,
    entries: Object.fromEntries(entries),
    runtimeModules,
    graphInputs,
    graphBoundaryViolations: 0,
    output: { path: resolve(outputPath), bytes: output.byteLength, sha256: sha256(output) },
    toolchain: {
      esbuild: {
        anchor: toolchain.esbuild.anchor,
        packagePath: toolchain.esbuild.packagePath,
        packageSha256: toolchain.esbuild.packageSha256,
        entryPath: toolchain.esbuild.entryPath,
        entrySha256: toolchain.esbuild.entrySha256,
        version: toolchain.esbuild.version,
      },
      semver: {
        anchor: toolchain.semver.anchor,
        packagePath: toolchain.semver.packagePath,
        packageSha256: toolchain.semver.packageSha256,
        entryPath: toolchain.semver.entryPath,
        version: toolchain.semver.version,
      },
    },
  };
  await writeFile(graphLedgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  return ledger;
}
