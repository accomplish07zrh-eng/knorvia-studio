#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

export const VERSION_TIMEOUT_MS = 10_000;
export const PYTHON_PATH_ENV = "KNORVIA_DIAGNOSTIC_PYTHON";
export const OUTPUT_PATH_ENV = "KNORVIA_DIAGNOSTIC_OUTPUT";
export const NODE_TEST_MODE_ENV = "KNORVIA_DIAGNOSTIC_NODE_TEST";

const LOADER_ENV_ALLOWLIST = [
  "PYTHONHOME",
  "PYTHONPATH",
  "PYTHONSTARTUP",
  "PYTHONUTF8",
  "PYTHONIOENCODING",
  "PYTHONNOUSERSITE",
  "PYTHONSAFEPATH",
  "VIRTUAL_ENV",
  "PATH",
  "PATHEXT",
  "SystemRoot",
];

const RUN_CONTEXT_ALLOWLIST = [
  "RUNNER_OS",
  "RUNNER_ARCH",
  "ImageOS",
  "ImageVersion",
  "GITHUB_SHA",
  "GITHUB_RUN_ID",
  "GITHUB_RUN_ATTEMPT",
  "GITHUB_JOB",
  "GITHUB_WORKFLOW",
];

const RESOURCE_FIELDS = [
  "userCPUTime",
  "systemCPUTime",
  "maxRSS",
  "sharedMemorySize",
  "unsharedDataSize",
  "unsharedStackSize",
  "minorPageFault",
  "majorPageFault",
  "swappedOut",
  "fsRead",
  "fsWrite",
  "ipcSent",
  "ipcReceived",
  "signalsCount",
  "voluntaryContextSwitches",
  "involuntaryContextSwitches",
];

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hashAllowlistedEnvironment(environment) {
  return Object.fromEntries(
    LOADER_ENV_ALLOWLIST.map((name) => {
      const value = environment[name];
      return [
        name,
        value === undefined ? { present: false } : { present: true, sha256: sha256(value) },
      ];
    }),
  );
}

function readRunContext(environment) {
  return Object.fromEntries(RUN_CONTEXT_ALLOWLIST.map((name) => [name, environment[name] ?? null]));
}

function errorRecord(error) {
  if (error == null) return null;
  return {
    name: error.name ?? null,
    message: error.message ?? String(error),
    code: error.code ?? null,
    errno: error.errno ?? null,
    syscall: error.syscall ?? null,
    path: error.path ?? null,
    spawnargs: error.spawnargs ?? null,
  };
}

function executableRecord(executable) {
  let stat;
  let realpath;
  try {
    const value = statSync(executable);
    stat = {
      ok: true,
      isFile: value.isFile(),
      size: value.size,
      mode: value.mode,
      birthtimeMs: value.birthtimeMs,
      ctimeMs: value.ctimeMs,
      mtimeMs: value.mtimeMs,
    };
  } catch (error) {
    stat = { ok: false, error: errorRecord(error) };
  }
  try {
    realpath = { ok: true, value: realpathSync.native(executable) };
  } catch (error) {
    realpath = { ok: false, error: errorRecord(error) };
  }
  return { input: executable, stat, realpath };
}

function subtractResourceUsage(before, after) {
  return Object.fromEntries(RESOURCE_FIELDS.map((name) => [name, after[name] - before[name]]));
}

function nativeResultRecord(result) {
  return {
    error: errorRecord(result.error),
    status: result.status ?? null,
    signal: result.signal ?? null,
    pid: result.pid ?? null,
    output: result.output ?? null,
    stdout: result.stdout ?? null,
    stderr: result.stderr ?? null,
  };
}

function verdictFor(native) {
  if (native.error) {
    return {
      ok: false,
      reason: native.error.code === "ETIMEDOUT" ? "version-probe-timeout" : "version-probe-error",
      observedVersion: null,
    };
  }
  if (native.signal !== null) {
    return { ok: false, reason: "version-probe-signal", observedVersion: null };
  }
  if (native.status !== 0) {
    return { ok: false, reason: "version-probe-nonzero", observedVersion: null };
  }
  const output = [native.stdout, native.stderr]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join("\n")
    .trim();
  const match = /^Python (3\.13\.\d+)(?:[^\r\n]*)$/u.exec(output);
  if (!match) return { ok: false, reason: "unexpected-version-output", observedVersion: output };
  return { ok: true, reason: "python-3.13-version-observed", observedVersion: match[1] };
}

