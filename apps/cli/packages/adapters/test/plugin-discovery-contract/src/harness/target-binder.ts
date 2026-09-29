// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { createRequire } from "node:module";
import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import type { BuildOptions, OnLoadArgs, OnResolveArgs, Plugin } from "esbuild";
import {
  ATOMIC_DIRECTORY_MODULE,
  CONTRACTS_MODULE,
  GITHUB_ARCHIVE_MODULE,
  HELPERS_MODULE,
  HTTP_MODULE,
  MARKETPLACE_MODULE,
  NETWORK_ENV_MODULE,
  OFFICIAL_MARKETPLACE_MODULE,
  SHARED_MODULE,
  SKILL_SCAN_MODULE,
  SOURCE_ERRORS_MODULE,
  VERSION_COMPARE_MODULE,
  ZIP_SOURCE_MODULE,
} from "./virtual-modules.js";

type EsbuildApi = typeof import("esbuild");

export type TargetModuleName =
  | "hook-sources"
  | "index"
  | "markdown-frontmatter"
  | "mcp-official-auth"
  | "mcp"
  | "plugin-components"
  | "types";

export interface BoundTarget {
  readonly exports: Record<string, unknown>;
  readonly receiptPath: string;
  readonly targetRoot: string;
}

interface BindingSelection {
  readonly binding: "candidate" | "old";
  readonly root: string;
}

const require = createRequire(import.meta.url);
const ESBUILD_ROOT = realpathSync(dirname(require.resolve("esbuild/package.json")));
const ZOD_ROOT = realpathSync(dirname(require.resolve("zod/package.json")));
const PRODUCTION_ROOT = fileURLToPath(new URL("../../../../../../../../", import.meta.url));
const DEFAULT_OLD_ROOT = fileURLToPath(new URL("../../../../src/plugins/", import.meta.url));
const DEFAULT_CANDIDATE_ROOT = DEFAULT_OLD_ROOT;

const VIRTUAL_MODULES: Readonly<Record<string, string>> = {
  "@knorvia/contracts": CONTRACTS_MODULE,
  "@knorvia/shared": SHARED_MODULE,
  "retained:atomic-directory": ATOMIC_DIRECTORY_MODULE,
  "retained:github-archive-source": GITHUB_ARCHIVE_MODULE,
  "retained:helpers": HELPERS_MODULE,
  "retained:http": HTTP_MODULE,
  "retained:marketplace": MARKETPLACE_MODULE,
  "retained:network-env": NETWORK_ENV_MODULE,
  "retained:official-marketplace": OFFICIAL_MARKETPLACE_MODULE,
  "retained:skill-scan": SKILL_SCAN_MODULE,
  "retained:source-errors": SOURCE_ERRORS_MODULE,
  "retained:version-compare": VERSION_COMPARE_MODULE,
  "retained:zip-source": ZIP_SOURCE_MODULE,
};

const RETAINED_BASENAMES: Readonly<Record<string, string>> = {
  "atomic-directory.js": "retained:atomic-directory",
  "github-archive-source.js": "retained:github-archive-source",
  "helpers.js": "retained:helpers",
  "marketplace.js": "retained:marketplace",
  "official-marketplace.js": "retained:official-marketplace",
  "source-errors.js": "retained:source-errors",
  "version-compare.js": "retained:version-compare",
  "zip-source.js": "retained:zip-source",
};

