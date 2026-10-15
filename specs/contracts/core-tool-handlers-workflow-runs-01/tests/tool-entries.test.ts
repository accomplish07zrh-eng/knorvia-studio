// SPDX-License-Identifier: Apache-2.0
// 六个工具入口的元数据/权限/预算/trace 恒等（B-tp-1..6）。语义常量总表逐项对照。
import assert from "node:assert/strict";
import { test } from "node:test";

const getModule =
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run.js");
const listRunsModule =
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/list-workflow-runs.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/list-workflow-runs.js");
const listSavedModule =
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/list-saved-workflows.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/list-saved-workflows.js");
const listModelsModule =
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/list-models.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/list-models.js");
const resumeModule =
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/resume-workflow-run.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/resume-workflow-run.js");
const resolveModule =
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/resolve-workflow-question.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/resolve-workflow-question.js");

const ENTRIES = {
  get: getModule.getWorkflowRunToolEntry,
  listRuns: listRunsModule.listWorkflowRunsToolEntry,
  listSaved: listSavedModule.listSavedWorkflowsToolEntry,
  listModels: listModelsModule.listModelsToolEntry,
  resume: resumeModule.resumeWorkflowRunToolEntry,
  resolve: resolveModule.resolveWorkflowQuestionToolEntry,
} as const;

function assertReadOnlySurface(
  name: keyof typeof ENTRIES,
  timeoutMs: number,
  cancelMessage: RegExp,
) {
  const entry = ENTRIES[name];
  const meta = entry.metadata;
  assert.equal(meta.readOnly, true, name);
  assert.equal(meta.destructive, false, name);
  assert.equal(meta.concurrentSafe, true, name);
  assert.equal(meta.timeoutMs, timeoutMs, name);
  assert.equal(meta.sideEffectScope, "none", name);
  assert.equal(meta.riskLevel, "low", name);
  assert.equal(meta.needsApproval, false, name);
  assert.equal(entry.timeout.kind, "timed", name);
  assert.equal(entry.timeout.defaultMs, timeoutMs, name);
  assert.equal(entry.timeout.maxMs, timeoutMs, name);
  assert.equal(entry.timeout.allowCallOverride, false, name);
  assert.equal(entry.cancellation.supported, false, name);
  assert.equal(entry.cancellation.cleanup, "none", name);
  assert.match(String(entry.cancellation.userVisibleMessage), cancelMessage, name);
  assert.deepEqual(
    entry.trace,
    {
      required: true,
      propagateToAdapters: false,
      recordInput: "summary",
      recordOutput: "summary",
    },
    name,
  );
  assert.equal(entry.permission.needsApproval, false, name);
  assert.equal(entry.permission.denyPriority, "beforeAsk", name);
  assert.deepEqual(entry.permission.alwaysAllowPatternSources, ["toolName"], name);
}

test("B-tp-1 getWorkflowRunToolEntry: artifact strategy, 400k budget, 100k model chars, input in pattern", () => {
  const entry = ENTRIES.get;
  assertReadOnlySurface("get", 10_000, /reads the run journal synchronously/u);
  assert.equal(entry.metadata.maxOutputBytes, 400_000);
  assert.equal(entry.maxModelChars, 100_000);
  assert.deepEqual(entry.resultBudget, {
    maxInlineBytes: 400_000,
    maxModelBytes: 400_000,
    strategy: "artifact",
    preview: { maxBytes: 400_000, direction: "head" },
    artifact: { enabled: true, retention: "session" },
  });
  assert.equal(entry.resultArtifactContentType, "text/plain");
  assert.deepEqual(entry.permission.patternSources, ["toolName", "input"]);
  assert.equal(entry.permission.permission, "getWorkflowRun");
});

test("B-tp-2 listWorkflowRunsToolEntry: 24k truncate/head, toolName-only patterns, no inherited alwaysAsk", () => {
  const entry = ENTRIES.listRuns;
  assertReadOnlySurface("listRuns", 10_000, /reads the run journal synchronously/u);
  assert.equal(entry.metadata.maxOutputBytes, 24_000);
  assert.equal(entry.resultBudget.strategy, "truncate");
  assert.deepEqual(entry.permission.patternSources, ["toolName"]);
  assert.equal(entry.permission.permission, "listWorkflowRuns");
  assert.equal(entry.metadata.description.includes("alwaysAsk"), false);
});

test("B-tp-3 listSavedWorkflowsToolEntry: 24k truncate/head, toolName-only, cancel wording pinned", () => {
  const entry = ENTRIES.listSaved;
  assertReadOnlySurface(
    "listSaved",
    10_000,
    /scans the project's workflow directory synchronously/u,
  );
  assert.equal(entry.resultBudget.strategy, "truncate");
  assert.deepEqual(entry.permission.patternSources, ["toolName"]);
  assert.equal(entry.permission.permission, "listSavedWorkflows");
});

test("B-tp-4 listModelsToolEntry: 24k truncate/head, toolName-only, cancel wording pinned", () => {
  const entry = ENTRIES.listModels;
  assertReadOnlySurface(
    "listModels",
    10_000,
    /reads the in-memory model catalog synchronously|reads the in-memory model catalog/u,
  );
  assert.equal(entry.resultBudget.strategy, "truncate");
  assert.deepEqual(entry.permission.patternSources, ["toolName"]);
  assert.equal(entry.permission.permission, "listModels");
});

test("B-tp-5 resumeWorkflowRunToolEntry: readOnly false, 15s, propagateToAdapters true, input patterns", () => {
  const entry = ENTRIES.resume;
  const meta = entry.metadata;
  assert.equal(meta.readOnly, false);
  assert.equal(meta.needsApproval, false);
  assert.equal(meta.timeoutMs, 15_000);
  assert.equal(meta.maxOutputBytes, 24_000);
  assert.equal(entry.timeout.defaultMs, 15_000);
  assert.deepEqual(entry.trace, {
    required: true,
    propagateToAdapters: true,
    recordInput: "summary",
    recordOutput: "summary",
  });
  assert.deepEqual(entry.permission.patternSources, ["toolName", "input"]);
  assert.equal(entry.permission.permission, "resumeWorkflowRun");
  assert.match(String(entry.permission.reason), /^resumeWorkflowRun\.runConfirmation:/u);
  assert.match(String(entry.cancellation.userVisibleMessage), /cannot be cancelled/u);
});

test("B-tp-6 resolveWorkflowQuestionToolEntry: readOnly false, 15s, propagateToAdapters true, input patterns", () => {
  const entry = ENTRIES.resolve;
  assert.equal(entry.metadata.readOnly, false);
  assert.equal(entry.metadata.needsApproval, false);
  assert.equal(entry.metadata.timeoutMs, 15_000);
  assert.equal(entry.metadata.maxOutputBytes, 24_000);
  assert.deepEqual(entry.trace, {
    required: true,
    propagateToAdapters: true,
    recordInput: "summary",
    recordOutput: "summary",
  });
  assert.deepEqual(entry.permission.patternSources, ["toolName", "input"]);
  assert.equal(entry.permission.permission, "resolveWorkflowQuestion");
});
