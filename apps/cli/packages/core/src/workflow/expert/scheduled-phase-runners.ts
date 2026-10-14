// SPDX-License-Identifier: Apache-2.0
// 调度相位的运行器适配：把门面的 agentRunner 包装成调度器需要的 planner / node 运行器。
import type { WorkflowPhaseDefinition } from "@knorvia/contracts";
import type {
  WorkflowGraphSchedulerActivityInput,
  WorkflowGraphSchedulerPlannerInput,
} from "../scheduler.js";
import { parseWorkflowPlannerResult } from "./parsers/planner-result.js";
import type { ExpertWorkflowRuntimeContext } from "./runtime-context.js";
import type { WorkflowAgentRunInput } from "./types.js";

type RunnerRequest = WorkflowGraphSchedulerActivityInput | WorkflowGraphSchedulerPlannerInput;

/** 调度器入参 → agentRunner 入参：字段一一对应，仅补 workflowKind。 */
const agentInputOf = (
  runtime: ExpertWorkflowRuntimeContext,
  request: RunnerRequest,
): WorkflowAgentRunInput => ({
  abortSignal: request.abortSignal,
  activityId: request.activityId,
  cwd: request.cwd,
  onChildSessionStarted: request.onChildSessionStarted,
  onEvent: request.onEvent,
  parentSessionId: request.parentSessionId,
  phase: request.phase,
  prompt: request.prompt,
  runId: request.runId,
  task: request.task,
  traceContext: request.traceContext,
  workflowKind: runtime.definition.kind,
});

/** 规划器运行器：跑一次 agent，再把响应解析成规划结果并补上会话标识。 */
export const plannerRunnerOf = (
  runtime: ExpertWorkflowRuntimeContext,
  phase: WorkflowPhaseDefinition,
) => ({
  async run(request: WorkflowGraphSchedulerPlannerInput) {
    const result = await runtime.agentRunner.run(agentInputOf(runtime, request));
    const plannerResult = parseWorkflowPlannerResult(result.response, phase.phase);
    return {
      ...plannerResult,
      model: result.model,
      response: result.response,
      sessionId: result.sessionId,
      traceId: result.traceId,
      turnId: result.turnId,
    };
  },
});

/** 节点运行器：直接透传 agent 结果。 */
export const nodeRunnerOf = (runtime: ExpertWorkflowRuntimeContext) => ({
  run: async (request: WorkflowGraphSchedulerActivityInput) =>
    runtime.agentRunner.run(agentInputOf(runtime, request)),
});
