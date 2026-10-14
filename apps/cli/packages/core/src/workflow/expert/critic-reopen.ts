// SPDX-License-Identifier: Apache-2.0
// 终审重开：受理重开提案（被拒时回传事件）、写重开记录、把相位重置为 pending。
import type {
  ExpertWorkflowRunSnapshot,
  WorkflowCriticReopenProposal,
  WorkflowPhaseDefinition,
} from "@knorvia/contracts";
import { reopenWorkflowGraphNode } from "../lifecycle.js";
import { phaseNodeId } from "./ids.js";
import type { ExpertWorkflowRuntimeContext } from "./runtime-context.js";

type PhaseName = WorkflowPhaseDefinition["phase"];
type Run = ExpertWorkflowRunSnapshot;
type Done = Promise<void>;

/** 受理结果：成功给出重开次数与新快照；被拒返回 null。 */
export type ReopenAdmission = {
  reopenAttempts: number;
  snapshot: ExpertWorkflowRunSnapshot;
} | null;

/** 受理重开提案：超限等拒绝原因以事件回传，不向上抛错。 */
export async function admitReopen(
  runtime: ExpertWorkflowRuntimeContext,
  input: Run,
  candidate: WorkflowCriticReopenProposal,
  round: number,
  phaseName: PhaseName,
  cancel: AbortSignal | undefined,
): Promise<ReopenAdmission> {
  const reason = candidate.reason;
  const reject = async (error: unknown): Promise<null> => {
    const detail = error instanceof Error ? error.message : String(error);
    await runtime.appendEvent(input.runId, "critic_failed", {
      message: `Critic reopen rejected for ${candidate.nodeId}: ${detail}`,
      payload: { iteration: round, nodeId: candidate.nodeId, reason, rejected: true },
      phase: phaseName,
      signal: cancel,
    });
    return null;
  };
  try {
    const result = reopenWorkflowGraphNode(input, {
      maxReopens: 2,
      nodeId: candidate.nodeId,
      reason,
      timestamp: runtime.timestamp(),
    });
    return { reopenAttempts: result.reopenAttempts, snapshot: result.snapshot };
  } catch (error) {
    return await reject(error);
  }
}

/** 重开记录：op 记录里带上轮次、原因、重开次数与严重度。 */
export async function appendReopenRecord(
  runtime: ExpertWorkflowRuntimeContext,
  input: Run,
  candidate: WorkflowCriticReopenProposal,
  round: number,
  attemptCount: number,
  phaseName: PhaseName,
  cancel: AbortSignal | undefined,
): Done {
  const base = {
    nodeId: candidate.nodeId,
    phase: phaseName,
    recordType: "op" as const,
    runId: input.runId,
    timestamp: runtime.timestamp(),
  };
  const detail = {
    iteration: round,
    reason: candidate.reason,
    reopenAttempts: attemptCount,
    severity: candidate.severity,
  };
  await runtime.store.appendGraphRecord(
    input.runId,
    { ...base, payload: detail, status: "pending", type: "reopen_node" },
    { signal: cancel },
  );
}

/** 相位重置：图节点与相位条目都退回 pending，并写入错误原因。 */
export function resetPhaseForReopen(
  runtime: ExpertWorkflowRuntimeContext,
  input: Run,
  phaseName: PhaseName,
  detail: string,
): Run {
  const targetId = phaseNodeId(phaseName);
  const isPhaseNode = (node: Run["graph"]["nodes"][number]): boolean =>
    node.id === targetId && node.kind === "phase";
  const nodes = input.graph.nodes.map((node) =>
    isPhaseNode(node) ? { ...node, error: detail, status: "pending" as const } : node,
  );
  const phases = input.phases.map((entry) =>
    entry.phase === phaseName
      ? { error: detail, phase: phaseName, status: "pending" as const }
      : entry,
  );
  return {
    ...input,
    currentPhase: phaseName,
    graph: { collections: input.graph.collections, edges: input.graph.edges, nodes },
    phases,
    updatedAt: runtime.timestamp(),
  };
}