/**
 * One diagnostic call. The production default has exactly one child launch:
 * the supplied absolute executable with the single literal argument --version.
 */
export function runDiagnostic({
  executable,
  environment = process.env,
  spawnSyncImpl = spawnSync,
} = {}) {
  const startedUtc = new Date().toISOString();
  const startedMonotonicNs = process.hrtime.bigint();
  const startedPerformanceMs = performance.now();
  const executableInfo = executableRecord(executable);
  const cpuBefore = process.cpuUsage();
  const resourcesBefore = process.resourceUsage();

  let result;
  try {
    result = spawnSyncImpl(executable, ["--version"], {
      encoding: "utf8",
      timeout: VERSION_TIMEOUT_MS,
      windowsHide: true,
    });
  } catch (error) {
    result = {
      error,
      status: null,
      signal: null,
      pid: null,
      output: null,
      stdout: null,
      stderr: null,
    };
  }

  const resourcesAfter = process.resourceUsage();
  const cpuDelta = process.cpuUsage(cpuBefore);
  const returnedPerformanceMs = performance.now();
  const returnedMonotonicNs = process.hrtime.bigint();
  const native = nativeResultRecord(result);
  const versionVerdict = verdictFor(native);
  const telemetryComplete = executableInfo.stat.ok && executableInfo.realpath.ok;

  return {
    schema: "knorvia-python-version-diagnostic/v1",
    declaration: "diagnostic-not-fix",
    probe: {
      command: executable,
      args: ["--version"],
      timeoutMs: VERSION_TIMEOUT_MS,
      launchCount: 1,
    },
    time: {
      startedUtc,
      returnedUtc: new Date().toISOString(),
      startedMonotonicNs: startedMonotonicNs.toString(),
      returnedMonotonicNs: returnedMonotonicNs.toString(),
      elapsedMs: returnedPerformanceMs - startedPerformanceMs,
    },
    parentNode: {
      version: process.version,
      execPath: process.execPath,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      ppid: process.ppid,
      cwd: process.cwd(),
    },
    host: {
      type: os.type(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      version: os.version(),
    },
    runContext: readRunContext(environment),
    loaderEnvironment: hashAllowlistedEnvironment(environment),
    executable: executableInfo,
    native,
    parentResourceDelta: {
      cpuUsage: cpuDelta,
      resourceUsage: subtractResourceUsage(resourcesBefore, resourcesAfter),
      maxRSS: { before: resourcesBefore.maxRSS, after: resourcesAfter.maxRSS },
    },
    verdict: telemetryComplete
      ? versionVerdict
      : { ok: false, reason: "executable-metadata-incomplete", observedVersion: null },
  };
}

export function persistAndPrint(record, outputPath) {
  const json = `${JSON.stringify(record, null, 2)}\n`;
  let writeError = null;
  try {
    if (!outputPath) throw new Error(`${OUTPUT_PATH_ENV} is required`);
    mkdirSync(dirname(resolve(outputPath)), { recursive: true });
    writeFileSync(outputPath, json, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    writeError = errorRecord(error);
  }
  process.stdout.write(json);
  if (writeError) process.stderr.write(`${JSON.stringify({ artifactWriteError: writeError })}\n`);
  return { writeError };
}

function runMain() {
  const executable = process.env[PYTHON_PATH_ENV];
  let record;
  if (!executable) {
    record = {
      schema: "knorvia-python-version-diagnostic/v1",
      declaration: "diagnostic-not-fix",
      verdict: { ok: false, reason: `${PYTHON_PATH_ENV}-missing`, observedVersion: null },
    };
  } else {
    record = runDiagnostic({ executable });
  }
  const persisted = persistAndPrint(record, process.env[OUTPUT_PATH_ENV]);
  return { record, persisted };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain && process.env[NODE_TEST_MODE_ENV] === "1") {
  const { test } = await import("node:test");
  test("setup-python 3.13 exact path answers one bounded --version probe", () => {
    const { record, persisted } = runMain();
    assert.equal(persisted.writeError, null, "diagnostic JSON artifact must be written");
    assert.equal(record.verdict.ok, true, JSON.stringify(record.native ?? record.verdict));
  });
} else if (isMain) {
  const { record, persisted } = runMain();
  if (persisted.writeError || !record.verdict.ok) process.exitCode = 1;
}