function selectBinding(): BindingSelection {
  const binding = process.env.KNORVIA_PLUGIN_DISCOVERY_BINDING ?? "candidate";
  if (binding !== "old" && binding !== "candidate") {
    throw new Error("Set KNORVIA_PLUGIN_DISCOVERY_BINDING to old or candidate");
  }
  const variable =
    binding === "old"
      ? "KNORVIA_PLUGIN_DISCOVERY_OLD_ROOT"
      : "KNORVIA_PLUGIN_DISCOVERY_CANDIDATE_ROOT";
  const fallback = binding === "old" ? DEFAULT_OLD_ROOT : DEFAULT_CANDIDATE_ROOT;
  const root = resolve(process.env[variable] ?? fallback);
  if (!existsSync(root)) {
    throw new Error(`${variable} does not exist: ${root}`);
  }
  return { binding, root: realpathSync(root) };
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function resolveTargetFile(importer: string, specifier: string, targetRoot: string): string {
  const base = resolve(dirname(importer), specifier);
  const candidates = [
    base,
    extname(base) === ".js" ? `${base.slice(0, -3)}.ts` : `${base}.ts`,
    join(base, "index.ts"),
  ];
  const match = candidates.find((candidate) => existsSync(candidate));
  if (match === undefined) {
    throw new Error(`Unresolved target-relative import ${specifier} from ${importer}`);
  }
  const canonical = realpathSync(match);
  if (!isInside(targetRoot, canonical)) {
    throw new Error(`Target-relative import escapes selected root: ${specifier} -> ${canonical}`);
  }
  return canonical;
}

function retainedSpecifier(args: OnResolveArgs): string | undefined {
  const normalized = args.path.replaceAll("\\", "/");
  if (normalized.endsWith("/skills/scan.js")) return "retained:skill-scan";
  if (normalized.endsWith("/http/index.js")) return "retained:http";
  if (normalized.endsWith("/network/subprocess-env.js")) return "retained:network-env";
  const basename = normalized.slice(normalized.lastIndexOf("/") + 1);
  return RETAINED_BASENAMES[basename];
}

function closedLoader(targetRoot: string): Plugin {
  const zodEntry = require.resolve(ZOD_ROOT);
  return {
    name: "knorvia-plugin-discovery-closed-loader",
    setup(build): void {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === "entry-point") return { path: resolve(args.path) };
        if (args.path.startsWith("node:")) return { external: true, path: args.path };
        if (Object.hasOwn(VIRTUAL_MODULES, args.path))
          return { namespace: "test-port", path: args.path };
        const retained = retainedSpecifier(args);
        if (retained !== undefined) return { namespace: "test-port", path: retained };
        if (args.path === "zod") return { path: zodEntry };
        if (args.path.startsWith(".") && args.importer !== "") {
          return { path: resolveTargetFile(args.importer, args.path, targetRoot) };
        }
        throw new Error(
          `Closed loader rejected undeclared import '${args.path}' from '${args.importer}'`,
        );
      });
      build.onLoad({ filter: /.*/, namespace: "test-port" }, (args: OnLoadArgs) => {
        const contents = VIRTUAL_MODULES[args.path];
        if (contents === undefined) throw new Error(`Missing virtual module: ${args.path}`);
        return { contents, loader: "js" };
      });
    },
  };
}

function assertMetafileBoundary(inputs: readonly string[], targetRoot: string): void {
  for (const input of inputs) {
    if (input.startsWith("test-port:")) continue;
    const absolute = resolve(input);
    if (isInside(targetRoot, absolute)) continue;
    if (isInside(ESBUILD_ROOT, absolute) || isInside(ZOD_ROOT, absolute)) continue;
    if (isInside(PRODUCTION_ROOT, absolute)) {
      throw new Error(`Metafile includes undeclared production source: ${absolute}`);
    }
    throw new Error(`Metafile includes undeclared source: ${absolute}`);
  }
}

export async function bindTarget(moduleName: TargetModuleName): Promise<BoundTarget> {
  const selection = selectBinding();
  const sourceEntry = join(selection.root, `${moduleName}.ts`);
  const entry = existsSync(sourceEntry) ? sourceEntry : join(selection.root, `${moduleName}.js`);
  if (!existsSync(entry)) throw new Error(`Selected public target is missing: ${entry}`);

  const esbuild = require(ESBUILD_ROOT) as EsbuildApi;
  const artifactRoot = resolve(
    process.env.KNORVIA_PLUGIN_DISCOVERY_ARTIFACT_DIR ??
      join(tmpdir(), "knorvia-plugin-discovery-test-artifacts", selection.binding),
  );
  mkdirSync(artifactRoot, { recursive: true });
  const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const outfile = join(artifactRoot, `${moduleName}-${nonce}.mjs`);
  const options: BuildOptions = {
    bundle: true,
    entryPoints: [entry],
    format: "esm",
    logLevel: "silent",
    metafile: true,
    outfile,
    platform: "node",
    plugins: [closedLoader(selection.root)],
    sourcemap: false,
    target: "node24",
    treeShaking: true,
    write: true,
  };
  const result = await esbuild.build(options);
  if (result.metafile === undefined)
    throw new Error("esbuild did not return the required metafile");
  const inputs = Object.keys(result.metafile.inputs).sort();
  assertMetafileBoundary(inputs, selection.root);

  const receiptPath = join(artifactRoot, `${moduleName}-${nonce}.metafile.json`);
  writeFileSync(
    receiptPath,
    `${JSON.stringify({ binding: selection.binding, entry, inputs, metafile: result.metafile }, null, 2)}\n`,
    "utf8",
  );
  const loaded: unknown = await import(`${pathToFileURL(outfile).href}?binding=${nonce}`);
  if (loaded === null || typeof loaded !== "object")
    throw new Error(`Invalid module namespace for ${moduleName}`);
  return { exports: loaded as Record<string, unknown>, receiptPath, targetRoot: selection.root };
}
