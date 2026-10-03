import { carryNodeProgress } from "./workflow-runs-node-progress.js";
import {
  WORKFLOW_RUNS_LIMITS,
  type WorkflowRunActor,
  type WorkflowRunNode,
  type WorkflowRunState,
} from "./workflow-runs.js";
import {
  BoundedWorkflowRows,
  sameWorkflowInstance,
  workflowReference,
  workflowText,
  type WorkflowInstanceIdentity,
} from "./workflow-run-collections.js";

// 固定事件词汇与字段政策沿用现有合同；不计为新的原创表达。
const nodePhases: Readonly<Record<string, WorkflowRunNode["phase"]>> = {
  "node-queued": "queued",
  "node-dispatched": "dispatched",
  "node-executing": "executing",
  "node-waiting": "waiting",
  "node-repairing": "repairing",
  "node-nudged": "nudged",
  "node-settled": "settled",
};

export function workflowNodePhase(eventType: string): WorkflowRunNode["phase"] | undefined {
  return Object.hasOwn(nodePhases, eventType) ? nodePhases[eventType] : undefined;
}

/** 节点观察只在本次计算中汇总；不为 actor 维护第二份生命周期状态。 */
export function deriveWorkflowActors(run: WorkflowRunState): WorkflowRunState {
  const observations = new Map<string, Map<string, number>>();
  for (const node of run.nodes) {
    if (node.actorSiteId === undefined || node.actorOrdinal === undefined) continue;
    let instances = observations.get(node.actorSiteId);
    if (!instances) {
      instances = new Map();
      observations.set(node.actorSiteId, instances);
    }
    const ordinal = String(node.actorOrdinal);
    let flags = (instances.get(ordinal) ?? 0) | 1;
    if (node.phase === "executing" || node.phase === "repairing" || node.phase === "nudged") {
      flags |= 4;
    } else if (node.phase === "queued" || node.phase === "dispatched" || node.phase === "waiting") {
      flags |= 2;
    }
    instances.set(ordinal, flags);
  }
  const live = run.status === "pending" || run.status === "running";
  const actors = run.actors.map((actor) => {
    const flags = observations.get(actor.siteId)?.get(String(actor.ordinal)) ?? 0;
    let status: WorkflowRunActor["status"] = "completed";
    if (live) {
      if (flags & 4) status = "running";
      else if (flags & 2 || !(flags & 1)) status = "waiting";
    }
    return status === actor.status ? actor : { ...actor, status };
  });
  return { ...run, actors };
}

export function projectWorkflowActor(
  run: WorkflowRunState,
  payload: Record<string, unknown>,
  sessionId: string | undefined,
): WorkflowRunState {
  const ref = workflowReference(payload.actor);
  if (!ref) return run;
  const name = workflowText(payload.name)?.slice(0, WORKFLOW_RUNS_LIMITS.maxActorNameLength);
  const phaseName = workflowText(payload.phaseName)?.slice(
    0,
    WORKFLOW_RUNS_LIMITS.maxPhaseNameLength,
  );
  const actor: WorkflowRunActor = {
    siteId: ref.siteId,
    ordinal: ref.ordinal,
    ...(name ? { name } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(phaseName === undefined ? {} : { phaseName }),
    status: "waiting",
  };
  const table = new BoundedWorkflowRows<WorkflowRunActor, WorkflowInstanceIdentity>(
    run.actors,
    WORKFLOW_RUNS_LIMITS.maxActors,
    (row) => row,
    sameWorkflowInstance,
  );
  const result = table.write(actor);
  return deriveWorkflowActors({
    ...run,
    actors: result.rows,
    ...(result.overflow || run.truncated ? { truncated: true } : {}),
  });
}

export function projectWorkflowNode(
  run: WorkflowRunState,
  eventType: string,
  phase: WorkflowRunNode["phase"],
  payload: Record<string, unknown>,
): WorkflowRunState {
  const ref = workflowReference(payload.instance);
  if (!ref) return run;
  const table = new BoundedWorkflowRows<WorkflowRunNode, WorkflowInstanceIdentity>(
    run.nodes,
    WORKFLOW_RUNS_LIMITS.maxNodes,
    (row) => row,
    sameWorkflowInstance,
  );
  const previous = table.lookup(ref);
  const actor = workflowReference(payload.actor);
  const kind =
    payload.kind === "ask" || payload.kind === "world-read" ? payload.kind : previous?.kind;
  const phaseName =
    workflowText(payload.phaseName)?.slice(0, WORKFLOW_RUNS_LIMITS.maxPhaseNameLength) ??
    previous?.phaseName;
  const node: WorkflowRunNode = {
    siteId: ref.siteId,
    ordinal: ref.ordinal,
    ...(kind === undefined ? {} : { kind }),
    phase,
    ...(payload.outcome === "ok" || payload.outcome === "failed" || payload.outcome === "cancelled"
      ? { outcome: payload.outcome }
      : {}),
    ...(payload.cached === true ? { cached: true } : {}),
    ...(actor
      ? { actorSiteId: actor.siteId, actorOrdinal: actor.ordinal }
      : previous?.actorSiteId !== undefined
        ? { actorSiteId: previous.actorSiteId, actorOrdinal: previous.actorOrdinal }
        : {}),
    ...(phaseName === undefined ? {} : { phaseName }),
    ...carryNodeProgress(eventType, payload, previous),
  };
  const result = table.write(node);
  const firstDispatch =
    eventType === "node-dispatched" && (!previous || previous.phase === "queued");
  return deriveWorkflowActors({
    ...run,
    ...(firstDispatch ? { usage: { ...run.usage, nodesUsed: run.usage.nodesUsed + 1 } } : {}),
    nodes: result.rows,
    ...(result.overflow || run.truncated ? { truncated: true } : {}),
  });
}
