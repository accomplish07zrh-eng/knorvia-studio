// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { createRequire } from "node:module";
import { realpath } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { BuildOptions, Metafile, OnResolveArgs, Plugin } from "esbuild";
import { SEAM_SOURCES } from "./seam-sources.js";
import type { ExecFacade } from "./public-contract.js";

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
const INJECT_PATH = resolve(HARNESS_DIR, "globals-inject.ts");
const require = createRequire(import.meta.url);
const SEAM_NAMESPACE = "closed-exec-seam";
const PURE_NODE_EXTERNALS = new Set([
  "node:buffer",
  "node:events",
  "node:path",
  "node:stream",
  "node:string_decoder",
  "node:url",
  "node:util",
]);
const RETAINED_STEMS = new Map([
  ["/network/subprocess-env", "retained:network/subprocess-env"],
  ["/device/process-probe", "retained:device/process-probe"],
  ["/device/process-probe-shared", "retained:device/process-probe-shared"],
]);

interface LoaderConfiguration {
  entry: string;
  root: string;
}

export interface BundleAudit {
  entry: string;
  externalImports: string[];
  inputs: string[];
  root: string;
}

interface BuiltTarget {
  audit: BundleAudit;
  source: string;
}

let buildCache: Promise<BuiltTarget> | undefined;
let importCounter = 0;

function isWithin(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== "..");
}

function retainedSeamFor(path: string): string | undefined {
  const normalized = path.replaceAll("\\", "/").replace(/\.(?:c|m)?[jt]s$/u, "");
  for (const [suffix, seam] of RETAINED_STEMS) {
    if (normalized.endsWith(suffix)) {
      return seam;
    }
  }
  return undefined;
}

async function canonicalApprovedSource(root: string, path: string): Promise<string> {
  const canonical = await realpath(path);
  if (!isWithin(root, canonical)) {
    throw new Error(`Candidate source escaped configured exec root: ${canonical}`);
  }
  return canonical;
}

function resolverPlugin(entry: string, root: string, injectPath: string): Plugin {
  return {
    name: "knorvia-closed-exec-loader",
    setup(build): void {
      build.onResolve({ filter: /.*/ }, async (args: OnResolveArgs) => {
        if (args.namespace === SEAM_NAMESPACE) {
          return undefined;
        }
        if ((args.pluginData as { approved?: boolean } | undefined)?.approved === true) {
          return undefined;
        }
        if (args.kind === "entry-point") {
          const requested = resolve(args.path);
          if (requested === entry || requested === injectPath) {
            return { path: requested };
          }
          throw new Error(`Unapproved bundle entry: ${requested}`);
        }
        if (Object.hasOwn(SEAM_SOURCES, args.path)) {
          return { namespace: SEAM_NAMESPACE, path: args.path };
        }
        if (PURE_NODE_EXTERNALS.has(args.path)) {
          return { external: true, path: args.path };
        }
        const importerDirectory = args.resolveDir || dirname(args.importer);
        if (args.path.startsWith(".") || isAbsolute(args.path)) {
          const lexicalPath = resolve(importerDirectory, args.path);
          const retained = retainedSeamFor(lexicalPath);
          if (retained !== undefined) {
            return { namespace: SEAM_NAMESPACE, path: retained };
          }
          if (!isWithin(root, lexicalPath) && args.importer !== injectPath) {
            throw new Error(`Candidate import escaped configured exec root: ${args.path}`);
          }
          const resolution = await build.resolve(args.path, {
            importer: args.importer,
            kind: args.kind,
            namespace: args.namespace,
            pluginData: { approved: true },
            resolveDir: importerDirectory,
          });
          if (resolution.errors.length > 0 || resolution.path.length === 0) {
            return resolution;
          }
          await canonicalApprovedSource(root, resolution.path);
          return resolution;
        }
        throw new Error(`Unapproved candidate dependency: ${args.path}`);
      });

      build.onLoad({ filter: /.*/, namespace: SEAM_NAMESPACE }, (args) => {
        const contents = SEAM_SOURCES[args.path];
        if (contents === undefined) {
          throw new Error(`Missing owned seam source: ${args.path}`);
        }
        return { contents, loader: "js" };
      });
    },
  };
}

