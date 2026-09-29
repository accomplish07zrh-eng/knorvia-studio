// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cases } from "../cases/registry.mjs";
import { runDeclarationProbe } from "../tools/check-declaration-probe.mjs";
import {
  buildWorld,
  contractRoot,
  contractSchema,
  defaultAdapterRoot,
  defaultRepoRoot,
} from "./build-world.mjs";

const harnessDirectory = dirname(fileURLToPath(import.meta.url));

async function createOutputRoot(requestedRoot, target) {
  if (requestedRoot) {
    if (!isAbsolute(requestedRoot)) throw new Error("outputRoot must be absolute");
    const root = resolve(requestedRoot);
    await mkdir(dirname(root), { recursive: true });
    try {
      await mkdir(root, { recursive: false });
    } catch (error) {
      if (error?.code === "EEXIST") throw new Error(`Output root already exists: ${root}`);
      throw error;
    }
    return root;
  }

  const configuredBase = process.env.KNORVIA_DATA_BASE_DIR;
  if (configuredBase) {
    const base = resolve(configuredBase, "plugin-storage-contract");
    await mkdir(base, { recursive: true });
    const root = resolve(base, `${target}-${randomUUID()}`);
    await mkdir(root, { recursive: false });
    return root;
  }
  return mkdtemp(join(tmpdir(), `knorvia-plugin-storage-${target}-`));
}

function sanitizedWorkerEnv(outputRoot) {
  const systemRoot = process.env.SystemRoot ?? "";
  return {
    HOME: outputRoot,
    KNORVIA_ENV: "test",
    NODE_PATH: "",
    PATH: dirname(process.execPath),
    SystemRoot: systemRoot,
    TEMP: join(outputRoot, "temp"),
    TMP: join(outputRoot, "temp"),
    USERPROFILE: outputRoot,
  };
}

