// SPDX-License-Identifier: Apache-2.0
// 调度相位的收尾：写汇总工件、把相位标记完成、登记工件并发出完成事件。
import type { ExpertWorkflowRunSnapshot, WorkflowPhaseDefinition } from "@knorvia/contracts";
import { buildScheduledPhaseSummary } from "./prompts.js";
import type { ExpertWorkflowRuntimeContext } from "./runtime-context.js";
import type { ExpertWorkflowRunOptions } from "./types.js";

/** 收尾：汇总 → 工件 → 相位完成 → 图状态与事件。 */
export async function completeScheduledPhase(
  runtime: ExpertWorkflowRuntimeContext,
  input: ExpertWorkflowRunSnapshot,
  phaseDefinition: WorkflowPhaseDefinition,
  runOptions: ExpertWorkflowRunOptions,
): Promise<ExpertWorkflowRunSnapshot> {
  const artifact = await runtime.store.writeArtifact(
    input.runId,
    phaseDefinition.artifactPath ?? `artifacts/${phaseDefinition.phase}.md`,
    buildScheduledPhaseSummary(input, phaseDefinition.phase),
    { signal: runOptions.abortSignal },
  );

  const latest = input.activities
    .filter((entry) => entry.phase === phaseDefinition.phase && entry.status === "completed")
    .at(-1);
  const done = runtime.updatePhase(input, phaseDefinition.phase, {
    activityId: latest?.activityId,
    artifactPath: artifact.relativePath,
    completedAt: runtime.timestamp(),
    sessionId: latest?.sessionId,
    status: "completed",
    traceId: latest?.traceId,
    turnId: latest?.turnId,
  });
  const registered = runtime.addArtifact(done, {
    contentType: "text/markdown",
    createdAt: runtime.timestamp(),
    label: phaseDefinition.title,
    path: artifact.relativePath,
    phase: phaseDefinition.phase,
  });

  await runtime.store.writeSnapshot(registered, { signal: runOptions.abortSignal });
  await runtime.appendGraphStatus(
    registered,
    phaseDefinition.phase,
    "completed",
    runOptions.abortSignal,
  );
  await runtime.appendEvent(registered.runId, "artifact_written", {
    message: `Artifact written: ${artifact.relativePath}`,
    phase: phaseDefinition.phase,
    signal: runOptions.abortSignal,
  });
  await runtime.appendEvent(registered.runId, "phase_completed", {
    message: `${phaseDefinition.title} completed.`,
    phase: phaseDefinition.phase,
    signal: runOptions.abortSignal,
  });
  return registered;
}
