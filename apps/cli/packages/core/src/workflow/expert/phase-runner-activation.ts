// SPDX-License-Identifier: Apache-2.0
// 相位启动：建活动 id、派生 trace、把相位与活动标记为 active 并落盘 + 发事件。
import { createChildTraceContext, type WorkflowPhaseDefinition } from "@knorvia/contracts";
import { phaseNodeId } from "./ids.js";
import type { ExpertWorkflowRuntimeContext } from "./runtime-context.js";
import type { ExpertWorkflowRunOptions } from "./types.js";
import type { ExpertWorkflowRunSnapshot } from "@knorvia/contracts";

type Run = ExpertWorkflowRunSnapshot;
type PhaseDef = WorkflowPhaseDefinition;

/** 启动结果：后续步骤共用的活动标识、输入工件与启动后的快照。 */
export interface PhaseActivation {
  activation: Run;
  activeSnapshot: Run;
  activityId: string;
  inputArtifactPaths: string[];
  traceContext: ReturnType<typeof createChildTraceContext> | undefined;
}

/** 启动态活动字段表：键即活动字段，值在调用时求值。 */
const activeActivityFields = (
  activityId: string,
  inputs: readonly string[],
  phase: PhaseDef,
  parentSessionId: string | undefined,
  traceId: string | undefined,
  startedAt: string,
): readonly (readonly [string, unknown])[] => [
  ["activityId", activityId],
  ["inputArtifactPaths", [...inputs]],
  ["kind", "agent_session"],
  ["nodeId", phaseNodeId(phase.phase)],
  ["outputArtifactPaths", []],
  ["parentSessionId", parentSessionId],
  ["phase", phase.phase],
  ["startedAt", startedAt],
  ["status", "active"],
  ["traceId", traceId],
];

/** 启动相位：active 相位 + active 活动 + 落盘 + 事件。 */
export async function startPhaseActivity(
  runtime: ExpertWorkflowRuntimeContext,
  base: Run,
  phase: PhaseDef,
  options: ExpertWorkflowRunOptions,
): Promise<PhaseActivation> {
  const activityId = runtime.createActivityId();
  const inputArtifactPaths = base.artifacts.map((artifact) => artifact.path);

  let traceContext: ReturnType<typeof createChildTraceContext> | undefined;
  if (options.traceContext !== undefined) {
    traceContext = createChildTraceContext(options.traceContext, {
      attributes: {
        workflowActivityId: activityId,
        workflowKind: runtime.definition.kind,
        workflowPhase: phase.phase,
        workflowRunId: base.runId,
      },
      sessionId: options.traceContext.sessionId,
    });
  }

  const activation = runtime.updatePhase(base, phase.phase, {
    activityId,
    error: undefined,
    startedAt: runtime.timestamp(),
    status: "active",
    traceId: traceContext?.traceId,
  });
  const activity = Object.fromEntries(
    activeActivityFields(
      activityId,
      inputArtifactPaths,
      phase,
      activation.sessionId,
      traceContext?.traceId,
      runtime.timestamp(),
    ),
  );
  const activeSnapshot = runtime.upsertActivity(
    activation,
    activity as unknown as Parameters<ExpertWorkflowRuntimeContext["upsertActivity"]>[1],
  );

  await runtime.store.writeSnapshot(activeSnapshot, { signal: options.abortSignal });
  await runtime.appendGraphStatus(activation, phase.phase, "active", options.abortSignal);
  await runtime.appendEvent(activation.runId, "phase_started", {
    message: `${phase.title} started.`,
    phase: phase.phase,
    signal: options.abortSignal,
  });
  return { activation, activeSnapshot, activityId, inputArtifactPaths, traceContext };
}
