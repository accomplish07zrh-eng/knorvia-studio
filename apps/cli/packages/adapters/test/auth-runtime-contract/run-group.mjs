// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTarget } from "./harness/build-target.mjs";
import { checkedChild } from "./harness/checked-child.mjs";
import { ownedEnvironment } from "./harness/owned-env.mjs";
import { isAssertedSuccess, parseNodeTestSummary } from "./harness/tap-summary.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const EXPECTED_CASES = 30;

async function json(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function within(root, file) {
  const relative = path.relative(root, file);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export async function runAuthGroup({ mode, repoRoot, evidenceRoot }) {
  assert.ok(mode === "source" || mode === "dist");
  const target = path.join(
    repoRoot,
    "apps/cli/packages/adapters",
    mode === "source" ? "src" : "dist",
    "auth",
  );
  assert.equal((await stat(target)).isDirectory(), true, `Missing ${mode} target: ${target}`);
  await mkdir(evidenceRoot, { recursive: true });
  const toolingRoot = path.join(repoRoot, "node_modules");
  const built = await buildTarget({
    mode,
    outDir: path.join(evidenceRoot, "build"),
    repoRoot,
    toolingRoot,
  });
  await json(path.join(evidenceRoot, "graph.json"), built.graph);
  const matrix = JSON.parse(await readFile(path.join(ROOT, "CASE-MAP.json"), "utf8"));
  assert.equal(matrix.cases.length, EXPECTED_CASES);
  assert.equal(new Set(matrix.cases.map((entry) => entry.id)).size, EXPECTED_CASES);
  const systemTemp = await realpath(tmpdir());
  const started = Date.now();
  const results = [];
  let firstFailure;
  for (const entry of matrix.cases) {
    const caseRoot = path.join(evidenceRoot, entry.id);
    await mkdir(caseRoot, { recursive: true });
    const owned = await mkdtemp(path.join(systemTemp, "knorvia-auth-case-"));
    const caseFile = path.resolve(ROOT, entry.file);
    assert.ok(within(ROOT, caseFile));
    const remaining = matrix.groupTimeoutMs - (Date.now() - started);
    const env = ownedEnvironment(process.env, owned, {
      KNORVIA_TEST_AUTH_MODULE_URL: built.moduleUrl,
      KNORVIA_TEST_CASE_ID: entry.id,
      KNORVIA_TEST_REPO_ROOT: repoRoot,
      KNORVIA_TEST_TOOLING_ROOT: toolingRoot,
    });
    const args = ["--test", "--test-reporter=tap", `--test-name-pattern=^${entry.id}\\b`, caseFile];
    const child =
      remaining > 0
        ? await checkedChild(args, {
            cwd: owned,
            env,
            timeoutMs: Math.min(entry.timeoutMs, remaining),
          })
        : {
            exitCode: null,
            signal: null,
            stdout: "",
            stderr: "Group deadline exceeded",
            timedOut: true,
            overflowed: false,
          };
    await writeFile(path.join(caseRoot, "stdout.log"), child.stdout);
    await writeFile(path.join(caseRoot, "stderr.log"), child.stderr);
    const summary = parseNodeTestSummary(child.stdout, entry.id);
    const passed =
      isAssertedSuccess({ ...child, summary }) &&
      summary.tests === 1 &&
      summary.pass === 1 &&
      summary.cancelled === 0 &&
      summary.skipped === 0 &&
      !child.timedOut &&
      !child.overflowed;
    const result = {
      id: entry.id,
      passed,
      timeoutMs: entry.timeoutMs,
      summary,
      process: { ...child, stdout: undefined, stderr: undefined },
      ownedWork: owned,
    };
    await json(path.join(caseRoot, "result.json"), result);
    try {
      const api = await readFile(path.join(owned, "auth-api-graph.json"));
      await writeFile(path.join(caseRoot, "api-graph.json"), api);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    results.push(result);
    if (passed) {
      assert.ok(within(systemTemp, await realpath(owned)), "Temporary root escaped before cleanup");
      await rm(owned, { force: true, recursive: true });
    } else if (!firstFailure) {
      firstFailure = result;
      await json(path.join(evidenceRoot, "FIRST-FAILURE.json"), result);
    }
  }
  const report = {
    mode,
    cases: results.length,
    passed: results.filter((row) => row.passed).length,
    failed: results.filter((row) => !row.passed).length,
    firstFailure,
    results,
  };
  await json(path.join(evidenceRoot, "summary.json"), report);
  assert.equal(
    report.failed,
    0,
    `Auth ${mode} failure retained at ${evidenceRoot}; first=${firstFailure?.id}`,
  );
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, repoRoot, evidenceRoot] = process.argv.slice(2);
  assert.ok(repoRoot && evidenceRoot, "Provide source|dist, checkout root and evidence root");
  const report = await runAuthGroup({
    mode,
    repoRoot: path.resolve(repoRoot),
    evidenceRoot: path.resolve(evidenceRoot),
  });
  process.stdout.write(
    `${JSON.stringify({ mode, cases: report.cases, passed: report.passed, failed: report.failed })}\n`,
  );
}
