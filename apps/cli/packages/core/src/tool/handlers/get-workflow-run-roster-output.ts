import type {
  DynamicWorkflowRunHealth,
  DynamicWorkflowRunPhaseView,
  DynamicWorkflowRunSubagentAsk,
  DynamicWorkflowRunSubagentView,
  DynamicWorkflowRunSubagentWait,
  GetWorkflowRunHealth,
  GetWorkflowRunPhase,
  GetWorkflowRunSubagent,
  GetWorkflowRunSubagentAsk,
} from "@knorvia/contracts";
import { GET_WORKFLOW_RUN_ROSTER_LIMITS } from "@knorvia/contracts";

export function toGetWorkflowRunPhases(
  phases: readonly DynamicWorkflowRunPhaseView[] | undefined,
): GetWorkflowRunPhase[] | undefined {
  if (phases === undefined || phases.length === 0) {
    return undefined;
  }

  return phases.slice(0, GET_WORKFLOW_RUN_ROSTER_LIMITS.maxPhases).map((phase) => ({
    name: phase.name,
    state: phase.state,
    rounds: phase.rounds,
    nodesSettled: phase.nodesSettled,
    nodesRunning: phase.nodesRunning,
    ...(phase.enteredAt !== undefined ? { enteredAt: phase.enteredAt } : {}),
    ...(phase.exitedAt !== undefined ? { exitedAt: phase.exitedAt } : {}),
  }));
}

function projectAsk(ask: DynamicWorkflowRunSubagentAsk): GetWorkflowRunSubagentAsk {
  return {
    siteId: ask.siteId,
    ordinal: ask.ordinal,
    ...(ask.actorSeq !== undefined ? { actorSeq: ask.actorSeq } : {}),
    ...(ask.instructionsHead !== undefined ? { instructionsHead: ask.instructionsHead } : {}),
    ...(ask.startedAt !== undefined ? { startedAt: ask.startedAt } : {}),
    ...(ask.turn !== undefined ? { turn: ask.turn } : {}),
    ...(ask.toolCalls !== undefined ? { toolCalls: ask.toolCalls } : {}),
    ...(ask.lastTool !== undefined
      ? {
          lastTool: {
            name: ask.lastTool.name,
            ...(ask.lastTool.target !== undefined ? { target: ask.lastTool.target } : {}),
            ...(ask.lastTool.at !== undefined ? { at: ask.lastTool.at } : {}),
          },
        }
      : {}),
  };
}

function projectWait(
  wait: DynamicWorkflowRunSubagentWait,
): NonNullable<GetWorkflowRunSubagent["wait"]> {
  return {
    cause: wait.cause,
    ...(wait.reason !== undefined ? { reason: wait.reason } : {}),
    ...(wait.retryAfterMs !== undefined ? { retryAfterMs: wait.retryAfterMs } : {}),
    ...(wait.since !== undefined ? { since: wait.since } : {}),
  };
}

export function toGetWorkflowRunSubagents(subagents: readonly DynamicWorkflowRunSubagentView[]): {
  subagents: GetWorkflowRunSubagent[];
  truncated: boolean;
} {
  const projected: GetWorkflowRunSubagent[] = subagents
    .slice(0, GET_WORKFLOW_RUN_ROSTER_LIMITS.maxSubagents)
    .map((subagent) => ({
      siteId: subagent.siteId,
      ordinal: subagent.ordinal,
      ...(subagent.name !== undefined ? { name: subagent.name } : {}),
      state: subagent.state,
      ...(subagent.phaseName !== undefined ? { phaseName: subagent.phaseName } : {}),
      ...(subagent.currentAsk !== undefined ? { currentAsk: projectAsk(subagent.currentAsk) } : {}),
      ...(subagent.wait !== undefined ? { wait: projectWait(subagent.wait) } : {}),
      ...(subagent.parkedOn !== undefined ? { parkedOn: subagent.parkedOn } : {}),
      stepsSettled: subagent.stepsSettled,
      stepsFailed: subagent.stepsFailed,
      tokens: subagent.tokens,
      ...(subagent.lastProgressAt !== undefined ? { lastProgressAt: subagent.lastProgressAt } : {}),
    }));

  return {
    subagents: projected,
    truncated: projected.length < subagents.length,
  };
}

export function toGetWorkflowRunHealth(health: DynamicWorkflowRunHealth): GetWorkflowRunHealth {
  return {
    ...(health.lastProgressAt !== undefined ? { lastProgressAt: health.lastProgressAt } : {}),
    ...(health.stalledSince !== undefined ? { stalledSince: health.stalledSince } : {}),
    ...(health.concurrency !== undefined
      ? {
          concurrency: {
            effective: health.concurrency.effective,
            cap: health.concurrency.cap,
            ...(health.concurrency.reason !== undefined
              ? { reason: health.concurrency.reason }
              : {}),
            ...(health.concurrency.since !== undefined ? { since: health.concurrency.since } : {}),
          },
        }
      : {}),
    consecutiveFailures: health.consecutiveFailures,
    cachedSteps: health.cachedSteps,
    ...(health.leftoverRunning !== undefined && health.leftoverRunning !== 0
      ? { leftoverRunning: health.leftoverRunning }
      : {}),
    pendingQuestionsKnown: health.pendingQuestionsKnown,
  };
}
