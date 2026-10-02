import { z } from "zod";

import { timestampSchema } from "./core.js";

import type { BackgroundWorkSummary } from "./snapshot.js";

import {
  WORKFLOW_RUNS_LIMITS,
  workflowRunSchema,
  type WorkflowRunNode,
  type WorkflowRunState,
  type WorkflowRunsState,
} from "./workflow-runs.js";

export const SESSION_WORKFLOW_ACTIVITY_MAX_RUNS = 4;

export const sessionWorkflowPhaseStatusSchema = z.enum(["pending", "running", "done", "failed"]);

export const sessionWorkflowPhaseSummarySchema = z.object({
  name: z.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxPhaseNameLength),
  status: sessionWorkflowPhaseStatusSchema,
  alongside: z.array(z.number().int().nonnegative()).max(WORKFLOW_RUNS_LIMITS.maxPhases).optional(),
});

export const sessionWorkflowRunSummarySchema = z.object({
  runId: z.string().min(1),
  toolCallId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  status: workflowRunSchema.shape.status,
  stopReason: workflowRunSchema.shape.stopReason,
  startedAt: timestampSchema.optional(),
  phases: z.array(sessionWorkflowPhaseSummarySchema).max(WORKFLOW_RUNS_LIMITS.maxPhases),
  currentPhase: z.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxPhaseNameLength).optional(),
  agentsWorking: z.number().int().nonnegative(),
});

export const sessionWorkflowActivitySchema = z.object({
  runs: z.array(sessionWorkflowRunSummarySchema).max(SESSION_WORKFLOW_ACTIVITY_MAX_RUNS),
});

export type SessionWorkflowPhaseStatus = z.infer<typeof sessionWorkflowPhaseStatusSchema>;

export type SessionWorkflowPhaseSummary = z.infer<typeof sessionWorkflowPhaseSummarySchema>;

export type SessionWorkflowRunSummary = z.infer<typeof sessionWorkflowRunSummarySchema>;

export type SessionWorkflowActivity = z.infer<typeof sessionWorkflowActivitySchema>;

export function isSessionWorkflowRunLive(status: SessionWorkflowRunSummary["status"]): boolean {
  return status === "pending" || status === "running";
}

function activeNodeStamp(node: WorkflowRunNode): string | undefined {
  switch (node.phase) {
    case "executing":
    case "repairing":
    case "nudged":
      return node.phaseName;
    default:
      return undefined;
  }
}

function summarizePhases(run: WorkflowRunState): SessionWorkflowPhaseSummary[] {
  const enteredNames = (run.phases ?? []).map((phase) => phase.name);
  const entered = new Set(enteredNames);
  const declared = run.phaseNames !== undefined && run.phaseNames.length > 0;
  const names = declared ? run.phaseNames! : enteredNames;
  const stations = names.slice();
  if (!declared && run.currentPhase !== undefined && !entered.has(run.currentPhase)) {
    stations.push(run.currentPhase);
  }
  const emitted = stations.slice(0, WORKFLOW_RUNS_LIMITS.maxPhases);
  const live = isSessionWorkflowRunLive(run.status);
  const activeStamps: string[] = [];
  if (live) {
    for (const node of run.nodes) {
      const stamp = activeNodeStamp(node);
      if (stamp !== undefined) activeStamps.push(stamp);
    }
  }

  return emitted.map((name, index) => {
    const current = name === run.currentPhase;
    const visited = entered.has(name);
    let status: SessionWorkflowPhaseStatus = "pending";
    if (live) {
      const active = activeStamps.some(
        (stamp) =>
          name === stamp ||
          (name.length >= WORKFLOW_RUNS_LIMITS.maxPhaseNameLength && stamp.startsWith(name)),
      );
      if (current || active) status = "running";
      else if (visited || current) status = "done";
    } else if (run.status === "completed") {
      if (visited || current) status = "done";
    } else if (run.status === "errored") {
      if (current) status = "failed";
      else if (visited) status = "done";
    } else if (!current && visited) {
      status = "done";
    }

    const phase: SessionWorkflowPhaseSummary = { name, status };
    if (declared) {
      const alongside = (run.phaseAlongside?.[index] ?? []).filter(
        (other) =>
          Number.isInteger(other) && other >= 0 && other < emitted.length && other !== index,
      );
      if (alongside.length > 0) phase.alongside = alongside;
    }
    return phase;
  });
}

function summarizeRun(
  run: WorkflowRunState,
  work: BackgroundWorkSummary | undefined,
): SessionWorkflowRunSummary {
  const summary: SessionWorkflowRunSummary = {
    runId: run.runId,
    status: run.status,
    phases: summarizePhases(run),
    agentsWorking: run.actors.reduce(
      (count, actor) => count + (actor.status === "running" ? 1 : 0),
      0,
    ),
  };
  if (run.toolCallId !== undefined) summary.toolCallId = run.toolCallId;
  if (run.stopReason !== undefined) summary.stopReason = run.stopReason;
  if (run.currentPhase !== undefined) summary.currentPhase = run.currentPhase;
  if (work !== undefined) {
    const title = work.title.trim();
    if (title.length > 0) summary.name = title;
    summary.startedAt = work.startedAt;
  }
  return summary;
}

export function deriveSessionWorkflowActivity(input: {
  workflowRuns: WorkflowRunsState | undefined;
  backgroundWorks: readonly BackgroundWorkSummary[];
}): SessionWorkflowActivity | undefined {
  const runs = input.workflowRuns?.runs;
  if (runs === undefined || runs.length === 0) return undefined;

  const workByRun = new Map<string, BackgroundWorkSummary>();
  for (const work of input.backgroundWorks) {
    if (work.kind === "workflow") workByRun.set(work.workId, work);
  }

  const liveSummaries: SessionWorkflowRunSummary[] = [];
  const settled: {
    summary: SessionWorkflowRunSummary;
    endedAt: number;
    launchIndex: number;
  }[] = [];
  runs.forEach((run, launchIndex) => {
    const work = workByRun.get(run.runId);
    const summary = summarizeRun(run, work);
    if (isSessionWorkflowRunLive(run.status)) {
      liveSummaries.push(summary);
    } else {
      settled.push({ summary, endedAt: work?.endedAt ?? 0, launchIndex });
    }
  });
  settled.sort(
    (first, second) => second.endedAt - first.endedAt || second.launchIndex - first.launchIndex,
  );
  return {
    runs: liveSummaries
      .concat(settled.map((entry) => entry.summary))
      .slice(0, SESSION_WORKFLOW_ACTIVITY_MAX_RUNS),
  };
}
