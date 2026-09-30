// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { stat } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installRuntimeNetworkGuard } from "./harness/runtime-network-guard.mjs";

const suiteRoot = path.dirname(fileURLToPath(import.meta.url));
const packageAnchor = path.resolve(suiteRoot, "../../package.json");

function argument(name) {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing required ${name} argument`);
  }
  return value;
}

function absoluteArgument(name) {
  const value = argument(name);
  if (!path.isAbsolute(value)) throw new Error(`${name} must be absolute`);
  return path.resolve(value);
}

const target = absoluteArgument("--target");
const evidenceRoot = absoluteArgument("--evidence-root");
const kind = argument("--kind");
const runName = argument("--run-name");
if (kind !== "source" && kind !== "dist") throw new Error("--kind must be source or dist");
if (!/^[a-z0-9][a-z0-9._-]*$/u.test(runName)) throw new Error("--run-name is invalid");
if (Number(process.versions.node.split(".")[0]) !== 24) {
  throw new Error(`Model subsystem contract tests require Node 24; received ${process.version}`);
}
if (!(await stat(target)).isDirectory()) throw new Error(`Target is not a directory: ${target}`);
if (!(await stat(evidenceRoot)).isDirectory()) {
  throw new Error(`Evidence root is not a directory: ${evidenceRoot}`);
}
if (!(await stat(packageAnchor)).isFile()) {
  throw new Error(`Repository package anchor is missing: ${packageAnchor}`);
}

const metafileEvidence = path.join(evidenceRoot, "metafiles.jsonl");
const networkAudit = path.join(evidenceRoot, "runtime-network-audit.json");
process.env.KNORVIA_MODEL_CONTRACT_TARGET = target;
process.env.KNORVIA_MODEL_CONTRACT_TARGET_KIND = kind;
process.env.KNORVIA_MODEL_CONTRACT_SUITE_ROOT = suiteRoot;
process.env.KNORVIA_MODEL_CONTRACT_PACKAGE_ANCHOR = packageAnchor;
process.env.KNORVIA_MODEL_CONTRACT_EVIDENCE_ROOT = evidenceRoot;
process.env.KNORVIA_MODEL_CONTRACT_METAFILE_EVIDENCE = metafileEvidence;
process.env.KNORVIA_MODEL_CONTRACT_NETWORK_AUDIT = networkAudit;
process.env.KNORVIA_MODEL_CONTRACT_RUN_NAME = runName;

installRuntimeNetworkGuard({ auditPath: networkAudit, evidenceRoot, runName });

const requireFromRepository = createRequire(pathToFileURL(packageAnchor));
const { build } = requireFromRepository("esbuild");
const suiteOutput = path.join(evidenceRoot, ".contract-suite.mjs");
const result = await build({
  absWorkingDir: suiteRoot,
  bundle: true,
  entryPoints: ["suite-entry.ts"],
  format: "esm",
  logLevel: "silent",
  metafile: true,
  outfile: suiteOutput,
  platform: "node",
  sourcemap: false,
  target: "node24",
  write: false,
});

for (const input of Object.keys(result.metafile.inputs)) {
  const resolved = path.resolve(suiteRoot, input);
  const relative = path.relative(suiteRoot, resolved);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Test bundle escaped suite root: ${input}`);
  }
}
const outputs = result.outputFiles ?? [];
const matchingOutputs = outputs.filter(
  (output) => normalizedPath(output.path) === normalizedPath(suiteOutput),
);
if (outputs.length !== 1 || matchingOutputs.length !== 1) {
  throw new Error("Expected one fixed in-memory test bundle output");
}

const watchdog = setTimeout(() => {
  process.stderr.write("KNORVIA_MODEL_CONTRACT_WATCHDOG_EXPIRED timeoutMs=120000\n");
  process.exit(124);
}, 120_000);
watchdog.unref();

const output = matchingOutputs[0];
if (output === undefined) throw new Error("In-memory test bundle disappeared");
const encoded = Buffer.from(`${output.text}\n// ${runName}`).toString("base64");
await import(`data:text/javascript;base64,${encoded}`);

function normalizedPath(value) {
  const resolved = path.normalize(path.resolve(value));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
