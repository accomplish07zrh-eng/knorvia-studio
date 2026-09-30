// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { appendFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { BuildOptions, Metafile, OnResolveArgs, OnResolveResult, Plugin } from "esbuild";
import {
  CONTROLLED_NODE_BUILTINS,
  PURE_NODE_BUILTINS,
  RETAINED_PACKAGES,
  RETAINED_RELATIVE_SUFFIXES,
} from "./allowed-dependencies.js";
import {
  EVIDENCE_ROOT,
  METAFILE_EVIDENCE_ENV,
  REPO_PACKAGE_JSON,
  SEAM_SYMBOL_KEY,
  SUITE_ROOT,
  TARGET_ENV,
  TARGET_KIND,
  TARGET_MODULES,
} from "./constants.js";
import type { TargetModuleName } from "./constants.js";
import { virtualModuleSource } from "./virtual-modules.js";

const requireFromRepository = createRequire(pathToFileURL(REPO_PACKAGE_JSON));
const esbuild = requireFromRepository("esbuild") as typeof import("esbuild");
const extensions =
  TARGET_KIND === "source"
    ? ([".ts", ".mts", ".cts"] as const)
    : ([".js", ".mjs", ".cjs"] as const);
const dispatcherEntry = "knorvia-model-contract-dispatcher";
const dispatcherNamespace = "owned-target-dispatcher";
const dispatcherOutput = path.join(EVIDENCE_ROOT, ".contract-target-dispatcher.mjs");
let boundTargetRoot: string | undefined;
let graphNonce = 0;
let metafileSequence = 0;
const dispatcherBySeam = new WeakMap<object, Promise<TargetDispatcher>>();

interface BoundTargetEntry {
  readonly name: TargetModuleName;
  readonly path: string;
}

type TargetDispatcher = Readonly<Record<TargetModuleName, object>>;

export async function loadTargetModule<T extends object>(name: TargetModuleName): Promise<T> {
  if (!TARGET_MODULES.includes(name)) throw new Error(`Unknown target module: ${name}`);
  const seam = activeSeam();
  let pending = dispatcherBySeam.get(seam);
  if (pending === undefined) {
    pending = loadTargetDispatcher(seam);
    dispatcherBySeam.set(seam, pending);
  }
  const dispatcher = await pending;
  const loaded = dispatcher[name];
  if (loaded === undefined) throw new Error(`Dispatcher omitted target module: ${name}`);
  return loaded as T;
}

async function loadTargetDispatcher(seam: object): Promise<TargetDispatcher> {
  const root = await targetRoot();
  const entries = await Promise.all(
    TARGET_MODULES.map(
      async (name): Promise<BoundTargetEntry> => ({
        name,
        path: await findEntry(root, name),
      }),
    ),
  );
  graphNonce += 1;
  const graphId = graphNonce;
  const graphSeamKey = `${SEAM_SYMBOL_KEY}.graph.${graphId}`;
  const plugin = closedTargetPlugin(root, entries, graphSeamKey);
  const options: BuildOptions = {
    absWorkingDir: SUITE_ROOT,
    banner: { js: targetBanner(graphSeamKey) },
    bundle: true,
    entryPoints: [dispatcherEntry],
    format: "esm",
    logLevel: "silent",
    metafile: true,
    outfile: dispatcherOutput,
    platform: "node",
    plugins: [plugin],
    sourcemap: false,
    target: "node24",
    write: false,
  };
  const result = await esbuild.build(options);
  if (result.metafile === undefined) throw new Error("Target build did not produce a metafile");
  try {
    await validateMetafile(result.metafile, root, entries);
  } catch (error) {
    await writeMetafileEvidence(result.metafile, root, entries, graphId, error);
    throw error;
  }
  await writeMetafileEvidence(result.metafile, root, entries, graphId);
  const outputs = result.outputFiles ?? [];
  const matchingOutputs = outputs.filter((output) =>
    samePath(path.resolve(output.path), path.resolve(dispatcherOutput)),
  );
  if (outputs.length !== 1 || matchingOutputs.length !== 1) {
    throw new Error("Target graph build must produce its one fixed in-memory dispatcher output");
  }
  const graphSymbol = Symbol.for(graphSeamKey);
  if (Reflect.has(globalThis, graphSymbol)) throw new Error("Graph seam symbol was already bound");
  if (!Reflect.set(globalThis, graphSymbol, seam))
    throw new Error("Could not bind graph seam symbol");
  let imported: unknown;
  let evaluationError: unknown;
  let evaluationFailed = false;
  let removedGraphSymbol = false;
  try {
    const output = matchingOutputs[0];
    if (output === undefined) throw new Error("Fixed dispatcher output disappeared");
    const encoded = Buffer.from(`${output.text}\n// contract-graph-${graphId}`).toString("base64");
    imported = await import(`data:text/javascript;base64,${encoded}`);
  } catch (error) {
    evaluationFailed = true;
    evaluationError = error;
  } finally {
    removedGraphSymbol = Reflect.deleteProperty(globalThis, graphSymbol);
  }
  if (!removedGraphSymbol) throw new Error("Could not remove temporary graph seam symbol");
  if (evaluationFailed) throw evaluationError;
  if (typeof imported !== "object" || imported === null) {
    throw new Error("Target dispatcher import was not a module namespace");
  }
  const modules: unknown = Reflect.get(imported, "targetModules");
  if (typeof modules !== "object" || modules === null) {
    throw new Error("Target dispatcher did not expose its module map");
  }
  for (const entry of entries) {
    if (typeof Reflect.get(modules, entry.name) !== "object") {
      throw new Error(`Target dispatcher omitted namespace: ${entry.name}`);
    }
  }
  return modules as TargetDispatcher;
}