async function auditMetafile(
  metafile: Metafile,
  configuration: LoaderConfiguration,
  entry: string,
  root: string,
): Promise<BundleAudit> {
  const inputs: string[] = [];
  for (const input of Object.keys(metafile.inputs)) {
    if (input.startsWith(`${SEAM_NAMESPACE}:`)) {
      inputs.push(input);
      continue;
    }
    const absolute = resolve(root, input);
    const canonical = await realpath(absolute);
    if (canonical === INJECT_PATH) {
      inputs.push(`${SEAM_NAMESPACE}:globals-inject`);
      continue;
    }
    if (!isWithin(root, canonical)) {
      throw new Error(`Metafile contains source outside closed boundary: ${canonical}`);
    }
    inputs.push(canonical);
  }
  const externalImports = Object.values(metafile.outputs)
    .flatMap((output) => output.imports)
    .filter((dependency) => dependency.external)
    .map((dependency) => dependency.path);
  for (const dependency of externalImports) {
    if (!PURE_NODE_EXTERNALS.has(dependency)) {
      throw new Error(`Generated bundle retained an unapproved external import: ${dependency}`);
    }
  }
  return {
    entry,
    externalImports: [...new Set(externalImports)].sort(),
    inputs: [...new Set(inputs)].sort(),
    root,
  } satisfies BundleAudit;
}

async function buildTarget(configuration: LoaderConfiguration): Promise<BuiltTarget> {
  if (!isAbsolute(configuration.entry) || !isAbsolute(configuration.root)) {
    throw new Error("Target entry and root must be absolute paths");
  }
  const root = await realpath(configuration.root);
  const entry = await canonicalApprovedSource(root, configuration.entry);
  if (extname(entry) !== ".ts" && extname(entry) !== ".js" && extname(entry) !== ".mts") {
    throw new Error(`Unsupported target entry extension: ${entry}`);
  }
  const esbuild = require("esbuild") as typeof import("esbuild");
  const options: BuildOptions = {
    absWorkingDir: root,
    bundle: true,
    entryPoints: [entry],
    format: "esm",
    inject: [INJECT_PATH],
    logLevel: "silent",
    metafile: true,
    outfile: "closed-exec-target.js",
    platform: "node",
    plugins: [resolverPlugin(entry, root, INJECT_PATH)],
    sourcemap: "inline",
    target: "node24",
    write: false,
  };
  const result = await esbuild.build(options);
  const output = result.outputFiles?.find((file) => file.path.endsWith(".js"));
  if (output === undefined || result.metafile === undefined) {
    throw new Error("Closed bundle did not produce JavaScript and a metafile");
  }
  const audit = await auditMetafile(result.metafile, configuration, entry, root);
  return { audit, source: output.text };
}

function configurationFromEnvironment(): LoaderConfiguration {
  const root =
    process.env.KNORVIA_EXEC_TARGET_ROOT ??
    fileURLToPath(new URL("../../../../src/exec/", import.meta.url));
  const entry = process.env.KNORVIA_EXEC_TARGET_ENTRY ?? resolve(root, "index.ts");
  return { entry, root };
}

export async function loadConfiguredExecFacade(): Promise<{
  audit: BundleAudit;
  facade: ExecFacade;
}> {
  buildCache ??= buildTarget(configurationFromEnvironment());
  const built = await buildCache;
  importCounter += 1;
  const encoded = Buffer.from(built.source).toString("base64");
  const module = (await import(
    `data:text/javascript;base64,${encoded}#fixture-${importCounter}`
  )) as unknown;
  return { audit: built.audit, facade: module as ExecFacade };
}

export function clearBundleCacheForSelfCheck(): void {
  buildCache = undefined;
}
