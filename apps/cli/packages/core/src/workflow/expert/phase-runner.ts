// SPDX-License-Identifier: Apache-2.0
// 相位运行：启动 → 跑 agent（带子会话联动）→ 成功结算 / 失败结算。
import type { ExpertWorkflowRunSnapshot, WorkflowPhaseDefinition } from "@knorvia/contracts";
import { startPhaseActivity } from "./phase-runner-activation.js";
import { childSessionLinker, type SnapshotCursor } from "./phase-runner-session-link.js";
import { completePhaseRun, failPhaseRun } from "./phase-runner-settle.js";
import { buildPhasePrompt } from "./prompts.js";
import type { ExpertWorkflowRuntimeContext } from "./runtime-context.js";
import type { ExpertPhaseRunResult, ExpertWorkflowRunOptions } from "./types.js";

type Run = ExpertWorkflowRunSnapshot;
type PhaseDef = WorkflowPhaseDefinition;

export async function runPhase(
  runtime: ExpertWorkflowRuntimeContext,
  input: Run,
  phaseDefinition: PhaseDef,
  runOptions: ExpertWorkflowRunOptions,
): Promise<ExpertPhaseRunResult> {
  const started = await startPhaseActivity(runtime, input, phaseDefinition, runOptions);
  const cursor: SnapshotCursor = { current: started.activeSnapshot };

  try {
    const result = await runtime.agentRunner.run({
      abortSignal: runOptions.abortSignal,
      activityId: started.activityId,
      cwd: runOptions.cwd,
      onChildSessionStarted: childSessionLinker(
        runtime,
        cursor,
        phaseDefinition,
        started.activityId,
        runOptions,
      ),
      onEvent: runOptions.onEvent,
      parentSessionId: started.activation.sessionId,
      phase: phaseDefinition.phase,
      prompt: buildPhasePrompt(cursor.current, phaseDefinition),
      runId: started.activation.runId,
      task: started.activation.task,
      traceContext: started.traceContext,
      workflowKind: runtime.definition.kind,
    });
    const snapshot = await completePhaseRun(
      runtime,
      cursor.current,
      phaseDefinition,
      started.activityId,
      started.inputArtifactPaths,
      started.activation,
      runOptions,
      started.traceContext,
      result,
    );
    return { response: result.response, snapshot };
  } catch (error) {
    if (runOptions.abortSignal?.aborted) {
      throw error;
    }
    await failPhaseRun(
      runtime,
      cursor.current,
      phaseDefinition,
      started.activityId,
      started.inputArtifactPaths,
      started.activation,
      runOptions,
      started.traceContext,
      error,
    );
    throw error;
  }
}
