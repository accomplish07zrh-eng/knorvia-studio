// SPDX-License-Identifier: Apache-2.0
// 相位结算：成功（写工件、活动完成、事件）与失败（活动失败、事件）。
import { phaseNodeId } from "./ids.js";
import type { ExpertWorkflowRuntimeContext } from "./runtime-context.js";
import type { ExpertWorkflowRunOptions, WorkflowAgentRunResult } from "./types.js";
import type { ExpertWorkflowRunSnapshot, WorkflowPhaseDefinition } from "@knorvia/contracts";

type Run = ExpertWorkflowRunSnapshot;
type PhaseDef = WorkflowPhaseDefinition;
type Trace = { traceId: string } | undefined;
type Activity = Parameters<ExpertWorkflowRuntimeContext["upsertActivity"]>[1];

/** 活动开始时间：优先沿用已有活动，否则取当前时间。 */
const startedAtOf = (state: Run, activityId: string, fallback: string): string =>
  state.activities.find((entry) => entry.activityId === activityId)?.startedAt ?? fallback;

/** 完成态活动字段表。 */
const completedActivityFields = (
  activityId: string,
  artifactPath: string,
  inputs: readonly string[],
  phase: PhaseDef,
  started: Run,
  result: WorkflowAgentRunResult,
  traceId: string | undefined,
  startedAt: string,
  now: string,
): readonly (readonly [string, unknown])[] => {
  const rows: (readonly [string, unknown])[] = [
    ["activityId", activityId],
    ["artifactPath", artifactPath],
    ["completedAt", now],
    ["inputArtifactPaths", inputs],
    ["kind", "agent_session"],
    ["nodeId", phaseNodeId(phase.phase)],
    ["outputArtifactPaths", [artifactPath]],
    ["parentSessionId", started.sessionId],
    ["phase", phase.phase],
    ["sessionId", result.sessionId],
    ["startedAt", startedAt],
    ["status", "completed"],
    ["traceId", traceId],
    ["turnId", result.turnId],
  ];
  if (result.model !== undefined) rows.push(["model", result.model]);
  return rows;
};

/** 成功结算：工件落盘 → 相位/活动完成 → 快照落盘 → 事件。 */
export async function completePhaseRun(
  runtime: ExpertWorkflowRuntimeContext,
  state: Run,
  phase: PhaseDef,
  activityId: string,
  inputs: readonly string[],
  started: Run,
  options: ExpertWorkflowRunOptions,
  trace: Trace,
  result: WorkflowAgentRunResult,
): Promise<Run> {
  const targetPath = phase.artifactPath ?? `artifacts/${phase.phase}.md`;
  const artifact = await runtime.store.writeArtifact(started.runId, targetPath, result.response, {
    signal: options.abortSignal,
  });
  const traceId = result.traceId ?? trace?.traceId;
  const completedPhase = runtime.updatePhase(state, phase.phase, {
    activityId,
    artifactPath: artifact.relativePath,
    completedAt: runtime.timestamp(),
    sessionId: result.sessionId,
    status: "completed",
    traceId,
    turnId: result.turnId,
  });
  const now = runtime.timestamp();
  const activity = Object.fromEntries(
    completedActivityFields(
      activityId,
      artifact.relativePath,
      inputs,
      phase,
      started,
      result,
      traceId,
      startedAtOf(state, activityId, now),
      now,
    ),
  ) as unknown as Activity;
  const completedSnapshot = runtime.addArtifact(runtime.upsertActivity(completedPhase, activity), {
    contentType: "text/markdown",
    createdAt: runtime.timestamp(),
    label: phase.title,
    path: artifact.relativePath,
    phase: phase.phase,
  });

  await runtime.store.writeSnapshot(completedSnapshot, { signal: options.abortSignal });
  await runtime.appendGraphStatus(completedSnapshot, phase.phase, "completed", options.abortSignal);
  await runtime.appendEvent(completedSnapshot.runId, "artifact_written", {
    message: `Artifact written: ${artifact.relativePath}`,
    phase: phase.phase,
    signal: options.abortSignal,
  });
  await runtime.appendEvent(completedSnapshot.runId, "phase_completed", {
    message: `${phase.title} completed.`,
    phase: phase.phase,
    signal: options.abortSignal,
  });
  return completedSnapshot;
}

/** 失败态活动字段表：只保留已有活动里能带过来的字段。 */
const failedActivityFields = (
  activityId: string,
  inputs: readonly string[],
  phase: PhaseDef,
  started: Run,
  current: Run["activities"][number] | undefined,
  errorMessage: string,
  traceId: string | undefined,
  now: string,
): readonly (readonly [string, unknown])[] => {
  const rows: (readonly [string, unknown])[] = [
    ["activityId", activityId],
    ["completedAt", now],
    ["error", errorMessage],
    ["inputArtifactPaths", inputs],
    ["kind", "agent_session"],
    ["nodeId", phaseNodeId(phase.phase)],
    ["outputArtifactPaths", []],
    ["parentSessionId", started.sessionId],
    ["phase", phase.phase],
    ["startedAt", current?.startedAt ?? now],
    ["status", "failed"],
    ["traceId", traceId],
  ];
  if (current?.model !== undefined) rows.push(["model", current.model]);
  if (current?.sessionId !== undefined) rows.push(["sessionId", current.sessionId]);
  if (current?.turnId !== undefined) rows.push(["turnId", current.turnId]);
  return rows;
};

/** 失败结算：相位/活动标记 failed → 快照落盘 → 事件（错误仍向上抛）。 */
export async function failPhaseRun(
  runtime: ExpertWorkflowRuntimeContext,
  state: Run,
  phase: PhaseDef,
  activityId: string,
  inputs: readonly string[],
  started: Run,
  options: ExpertWorkflowRunOptions,
  trace: Trace,
  thrown: unknown,
): Promise<Run> {
  const errorMessage = thrown instanceof Error ? thrown.message : String(thrown);
  const current = state.activities.find((entry) => entry.activityId === activityId);
  const traceId = current?.traceId ?? trace?.traceId;
  const now = runtime.timestamp();
  const failedPhase = runtime.updatePhase(state, phase.phase, {
    activityId,
    completedAt: now,
    error: errorMessage,
    status: "failed",
  });
  const activity = Object.fromEntries(
    failedActivityFields(activityId, inputs, phase, started, current, errorMessage, traceId, now),
  ) as unknown as Activity;
  const failedSnapshot = runtime.upsertActivity(failedPhase, activity);

  await runtime.store.writeSnapshot(failedSnapshot, { signal: options.abortSignal });
  await runtime.appendGraphStatus(failedSnapshot, phase.phase, "failed", options.abortSignal);
  await runtime.appendEvent(failedSnapshot.runId, "phase_failed", {
    message: errorMessage,
    phase: phase.phase,
    signal: options.abortSignal,
  });
  return failedSnapshot;
}
