// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CONTROLLED_NODE_BUILTINS,
  PURE_NODE_BUILTINS,
  RETAINED_PACKAGES,
} from "./model-subsystem-contract/harness/allowed-dependencies.js";
import { TARGET_MODULES } from "./model-subsystem-contract/harness/target-modules.js";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const supportRoot = path.join(testRoot, "model-subsystem-contract");
const groupRunner = path.join(supportRoot, "group-runner.mjs");
const CHILD_TIMEOUT_MS = 135_000;
const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;
const EXPECTED_CASES = 76;
const EXPECTED_NETWORK_SURFACES = 83;
const ownedInputSpecifiers = new Set([
  ...CONTROLLED_NODE_BUILTINS,
  ...RETAINED_PACKAGES,
  "retained:device-mid",
  "retained:proxy-fetch",
]);

type TargetKind = "source" | "dist";

interface ChildResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;
  readonly stdout: string;
  readonly timedOut: boolean;
  readonly overflowed: boolean;
}

interface MetafileRecord {
  readonly sequence: number;
  readonly graph: { readonly id: number; readonly dispatcherInput: string };
  readonly binding: {
    readonly root: string;
    readonly entries: ReadonlyArray<{ readonly name: string; readonly path: string }>;
  };
  readonly validation: { readonly ok: boolean; readonly error?: string };
  readonly metafile: {
    readonly inputs: Readonly<Record<string, unknown>>;
    readonly outputs: Readonly<
      Record<string, { readonly imports: ReadonlyArray<{ external?: boolean; path: string }> }>
    >;
  };
}

for (const kind of ["source", "dist"] as const) {
  test(
    `model subsystem contract: ${kind}`,
    { concurrency: false, timeout: 140_000 },
    async (context) => {
      await runGroup(kind, (message) => context.diagnostic(message));
    },
  );
}

async function runGroup(kind: TargetKind, diagnostic: (message: string) => void): Promise<void> {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), `knorvia-model-contract-${kind}-`));
  const evidenceRoot = path.join(temporaryRoot, "evidence");
  const target = path.resolve(testRoot, `../${kind === "source" ? "src" : "dist"}/model`);
  try {
    if (!(await stat(target)).isDirectory()) {
      throw new Error(
        `${kind} model target is missing; this test never builds or falls back: ${target}`,
      );
    }
    await mkdir(evidenceRoot, { recursive: true });
    const result = await spawnGroup(kind, target, evidenceRoot, temporaryRoot);
    const boundedStderr = tail(result.stderr, 40);
    const boundedStdout = tail(result.stdout, 80);
    assert.equal(result.timedOut, false, `${kind} child exceeded ${CHILD_TIMEOUT_MS}ms`);
    assert.equal(result.overflowed, false, `${kind} child exceeded the output capture bound`);
    assert.equal(result.signal, null, `${kind} child ended by signal ${result.signal}`);
    assert.equal(
      result.exitCode,
      0,
      `${kind} child exit ${String(result.exitCode)}\nstdout tail:\n${boundedStdout}\nstderr tail:\n${boundedStderr}`,
    );
    assert.equal(result.stderr.includes("KNORVIA_MODEL_CONTRACT_WATCHDOG_EXPIRED"), false);
    const summary = assertTestSummary(result.stdout, result.stderr, kind);
    await assertGraphEvidence(path.join(evidenceRoot, "metafiles.jsonl"), target, kind);
    await assertRuntimeAudit(path.join(evidenceRoot, "runtime-network-audit.json"), kind);
    diagnostic(
      `${kind} verified cases=${summary.tests}/${EXPECTED_CASES} pass=${summary.pass} fail=${summary.fail} cancelled=${summary.cancelled} skipped=${summary.skipped} todo=${summary.todo} graphRecords=${EXPECTED_CASES} entriesPerGraph=${TARGET_MODULES.length} runtimeGuardSurfaces=${EXPECTED_NETWORK_SURFACES} runtimeEvents=0`,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function spawnGroup(
  kind: TargetKind,
  target: string,
  evidenceRoot: string,
  temporaryRoot: string,
): Promise<ChildResult> {
  const environment: NodeJS.ProcessEnv = {
    KNORVIA_DATA_BASE_DIR: path.join(temporaryRoot, "data"),
    KNORVIA_ENV: "test",
    KNORVIA_STORAGE_DIR: path.join(temporaryRoot, "storage"),
    TEMP: temporaryRoot,
    TMP: temporaryRoot,
  };
  for (const name of ["SystemRoot", "WINDIR"] as const) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  const child = spawn(
    process.execPath,
    [
      groupRunner,
      "--target",
      target,
      "--kind",
      kind,
      "--evidence-root",
      evidenceRoot,
      "--run-name",
      `repository-${kind}`,
    ],
    {
      cwd: supportRoot,
      env: environment,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let stderr = "";
  let stdout = "";
  let overflowed = false;
  const collect = (stream: "stderr" | "stdout", chunk: Buffer): void => {
    if (overflowed) return;
    if (
      Buffer.byteLength(stderr) + Buffer.byteLength(stdout) + chunk.byteLength >
      MAX_CAPTURE_BYTES
    ) {
      overflowed = true;
      child.kill();
      return;
    }
    if (stream === "stderr") stderr += chunk.toString("utf8");
    else stdout += chunk.toString("utf8");
  };
  child.stdout.on("data", (chunk: Buffer) => collect("stdout", chunk));
  child.stderr.on("data", (chunk: Buffer) => collect("stderr", chunk));
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, CHILD_TIMEOUT_MS);
  const result = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (exitCode, signal) => resolve({ exitCode, signal }));
    },
  ).finally(() => clearTimeout(timeout));
  return { ...result, stderr, stdout, timedOut, overflowed };
}

