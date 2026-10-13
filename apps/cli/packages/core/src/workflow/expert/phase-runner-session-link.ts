// SPDX-License-Identifier: Apache-2.0
// 子会话联动：子会话启动时把 session/trace/turn 写回活动与相位，并发事件。
import { phaseNodeId } from "./ids.js";
import type { ExpertWorkflowRuntimeContext } from "./runtime-context.js";
import type { ExpertWorkflowRunOptions, WorkflowAgentRunInput } from "./types.js";
import type { ExpertWorkflowRunSnapshot, WorkflowPhaseDefinition } from "@knorvia/contracts";

type Run = ExpertWorkflowRunSnapshot;
type PhaseDef = WorkflowPhaseDefinition;
type ChildSessionEvent = Parameters<NonNullable<WorkflowAgentRunInput["onChildSessionStarted"]>>[0];

/** 可变游标：联动过程中持续替换快照。 */
export interface SnapshotCursor {
  current: Run;
}

/** 事件负载：活动、模型、会话与可选的 trace/turn 标识。 */
const linkedPayload = (activityId: string, event: ChildSessionEvent): Record<string, unknown> => {
  const payload: Record<string, unknown> = { activityId, sessionId: event.sessionId };
  if (event.model !== undefined) payload.model = event.model;
  if (event.traceId !== undefined) payload.traceId = event.traceId;
  if (event.turnId !== undefined) payload.turnId = event.turnId;
  return payload;
};

/** 子会话联动处理器：活动不再是 active 时直接忽略（迟到的联动）。 */
export const childSessionLinker =
  (
    runtime: ExpertWorkflowRuntimeContext,
    cursor: SnapshotCursor,
    phase: PhaseDef,
    activityId: string,
    options: ExpertWorkflowRunOptions,
  ) =>
  async (event: ChildSessionEvent): Promise<void> => {
    const current = cursor.current.activities.find((entry) => entry.activityId === activityId);
    if (current === undefined || current.status !== "active") {
      return;
    }

    const traceId = event.traceId ?? current.traceId;
    const turnId = event.turnId ?? current.turnId;
    const linkedPhase = runtime.updatePhase(cursor.current, phase.phase, {
      sessionId: event.sessionId,
      traceId,
      turnId,
    });
    const nextActivity = { ...current, sessionId: event.sessionId, traceId, turnId };
    cursor.current = runtime.upsertActivity(
      linkedPhase,
      event.model === undefined ? nextActivity : { ...nextActivity, model: event.model },
    );

    await runtime.store.writeSnapshot(cursor.current, { signal: options.abortSignal });
    await runtime.appendEvent(cursor.current.runId, "workflow_session_linked", {
      message: `Workflow session linked: ${event.sessionId}`,
      nodeId: phaseNodeId(phase.phase),
      payload: linkedPayload(activityId, event),
      phase: phase.phase,
      signal: options.abortSignal,
    });
  };