function activeSeam(): object {
  const seam: unknown = Reflect.get(globalThis, Symbol.for(SEAM_SYMBOL_KEY));
  if (typeof seam !== "object" || seam === null) {
    throw new Error("Target loader requires one active owned fixture seam object");
  }
  return seam;
}

async function writeMetafileEvidence(
  metafile: Metafile,
  root: string,
  entries: readonly BoundTargetEntry[],
  graphId: number,
  validationError?: unknown,
): Promise<void> {
  const requested = process.env[METAFILE_EVIDENCE_ENV];
  if (requested === undefined || !path.isAbsolute(requested)) {
    throw new Error(`${METAFILE_EVIDENCE_ENV} must name an absolute evidence file`);
  }
  const canonicalEvidenceRoot = await realpath(EVIDENCE_ROOT);
  const canonicalParent = await realpath(path.dirname(requested));
  if (!isInside(canonicalEvidenceRoot, canonicalParent)) {
    throw new Error(`${METAFILE_EVIDENCE_ENV} escaped the supplied evidence root`);
  }
  metafileSequence += 1;
  const record = {
    schemaVersion: 1,
    sequence: metafileSequence,
    graph: {
      id: graphId,
      dispatcherInput: `${dispatcherNamespace}:${dispatcherEntry}`,
      logicalOutput: dispatcherOutput,
    },
    binding: { root, entries },
    validation:
      validationError === undefined
        ? { ok: true }
        : {
            ok: false,
            error:
              validationError instanceof Error
                ? `${validationError.name}: ${validationError.message}`
                : String(validationError),
          },
    metafile,
  };
  const destination = path.join(canonicalParent, path.basename(requested));
  await appendFile(destination, `${JSON.stringify(record)}\n`, "utf8");
}

async function targetRoot(): Promise<string> {
  const requested = process.env[TARGET_ENV];
  if (requested === undefined || !path.isAbsolute(requested)) {
    throw new Error(`${TARGET_ENV} must name one explicit absolute target directory`);
  }
  const canonical = await realpath(requested);
  if (boundTargetRoot !== undefined && !samePath(boundTargetRoot, canonical)) {
    throw new Error(
      `A test process cannot rebind its target root from ${boundTargetRoot} to ${canonical}`,
    );
  }
  boundTargetRoot = canonical;
  return canonical;
}

async function findEntry(root: string, name: TargetModuleName): Promise<string> {
  for (const extension of extensions) {
    const candidate = path.join(root, `${name}${extension}`);
    if (await isFile(candidate)) return realpath(candidate);
  }
  throw new Error(`Missing real target source for ${name} under ${root}`);
}

function closedTargetPlugin(
  root: string,
  entries: readonly BoundTargetEntry[],
  graphSeamKey: string,
): Plugin {
  return {
    name: "closed-knorvia-model-target",
    setup(build) {
      build.onResolve({ filter: /^knorvia-model-contract-dispatcher$/ }, (args) => {
        if (args.kind !== "entry-point") {
          return denied(args, "dispatcher is only valid as the fixed entry point");
        }
        return { namespace: dispatcherNamespace, path: dispatcherEntry };
      });
      build.onLoad(
        { filter: /^knorvia-model-contract-dispatcher$/, namespace: dispatcherNamespace },
        () => ({ contents: dispatcherSource(entries), loader: "js" }),
      );
      build.onResolve({ filter: /.*/ }, async (args) => resolveImport(root, args));
      build.onLoad({ filter: /.*/, namespace: "owned-seam" }, (args) => {
        const source = virtualModuleSource(args.path, graphSeamKey);
        if (source === undefined) return { errors: [{ text: `No owned seam for ${args.path}` }] };
        return { contents: source, loader: "js" };
      });
    },
  };
}

async function resolveImport(root: string, args: OnResolveArgs): Promise<ReturnTypeResult> {
  if (args.kind === "entry-point") return denied(args, "unexpected target entry point");
  if (args.namespace === "owned-seam") return undefined;
  if (PURE_NODE_BUILTINS.has(args.path)) return { external: true, path: args.path };
  if (CONTROLLED_NODE_BUILTINS.has(args.path) || RETAINED_PACKAGES.has(args.path)) {
    return { namespace: "owned-seam", path: args.path };
  }
  if (!isPathLike(args.path)) return denied(args, "unknown bare import");
  const unresolved = path.resolve(path.dirname(args.importer), args.path);
  const retained = retainedRelativeSeam(unresolved);
  if (retained !== undefined) return { namespace: "owned-seam", path: retained };
  if (!isInside(root, unresolved))
    return denied(args, "relative import escapes the selected target root");
  const resolved = await resolveSourceFile(unresolved);
  if (resolved === undefined) return denied(args, "relative target import does not resolve");
  const canonical = await realpath(resolved);
  if (!isInside(root, canonical)) return denied(args, "resolved source escapes through a symlink");
  return { path: canonical };
}

