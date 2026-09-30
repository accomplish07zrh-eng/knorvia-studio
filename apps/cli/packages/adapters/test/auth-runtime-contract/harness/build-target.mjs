// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUITE_ROOT = path.dirname(HERE);

function inside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

function resolveInput(absWorkingDir, input) {
  if (input.startsWith("<") || input.startsWith("node:")) return input;
  return path.isAbsolute(input) ? input : path.resolve(absWorkingDir, input);
}

export async function buildTarget({ mode, outDir, repoRoot, toolingRoot }) {
  if (mode !== "source" && mode !== "dist") throw new Error(`Unsupported mode: ${mode}`);
  const adaptersRoot = path.join(repoRoot, "apps", "cli", "packages", "adapters");
  const authRoot = path.join(adaptersRoot, mode === "source" ? "src" : "dist", "auth");
  const entry = path.join(authRoot, mode === "source" ? "index.ts" : "index.js");
  const output = path.join(outDir, `auth-${mode}.mjs`);
  await mkdir(outDir, { recursive: true });
  const requireFromTooling = createRequire(path.join(toolingRoot, "package.json"));
  const esbuild = requireFromTooling("esbuild");
  const aliases = new Map([
    ["node:http", path.join(HERE, "fake-http.mjs")],
    ["node:os", path.join(HERE, "fake-os.mjs")],
    ["@knorvia/shared/node", path.join(HERE, "shared-persistence-port.mjs")],
  ]);
  const resolutions = [];
  const seamPlugin = {
    name: "knorvia-auth-owned-ports",
    setup(build) {
      build.onResolve({ filter: /^(?:node:http|node:os|@knorvia\/shared\/node)$/ }, (args) => {
        const replacement = aliases.get(args.path);
        resolutions.push({ importer: args.importer, requested: args.path, replacement });
        return { path: replacement };
      });
    },
  };
  const result = await esbuild.build({
    absWorkingDir: repoRoot,
    bundle: true,
    entryPoints: [entry],
    format: "esm",
    legalComments: "none",
    logLevel: "silent",
    metafile: true,
    outfile: output,
    packages: "bundle",
    platform: "node",
    plugins: [seamPlugin],
    sourcemap: "inline",
    target: "node24",
    treeShaking: true,
  });
  const inputs = Object.keys(result.metafile.inputs).map((input) => resolveInput(repoRoot, input));
  const targetReal = await realpath(authRoot);
  const harnessReal = await realpath(HERE);
  const inputBindings = [];
  for (const input of inputs) {
    const resolved = await realpath(input);
    const isProduct = inside(targetReal, resolved);
    if (!isProduct && !inside(harnessReal, resolved))
      throw new Error(`Undeclared auth input: ${resolved}`);
    if (isProduct && !resolved.endsWith(mode === "source" ? ".ts" : ".js")) {
      throw new Error(`Wrong auth target mode: ${resolved}`);
    }
    const bytes = await readFile(resolved);
    inputBindings.push({
      path: resolved,
      owner: isProduct ? "auth-target" : "owned-harness",
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  const requiredSeams = new Set(["node:http", "node:os", "@knorvia/shared/node"]);
  for (const requested of resolutions.map((item) => item.requested))
    requiredSeams.delete(requested);
  if (requiredSeams.size)
    throw new Error(`Missing required auth seams: ${[...requiredSeams].join(", ")}`);
  const graph = {
    schemaVersion: 1,
    entry,
    mode,
    moduleUrl: pathToFileURL(output).href,
    sourceOwnership: {
      productBoundary: authRoot,
      retainedDependencyPorts: [...aliases.keys()],
      testSeams: [...aliases.values()],
    },
    resolutions,
    inputBindings,
    unresolvedOptionalSeams: [...requiredSeams],
    esbuildMetafile: result.metafile,
    warnings: result.warnings,
  };
  return { graph, moduleUrl: graph.moduleUrl, output };
}

export const BUILD_HARNESS_PATHS = Object.freeze({ HERE, SUITE_ROOT });
