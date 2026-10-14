// SPDX-License-Identifier: Apache-2.0
// 运行收尾：写报告工件、把相位与运行标记完成，并发出 run_completed 事件。
import type { ExpertWorkflowRunSnapshot, WorkflowPhaseDefinition } from "@knorvia/contracts";
import { buildReport } from "./prompts.js";
import type { ExpertWorkflowRuntimeContext } from "./runtime-context.js";

type Run = ExpertWorkflowRunSnapshot;
type PhaseDef = WorkflowPhaseDefinition;

/** 完成运行：报告落盘 → 相位完成 → 快照完成 + 工件登记 → 落盘 + 事件。 */
export async function completeRun(
  runtime: ExpertWorkflowRuntimeContext,
  state: Run,
  phase: PhaseDef,
  cancel?: AbortSignal,
): Promise<Run> {
  const report = buildReport(state);
  const artifact = await runtime.store.writeReport(state.runId, report, { signal: cancel });

  // 写入端返回的路径在投影时仍可变化；保留逐次读取与方法求值顺序。
  const projected = runtime.updatePhase(state, phase.phase, {
    artifactPath: artifact.relativePath,
    completedAt: runtime.timestamp(),
    startedAt: runtime.timestamp(),
    status: "completed",
  });
  const finished = runtime.updateSnapshot(projected, {
    completedAt: runtime.timestamp(),
    reportPath: artifact.relativePath,
    status: "completed",
  });
  const registered = runtime.addArtifact(finished, {
    contentType: "text/markdown",
    createdAt: runtime.timestamp(),
    label: "Report",
    path: artifact.relativePath,
    phase: phase.phase,
  });

  await runtime.store.writeSnapshot(registered, { signal: cancel });
  await runtime.appendGraphStatus(registered, phase.phase, "completed", cancel);
  await runtime.appendEvent(registered.runId, "run_completed", {
    message: `${runtime.definition.title} completed.`,
    signal: cancel,
  });
  return registered;
}
