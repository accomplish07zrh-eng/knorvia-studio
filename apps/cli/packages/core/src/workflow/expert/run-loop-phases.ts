// SPDX-License-Identifier: Apache-2.0
// 相位推进：按相位行为分派（表驱动 + agent 相位后处理），返回推进后的快照。
import type { ExpertWorkflowRunSnapshot, WorkflowPhaseDefinition } from "@knorvia/contracts";
import {
  seedGraphFromPhaseArtifact,
  updateNodePromptsFromPhaseArtifact,
} from "./graph-artifacts.js";
import { runPhase } from "./phase-runner.js";
import { runFinalCriticLoop } from "./critic-loop.js";
import type { ExpertWorkflowRuntimeContext } from "./runtime-context.js";
import { runScheduledPhase } from "./scheduled-phase.js";
import type { ExpertWorkflowRunOptions } from "./types.js";

type Run = ExpertWorkflowRunSnapshot;
type PhaseDef = WorkflowPhaseDefinition;
type PhaseHandler = (
  runtime: ExpertWorkflowRuntimeContext,
  state: Run,
  phase: PhaseDef,
  options: ExpertWorkflowRunOptions,
) => Promise<Run>;

/** 非 agent 相位的处理器表：键即相位行为。 */
const PHASE_HANDLERS: ReadonlyMap<PhaseDef["behavior"], PhaseHandler> = new Map([
  ["critic", runFinalCriticLoop],
  ["scheduled_graph", runScheduledPhase],
]);

/** agent 相位：跑一次 → 用响应播种图 → 更新节点提示词。 */
const runAgentPhase = async (
  runtime: ExpertWorkflowRuntimeContext,
  state: Run,
  phase: PhaseDef,
  options: ExpertWorkflowRunOptions,
): Promise<Run> => {
  const finished = await runPhase(runtime, state, phase, options);
  const seeded = await seedGraphFromPhaseArtifact(
    runtime,
    finished.snapshot,
    phase,
    finished.response,
    options.abortSignal,
  );
  return await updateNodePromptsFromPhaseArtifact(
    runtime,
    seeded,
    phase,
    finished.response,
    options.abortSignal,
  );
};

/** 推进一个相位：agent 走专用路径，其余查表；未知行为原样返回。 */
export const advancePhase = async (
  runtime: ExpertWorkflowRuntimeContext,
  state: Run,
  phase: PhaseDef,
  options: ExpertWorkflowRunOptions,
): Promise<Run> => {
  if (phase.behavior === "agent") {
    return await runAgentPhase(runtime, state, phase, options);
  }
  const handler = PHASE_HANDLERS.get(phase.behavior);
  return handler === undefined ? state : await handler(runtime, state, phase, options);
};
