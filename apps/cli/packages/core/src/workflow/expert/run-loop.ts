// SPDX-License-Identifier: Apache-2.0
// 运行主循环：启动运行 → 按定义顺序推进相位 → 收尾；失败交给失败模块回结果。
import { formatExpertWorkflowCompletion } from "./formatters.js";
import { advancePhase } from "./run-loop-phases.js";
import { completeRun } from "./run-loop-completion.js";
import { commandResult, failRun } from "./run-loop-failure.js";
import type { ExpertWorkflowRuntimeContext } from "./runtime-context.js";
import type { ExpertWorkflowCommandResult, ExpertWorkflowRunOptions } from "./types.js";
import type { ExpertWorkflowRunSnapshot } from "@knorvia/contracts";

type Run = ExpertWorkflowRunSnapshot;
type Command = ExpertWorkflowCommandResult;

/** 启动运行：补 startedAt 并把状态置为 running。 */
const startRun = (runtime: ExpertWorkflowRuntimeContext, base: Run): Run =>
  runtime.updateSnapshot(base, {
    startedAt: base.startedAt ?? runtime.timestamp(),
    status: "running",
  });

/** 相位是否已完成：用于跳过重跑（中断后恢复时常见）。 */
const alreadyFinished = (cursor: Run, phaseName: string): boolean => {
  const entry = cursor.phases.find((candidate) => candidate.phase === phaseName);
  return entry?.status === "completed";
};

/** 推进全部相位：完成相位收尾后结束循环。 */
const advanceAll = async (
  runtime: ExpertWorkflowRuntimeContext,
  cursor: Run,
  settings: ExpertWorkflowRunOptions,
): Promise<Run> => {
  let state = cursor;
  for (const phaseKey of runtime.definition.phaseOrder) {
    const phase = runtime.getPhaseDefinition(phaseKey);
    if (phase.behavior === "complete") {
      return await completeRun(runtime, state, phase, settings.abortSignal);
    }
    if (alreadyFinished(state, phase.phase)) continue;
    state = await advancePhase(runtime, state, phase, settings);
  }
  return state;
};

export async function continueRun(
  runtime: ExpertWorkflowRuntimeContext,
  base: Run,
  settings: ExpertWorkflowRunOptions,
): Promise<Command> {
  const started = startRun(runtime, base);
  try {
    const finished = await advanceAll(runtime, started, settings);
    return commandResult(finished, formatExpertWorkflowCompletion(finished));
  } catch (error) {
    return await failRun(runtime, started, error, settings);
  }
}