async function runWorker({
  bundlePath,
  caseRoot,
  outputPath,
  outputRoot,
  phase = "normal",
  signal,
  testCase,
  crashAfterMutation,
  expectCrash = false,
}) {
  const childArgs = [
    join(harnessDirectory, "case-worker.mjs"),
    "--bundle",
    bundlePath,
    "--case",
    testCase.id,
    "--run-root",
    caseRoot,
    "--output",
    outputPath,
    "--phase",
    phase,
  ];
  if (crashAfterMutation !== undefined) {
    childArgs.push("--crash-after-mutation", String(crashAfterMutation));
  }
  if (signal.aborted) {
    return { id: testCase.id, status: "target-timeout" };
  }

  const child = spawn(process.execPath, childArgs, {
    cwd: contractRoot,
    env: sanitizedWorkerEnv(outputRoot),
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  let timedOut = false;
  let targetTimedOut = false;
  const timeoutMs = Number(testCase.timeoutMs ?? contractSchema.timeoutsMs.workerDefault);
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMs);
  const abort = () => {
    targetTimedOut = true;
    child.kill();
  };
  signal.addEventListener("abort", abort, { once: true });
  let exitCode;
  try {
    exitCode = await new Promise((resolveExit, reject) => {
      child.once("error", reject);
      child.once("exit", resolveExit);
    });
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
  if (targetTimedOut) return { id: testCase.id, status: "target-timeout", stdout, stderr };
  if (timedOut) return { id: testCase.id, status: "worker-timeout", stdout, stderr };
  if (exitCode === 86 && expectCrash) return { id: testCase.id, status: "intentional-crash" };
  if (exitCode !== 0) {
    return { id: testCase.id, status: "worker-error", exitCode, stdout, stderr };
  }
  return JSON.parse(await readFile(outputPath, "utf8"));
}

async function runCrashMatrix(parameters, baseResult) {
  const { reportRoot, runRoot, testCase } = parameters;
  if (!testCase.crashMatrix || baseResult.status !== "passed") return baseResult;
  const matrixRoot = join(runRoot, `${testCase.id}-crash-matrix`);
  const trace = await runWorker({
    ...parameters,
    caseRoot: join(matrixRoot, "trace"),
    outputPath: join(reportRoot, `${testCase.id}.matrix-trace.json`),
    phase: "trace",
  });
  if (trace.status !== "passed") {
    return {
      ...baseResult,
      status: "failed",
      failure: { name: "CrashMatrixTraceError", message: `Trace phase ended with ${trace.status}` },
      crashMatrix: { trace },
    };
  }
  const mutations = trace.events.filter((entry) => entry.kind === "fs.mutation.commit");
  if (mutations.length === 0) {
    return {
      ...baseResult,
      status: "failed",
      failure: {
        name: "CrashMatrixTraceError",
        message: "Trace phase observed no committed filesystem mutations",
      },
      crashMatrix: { trace },
    };
  }

  const checkpoints = [];
  for (const event of mutations) {
    const index = event.mutation;
    const checkpointRoot = join(matrixRoot, `after-${String(index).padStart(3, "0")}`);
    const writer = await runWorker({
      ...parameters,
      caseRoot: checkpointRoot,
      crashAfterMutation: index,
      expectCrash: true,
      outputPath: join(reportRoot, `${testCase.id}.matrix-${index}-writer.json`),
      phase: "crash-writer",
    });
    if (writer.status !== "intentional-crash") {
      checkpoints.push({ mutation: index, writer, status: "writer-did-not-crash" });
      continue;
    }
    const reader = await runWorker({
      ...parameters,
      caseRoot: checkpointRoot,
      outputPath: join(reportRoot, `${testCase.id}.matrix-${index}-reader.json`),
      phase: "recover",
    });
    checkpoints.push({ mutation: index, writer, reader, status: reader.status });
  }
  const failed = checkpoints.filter((item) => item.status !== "passed");
  return {
    ...baseResult,
    ...(failed.length > 0
      ? {
          status: "failed",
          failure: {
            name: "CrashMatrixRecoveryError",
            message: `${failed.length} of ${checkpoints.length} crash checkpoints failed`,
          },
        }
      : {}),
    crashMatrix: {
      committedMutations: mutations.map((entry) => ({ mutation: entry.mutation, op: entry.op })),
      checkpoints,
      traceReport: `${testCase.id}.matrix-trace.json`,
    },
  };
}

function statusCounts(results) {
  const counts = {};
  for (const result of results) counts[result.status] = (counts[result.status] ?? 0) + 1;
  return counts;
}

/**
 * @param {{
 *   adapterRoot?: string,
 *   outputRoot?: string,
 *   repoRoot?: string,
 *   signal?: AbortSignal,
 *   target: "source" | "dist",
 * }} options
 */
export async function runContractTarget({
  adapterRoot = defaultAdapterRoot,
  outputRoot: requestedOutputRoot,
  repoRoot = defaultRepoRoot,
  signal: externalSignal,
  target,
} = {}) {
  if (process.version !== contractSchema.nodeVersion) {
    throw new Error(`Contract requires ${contractSchema.nodeVersion}; received ${process.version}`);
  }
  const targetConfig = contractSchema.targets[target];
  if (!targetConfig) throw new Error(`Unknown target ${target}; expected source or dist`);
  if (cases.length !== contractSchema.caseCounts.executable) {
    throw new Error(
      `Expected ${contractSchema.caseCounts.executable} cases; received ${cases.length}`,
    );
  }

  const outputRoot = await createOutputRoot(requestedOutputRoot, target);
  const artifactRoot = join(outputRoot, "artifacts");
  const reportRoot = join(outputRoot, "reports");
  const runRoot = join(outputRoot, "runs");
  const tempRoot = join(outputRoot, "temp");
  await Promise.all([
    mkdir(artifactRoot, { recursive: false }),
    mkdir(reportRoot, { recursive: false }),
    mkdir(runRoot, { recursive: false }),
    mkdir(tempRoot, { recursive: false }),
  ]);

  const moduleRootRequest = resolve(adapterRoot, targetConfig.relativeModuleRoot);
  let moduleRoot;
  try {
    moduleRoot = await realpath(moduleRootRequest);
  } catch (error) {
    if (error?.code === "ENOENT" && target === "dist") {
      throw new Error(
        `Built CLI dist is missing at ${moduleRootRequest}; run pnpm build:cli-packages before pnpm test:studio. Source fallback is forbidden.`,
      );
    }
    throw error;
  }

  const controller = new AbortController();
  const relayAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) relayAbort();
  else externalSignal?.addEventListener("abort", relayAbort, { once: true });
  const outerTimeout = setTimeout(() => {
    controller.abort(
      new Error(`${target} contract exceeded ${contractSchema.timeoutsMs.targetOuter}ms`),
    );
  }, contractSchema.timeoutsMs.targetOuter);

  try {
    const declarationProbe = await runDeclarationProbe({ outputRoot: artifactRoot, repoRoot });
    const bundlePath = join(artifactRoot, "world.mjs");
    const metafilePath = join(artifactRoot, "metafile.json");
    const graphLedgerPath = join(artifactRoot, "graph-ledger.json");
    const graph = await buildWorld({
      adapterRoot,
      graphLedgerPath,
      metafilePath,
      moduleRoot,
      outputPath: bundlePath,
      repoRoot,
      target,
    });

    const results = [];
    for (const testCase of cases) {
      if (controller.signal.aborted) {
        results.push({ id: testCase.id, status: "target-timeout" });
        continue;
      }
      const parameters = {
        bundlePath,
        caseRoot: join(runRoot, testCase.id),
        outputPath: join(reportRoot, `${testCase.id}.json`),
        outputRoot,
        reportRoot,
        runRoot,
        signal: controller.signal,
        testCase,
      };
      const baseResult = await runWorker(parameters);
      results.push(await runCrashMatrix(parameters, baseResult));
    }

    const counts = statusCounts(results);
    const failedIds = results.filter((item) => item.status !== "passed").map((item) => item.id);
    const summary = {
      version: 1,
      target,
      status: failedIds.length === 0 ? "accepted" : "rejected",
      moduleRoot,
      outputRoot,
      total: results.length,
      passed: counts.passed ?? 0,
      failed: failedIds.length,
      failedIds,
      statusCounts: counts,
      declarationProbe: {
        compiler: `${declarationProbe.compiler.name}@${declarationProbe.compiler.version}`,
        publicDeclarations: declarationProbe.publicDeclarations.length,
      },
      graphLedger: graphLedgerPath,
      graphInputs: graph.graphInputs.length,
      graphBoundaryViolations: graph.graphBoundaryViolations,
      runtimeModules: graph.runtimeModules?.length,
      results,
    };
    const summaryPath = join(reportRoot, "summary.json");
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    return { ...summary, summaryPath };
  } finally {
    clearTimeout(outerTimeout);
    externalSignal?.removeEventListener("abort", relayAbort);
  }
}
