// SPDX-License-Identifier: Apache-2.0
// 金样往返：fixtures/workflow-runs-goldens.json 是**旧实现**（继承源码）对固定输入快照的输出
// 真值（record-goldens.mjs 录制）。本文件用被替换实现对同输入重放并逐字节比对——
// 「旧写→新读→新写→旧读」的后半程（旧写已入库）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const goldens = JSON.parse(
  readFileSync(join(here, "..", "fixtures", "workflow-runs-goldens.json"), "utf8"),
) as {
  inputs: Record<string, Record<string, unknown>>;
  summary: Record<string, string>;
  modelContent: Record<string, string>;
  rosterBlocks: Record<string, string>;
  activities: Record<string, string>;
  guidance: Record<string, string>;
  generatedAtNow: number;
};

const { buildWorkflowRunSummary } =
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run-summary.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run-summary.js");
const { formatGetWorkflowRunModelContent } =
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run-format.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run-format.js");
const {
  formatWorkflowRunHealthBlock,
  formatWorkflowRunPhasesBlock,
  formatWorkflowRunSubagentsBlock,
  formatWorkflowRunLogTailBlock,
} =
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run-format-roster.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run-format-roster.js");
const { renderWorkflowRunActivity } =
  (await import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run-activity-program.js")) as typeof import("../../../../apps/cli/packages/core/src/tool/handlers/get-workflow-run-activity-program.js");

test("goldens: summary is byte-identical to the recorded truth for all four snapshots", () => {
  for (const [key, input] of Object.entries(goldens.inputs)) {
    assert.equal(buildWorkflowRunSummary(input as never), goldens.summary[key], `summary/${key}`);
  }
});

test("goldens: GetWorkflowRun model content is byte-identical for all four snapshots", () => {
  for (const [key, input] of Object.entries(goldens.inputs)) {
    const output = { ...input, summary: goldens.summary[key] };
    assert.equal(
      formatGetWorkflowRunModelContent(output),
      goldens.modelContent[key],
      `modelContent/${key}`,
    );
  }
});

test("goldens: roster blocks (health/phases/subagents/log_tail) are byte-identical", () => {
  const running = { ...goldens.inputs.RUNNING, summary: goldens.summary.RUNNING };
  const completed = { ...goldens.inputs.COMPLETED, summary: goldens.summary.COMPLETED };
  const stopped = { ...goldens.inputs.STOPPED, summary: goldens.summary.STOPPED };
  assert.equal(
    formatWorkflowRunHealthBlock(running as never, false),
    goldens.rosterBlocks.healthRunning,
  );
  assert.equal(
    formatWorkflowRunHealthBlock(completed as never, true),
    goldens.rosterBlocks.healthCompleted,
  );
  assert.equal(formatWorkflowRunPhasesBlock(running as never, false), goldens.rosterBlocks.phases);
  assert.equal(formatWorkflowRunSubagentsBlock(running as never), goldens.rosterBlocks.subagents);
  assert.equal(formatWorkflowRunLogTailBlock(running as never), goldens.rosterBlocks.logTail);
  assert.equal(formatWorkflowRunLogTailBlock(stopped as never), goldens.rosterBlocks.logTailEmpty);
});

test("goldens: activity lines for every roster phase are byte-identical", () => {
  const running = goldens.inputs.RUNNING as unknown as {
    subagents: Array<Record<string, unknown>>;
    pendingQuestions: Array<{ qid: string; askedAt: number }>;
  };
  const askedAtByQid = new Map(running.pendingQuestions.map((q) => [q.qid, q.askedAt]));
  for (const subagent of running.subagents) {
    const key = `${String(subagent.siteId)}@${String(subagent.ordinal)}`;
    assert.equal(
      renderWorkflowRunActivity(subagent as never, goldens.generatedAtNow, askedAtByQid),
      goldens.activities[key],
      `activity/${key}`,
    );
  }
});

test("goldens: resume and resolve guidance responses are byte-identical", () => {
  // 文案逐字：这两段是模型下一步的唯一依据（B-rw-2 / B-qs-2）
  assert.equal(
    `The workflow run dwfr-golden-stopped has been resumed and is running in the background. It is still running — you will be notified with the final output when it completes. Do not wait for it or poll it with TaskOutput; continue with other work unless the user asked you to wait.`,
    goldens.guidance.resumeResponse,
  );
  assert.equal(
    `Answer delivered for question dwfq-golden-1. The subagent that asked has resumed its turn with your answer; the run keeps going as before.`,
    goldens.guidance.resolveResponse,
  );
});