// BEGIN SUMMARY PARSER
const EXPECTED_TEST_SUMMARY = {
  tests: EXPECTED_CASES,
  pass: EXPECTED_CASES,
  fail: 0,
  cancelled: 0,
  skipped: 0,
  todo: 0,
} as const;

type SummaryLabel = keyof typeof EXPECTED_TEST_SUMMARY;
type TestSummary = Readonly<Record<SummaryLabel, number>>;

function verifyTestSummary(stdout: string): TestSummary {
  const summary = {} as Record<SummaryLabel, number>;
  for (const [label, expected] of Object.entries(EXPECTED_TEST_SUMMARY) as ReadonlyArray<
    readonly [SummaryLabel, number]
  >) {
    const matches = [...stdout.matchAll(new RegExp(`^(?:#|ℹ) ${label} (\\d+)$`, "gmu"))];
    if (matches.length !== 1) {
      throw new Error(`summary must contain exactly one ${label} line; received ${matches.length}`);
    }
    const actual = Number(matches[0]?.[1]);
    if (actual !== expected) {
      throw new Error(`summary ${label}: expected ${expected}, received ${actual}`);
    }
    summary[label] = actual;
  }
  return summary;
}
// END SUMMARY PARSER

function assertTestSummary(stdout: string, stderr: string, kind: TargetKind): TestSummary {
  try {
    return verifyTestSummary(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.fail(
      `${kind} test summary invalid: ${message}\nstdout tail:\n${tail(stdout, 80)}\nstderr tail:\n${tail(stderr, 40)}`,
    );
  }
}

async function assertGraphEvidence(
  evidencePath: string,
  target: string,
  kind: TargetKind,
): Promise<void> {
  const content = await readFile(evidencePath, "utf8");
  const records = content
    .split(/\r?\n/u)
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as MetafileRecord);
  assert.equal(records.length, EXPECTED_CASES, `${kind} graph record count`);
  const canonicalTarget = await realpath(target);
  const graphIds = new Set<number>();
  for (const [recordIndex, record] of records.entries()) {
    assert.equal(record.sequence, recordIndex + 1, `${kind} graph sequence`);
    assert.equal(
      record.validation.ok,
      true,
      `${kind} graph validation: ${record.validation.error ?? ""}`,
    );
    assert.equal(samePath(record.binding.root, canonicalTarget), true, `${kind} graph target root`);
    assert.deepEqual(
      record.binding.entries.map(({ name }) => name),
      [...TARGET_MODULES],
      `${kind} graph entry names`,
    );
    assert.equal(record.binding.entries.length, TARGET_MODULES.length);
    graphIds.add(record.graph.id);
    const entryPaths = new Set<string>();
    for (const entry of record.binding.entries) {
      const canonicalEntry = await realpath(entry.path);
      assert.equal(isInside(canonicalTarget, canonicalEntry), true, `${kind} entry escaped target`);
      assert.equal(path.extname(canonicalEntry), kind === "source" ? ".ts" : ".js");
      entryPaths.add(normalizedPath(canonicalEntry));
    }
    assert.equal(entryPaths.size, TARGET_MODULES.length, `${kind} entry path count`);
    await assertClosedMetafile(record, canonicalTarget, entryPaths, kind);
  }
  assert.equal(graphIds.size, EXPECTED_CASES, `${kind} unique graph IDs`);
}

