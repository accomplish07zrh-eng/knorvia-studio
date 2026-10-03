import {
  WORKFLOW_RUNS_LIMITS,
  type WorkflowRunState,
  type WorkflowRunsState,
} from "./workflow-runs.js";
import { workflowRecord } from "./workflow-run-collections.js";
import { projectWorkflowRun } from "./workflow-run-projection.js";

/** 公开 envelope 保留原字段；与 contracts 的有界进度载荷结构相容，不跨向导入。 */
export interface WorkflowRunProgressEnvelope {
  runId?: string;
  toolCallId?: string;
  sequence?: number;
  eventType?: string;
  payload?: Record<string, unknown>;
  actorSessionId?: string;
}

/** 唯一 shared 入口：不读时钟、不排序迟到事件，只有 JSON 可见变化才产新 revision。 */
export function reduceWorkflowRunsState(
  previous: WorkflowRunsState | undefined,
  envelope: WorkflowRunProgressEnvelope,
): WorkflowRunsState | null {
  const runId = envelope.runId;
  if (!runId || typeof envelope.eventType !== "string") return null;
  const sequence = typeof envelope.sequence === "number" ? envelope.sequence : 0;
  const payload = workflowRecord(envelope.payload) ? (envelope.payload as Record<string, unknown>) : {};
  const prior = previous ?? { revision: 0, runs: [] };
  const existing = prior.runs.find((run) => run.runId === runId);
  const initial: WorkflowRunState = existing ?? {
    runId,
    ...(envelope.toolCallId ? { toolCallId: envelope.toolCallId } : {}),
    status: "pending",
    usage: { spentTokens: 0, nodesUsed: 0 },
    actors: [],
    nodes: [],
    lastEventSequence: sequence,
  };
  const next = projectWorkflowRun(initial, envelope.eventType, payload, {
    ...(envelope.actorSessionId === undefined ? {} : { actorSessionId: envelope.actorSessionId }),
    ...(envelope.toolCallId === undefined ? {} : { toolCallId: envelope.toolCallId }),
    sequence: Math.max(initial.lastEventSequence, sequence),
  });
  // 兼容既有 wire identity：不能把深比较或只按 sequence 去重替代 JSON 可见等价。
  if (existing !== undefined && JSON.stringify(existing) === JSON.stringify(next)) return null;
  const runs = existing
    ? prior.runs.map((run) => (run.runId === runId ? next : run))
    : [...prior.runs, next];
  return {
    revision: prior.revision + 1,
    runs:
      runs.length > WORKFLOW_RUNS_LIMITS.maxRuns
        ? runs.slice(runs.length - WORKFLOW_RUNS_LIMITS.maxRuns)
        : runs,
  };
}
