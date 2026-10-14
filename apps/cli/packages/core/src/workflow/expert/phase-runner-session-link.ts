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

/** 事件负载：活动 → 模型 → 会话 → trace/turn（键序即落库键序，缺省字段不出现）。 */
const linkedPayload = (activityId: string, event: ChildSessionEvent): Record<string, unknown> => {
  const payload: Record<string, unknown> = { activityId };
  if (event.model) payload.model = event.model;
  payload.sessionId = event.sessionId;
  if (event.traceId) payload.traceId = event.traceId;
  if (event.turnId) payload.turnId = event.turnId;
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
    // 键序即落库键序：模型插在既有字段之后、会话字段之前，与录制的运行记录保持一致。
    const linkedActivity: typeof current = { ...current };
    if (event.model) linkedActivity.model = event.model;
    linkedActivity.sessionId = event.sessionId;
    linkedActivity.traceId = traceId;
    linkedActivity.turnId = turnId;
    cursor.current = runtime.upsertActivity(linkedPhase, linkedActivity);

    await runtime.store.writeSnapshot(cursor.current, { signal: options.abortSignal });
    await runtime.appendEvent(cursor.current.runId, "workflow_session_linked", {
      message: `Workflow session linked: ${event.sessionId}`,
      nodeId: phaseNodeId(phase.phase),
      payload: linkedPayload(activityId, event),
      phase: phase.phase,
      signal: options.abortSignal,
    });
  };