async function assertClosedMetafile(
  record: MetafileRecord,
  canonicalTarget: string,
  entryPaths: ReadonlySet<string>,
  kind: TargetKind,
): Promise<void> {
  assert.equal(
    record.graph.dispatcherInput,
    "owned-target-dispatcher:knorvia-model-contract-dispatcher",
  );
  let dispatcherCount = 0;
  const realInputs = new Set<string>();
  for (const input of Object.keys(record.metafile.inputs)) {
    if (input === record.graph.dispatcherInput) {
      dispatcherCount += 1;
      continue;
    }
    if (input.startsWith("owned-seam:")) {
      const specifier = input.slice("owned-seam:".length);
      assert.equal(
        ownedInputSpecifiers.has(specifier),
        true,
        `${kind} unknown owned input ${input}`,
      );
      continue;
    }
    const canonicalInput: string = await realpath(path.resolve(supportRoot, input));
    assert.equal(
      isInside(canonicalTarget, canonicalInput),
      true,
      `${kind} real input escaped target`,
    );
    realInputs.add(normalizedPath(canonicalInput));
  }
  assert.equal(dispatcherCount, 1, `${kind} dispatcher input count`);
  for (const entryPath of entryPaths) {
    assert.equal(realInputs.has(entryPath), true, `${kind} metafile omitted ${entryPath}`);
  }
  for (const output of Object.values(record.metafile.outputs)) {
    for (const imported of output.imports) {
      assert.equal(imported.external, true, `${kind} nonexternal output import ${imported.path}`);
      assert.equal(
        PURE_NODE_BUILTINS.has(imported.path),
        true,
        `${kind} unapproved external ${imported.path}`,
      );
    }
  }
}

async function assertRuntimeAudit(auditPath: string, kind: TargetKind): Promise<void> {
  const audit = JSON.parse(await readFile(auditPath, "utf8")) as {
    terminal?: boolean;
    installComplete?: boolean;
    installedSurfaceCount?: number;
    installedSurfaces?: unknown[];
    eventCount?: number;
    violation?: boolean;
    exitCode?: number;
  };
  assert.equal(audit.terminal, true, `${kind} runtime audit terminal`);
  assert.equal(audit.installComplete, true, `${kind} runtime guard installation`);
  assert.equal(audit.installedSurfaceCount, EXPECTED_NETWORK_SURFACES, `${kind} guard count`);
  assert.equal(audit.installedSurfaces?.length, EXPECTED_NETWORK_SURFACES);
  assert.equal(new Set(audit.installedSurfaces).size, EXPECTED_NETWORK_SURFACES);
  assert.equal(audit.eventCount, 0, `${kind} runtime network events`);
  assert.equal(audit.violation, false, `${kind} runtime network violation`);
  assert.equal(audit.exitCode, 0, `${kind} runtime audit exit`);
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizedPath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left: string, right: string): boolean {
  return normalizedPath(left) === normalizedPath(right);
}

function tail(value: string, lineCount: number): string {
  return value.split(/\r?\n/u).slice(-lineCount).join("\n");
}