type ReturnTypeResult = OnResolveResult | undefined;

function denied(args: OnResolveArgs, reason: string): ReturnTypeResult {
  return {
    errors: [{ text: `Closed loader denied ${args.path} from ${args.importer}: ${reason}` }],
  };
}

function retainedRelativeSeam(candidate: string): string | undefined {
  const normalized = candidate.replaceAll("\\", "/");
  if (RETAINED_RELATIVE_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
    return normalized.includes("/network/") ? "retained:proxy-fetch" : "retained:device-mid";
  }
  return undefined;
}

async function resolveSourceFile(unresolved: string): Promise<string | undefined> {
  if (await isFile(unresolved)) return unresolved;
  const extension = path.extname(unresolved);
  const stem = extension === "" ? unresolved : unresolved.slice(0, -extension.length);
  for (const candidateExtension of extensions) {
    const candidate = `${stem}${candidateExtension}`;
    if (await isFile(candidate)) return candidate;
  }
  for (const candidateExtension of extensions) {
    const candidate = path.join(unresolved, `index${candidateExtension}`);
    if (await isFile(candidate)) return candidate;
  }
  return undefined;
}

async function validateMetafile(
  metafile: Metafile,
  root: string,
  entries: readonly BoundTargetEntry[],
): Promise<void> {
  const dispatcherInput = `${dispatcherNamespace}:${dispatcherEntry}`;
  let sawDispatcher = false;
  const realInputs: string[] = [];
  for (const input of Object.keys(metafile.inputs)) {
    if (input === dispatcherInput) {
      sawDispatcher = true;
      continue;
    }
    if (isAllowedOwnedSeamInput(input)) continue;
    const absolute = path.resolve(SUITE_ROOT, input);
    const canonical = await realpath(absolute);
    if (!isInside(root, canonical)) throw new Error(`Metafile input escaped target root: ${input}`);
    realInputs.push(canonical);
  }
  if (!sawDispatcher) throw new Error("Metafile omitted the one owned dispatcher input");
  for (const entry of entries) {
    if (!realInputs.some((input) => samePath(input, entry.path))) {
      throw new Error(`Metafile omitted the real target entry: ${entry.path}`);
    }
  }
  for (const output of Object.values(metafile.outputs)) {
    for (const imported of output.imports) {
      if (!imported.external || !PURE_NODE_BUILTINS.has(imported.path)) {
        throw new Error(`Metafile contains an unowned external import: ${imported.path}`);
      }
    }
  }
}

function isAllowedOwnedSeamInput(input: string): boolean {
  const prefix = "owned-seam:";
  if (!input.startsWith(prefix)) return false;
  const specifier = input.slice(prefix.length);
  return (
    CONTROLLED_NODE_BUILTINS.has(specifier) ||
    RETAINED_PACKAGES.has(specifier) ||
    specifier === "retained:proxy-fetch" ||
    specifier === "retained:device-mid"
  );
}

function dispatcherSource(entries: readonly BoundTargetEntry[]): string {
  const imports = entries
    .map(
      (entry, index) =>
        `import * as target${index} from ${JSON.stringify(entry.path.replaceAll("\\", "/"))};`,
    )
    .join("\n");
  const properties = entries
    .map((entry, index) => `${JSON.stringify(entry.name)}:target${index}`)
    .join(",\n");
  return `${imports}\nexport const targetModules=Object.freeze({\n${properties}\n});`;
}

function targetBanner(graphSeamKey: string): string {
  const symbol = JSON.stringify(graphSeamKey);
  return `const __knorviaSeams=globalThis[Symbol.for(${symbol})];
if(!__knorviaSeams)throw new Error("Target evaluated without owned seams");
const process=__knorviaSeams.process;
const Date=__knorviaSeams.clock.Date;
const performance=__knorviaSeams.clock.performance;
const fetch=__knorviaSeams.transport.fetch;
const crypto=__knorviaSeams.crypto;
const setTimeout=__knorviaSeams.clock.setTimeout.bind(__knorviaSeams.clock);
const clearTimeout=__knorviaSeams.clock.clearTimeout.bind(__knorviaSeams.clock);
const setInterval=__knorviaSeams.clock.setInterval.bind(__knorviaSeams.clock);
const clearInterval=__knorviaSeams.clock.clearInterval.bind(__knorviaSeams.clock);`;
}

async function isFile(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

function isPathLike(specifier: string): boolean {
  return specifier.startsWith(".") || path.isAbsolute(specifier);
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}
