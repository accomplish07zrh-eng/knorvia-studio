// SPDX-License-Identifier: Apache-2.0
// core-tool-handlers-bash-01 contract tests: the Bash tool entry metadata surface and the
// tool execution performance helpers (classification, hashing, rounding, byte counts).
// Black box: asserts only public exports; expected values are recorded old-implementation output.
import assert from "node:assert/strict";
import { test } from "node:test";

import { bashToolEntry } from "../../../../apps/cli/packages/core/src/tool/handlers/bash.js";
import {
  classifyCommand,
  classifySafeCommandIdentity,
  commandHash,
  roundNonNegativeMs,
  elapsedMsSince,
  fileByteCount,
  workspaceKind,
  readToolExecutionTelemetry,
} from "../../../../apps/cli/packages/core/src/tool/handlers/tool-perf.js";

type BashEntry = {
  metadata?: {
    readOnly?: boolean;
    destructive?: boolean;
    riskLevel?: string;
    sideEffectScope?: string;
    needsApproval?: boolean;
    concurrentSafe?: boolean;
  };
};
type Ctx = Parameters<typeof workspaceKind>[0];

test("B-ex-31 bashToolEntry declares a high-risk, approval-gated, non-read-only tool", () => {
  const entry = bashToolEntry as unknown as BashEntry;
  assert.equal(entry.metadata?.readOnly, false);
  assert.equal(entry.metadata?.destructive, false);
  assert.equal(entry.metadata?.riskLevel, "high");
  assert.equal(entry.metadata?.sideEffectScope, "system");
  assert.equal(entry.metadata?.needsApproval, true);
  assert.equal(entry.metadata?.concurrentSafe, false);
});

test("B-ex-32 classifyCommand buckets well-known command families", () => {
  assert.equal(classifyCommand("git status"), "git");
  assert.equal(classifyCommand("npm install"), "package");
  assert.equal(classifyCommand("ls -la"), "other");
});

test("B-ex-33 classifySafeCommandIdentity collapses an invocation to a safe identity", () => {
  assert.deepEqual(classifySafeCommandIdentity("git push origin main"), { count: 1, name: "git" });
  assert.deepEqual(classifySafeCommandIdentity("ls -la"), { count: 1, name: "ls" });
});

test("B-ex-34 commandHash is deterministic for the same command", () => {
  assert.equal(commandHash("git status"), commandHash("git status"));
  assert.equal(typeof commandHash("git status"), "string");
  assert.ok(commandHash("git status").length > 0);
});

test("B-ex-35 roundNonNegativeMs clamps negatives and floors values", () => {
  assert.equal(roundNonNegativeMs(-5), 0);
  assert.equal(roundNonNegativeMs(12.3456), 12);
});

test("B-ex-36 elapsedMsSince yields a non-negative number", () => {
  const elapsed = elapsedMsSince(Date.now() - 10);
  assert.equal(typeof elapsed, "number");
  assert.ok(elapsed >= 0);
});

test("B-ex-37 fileByteCount counts UTF-8 bytes", () => {
  assert.equal(fileByteCount("hello"), 5);
  assert.equal(fileByteCount("é"), 2);
});

test("B-ex-38 readToolExecutionTelemetry returns undefined for a plain object", () => {
  assert.equal(readToolExecutionTelemetry({}), undefined);
});

test("B-ex-39 workspaceKind reports local for a local context", () => {
  const context = {
    workspaceIdentity: "C:\\ws",
    workingDirectory: "C:\\ws",
  } as unknown as Ctx;
  assert.equal(workspaceKind(context), "local");
});
