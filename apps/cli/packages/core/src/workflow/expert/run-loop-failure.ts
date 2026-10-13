// SPDX-License-Identifier: Apache-2.0
// 运行失败处理：重读快照、取消路径（修复 + 事件）与暂停路径（失败归类 + 恢复动作 + 事件）。
import { cancelWorkflowSnapshot } from "../lifecycle.js";
import {
  latestWorkflowActivity,
  workflowFailureFromError,
  workflowRecoveryActions,
} from "./failures.js";
import { formatExpertWorkflowStatus } from "./formatters.js";
import { compactWorkflowPayload, lifecyclePayload } from "./runtime-context.js";
import type { ExpertWorkflowRuntimeContext } from "./runtime-context.js";
import type { ExpertWorkflowCommandResult, ExpertWorkflowRunOptions } from "./types.js";
import type { ExpertWorkflowRunSnapshot } from "@knorvia/contracts";

type Run = ExpertWorkflowRunSnapshot;

/** 命令结果：统一从快照派生，response 由调用方给出。 */
export const commandResult = (state: Run, response: string): ExpertWorkflowCommandResult => ({
  reportPath: state.reportPath,
  response,
  runId: state.runId,
  snapshot: state,
  status: state.status,
  traceId: state.traceId,
});

/** 失败后重读快照：已取消时不再带 signal，避免二次取消。 */
export const reloadRun = async (
  runtime: ExpertWorkflowRuntimeContext,
  state: Run,
  options: ExpertWorkflowRunOptions,
): Promise<Run> => {
  const readOptions = options.abortSignal?.aborted ? undefined : { signal: options.abortSignal };
  return (await runtime.store.readRun(state.runId, readOptions)) ?? state;
};

/** 取消路径：把快照修成 cancelled 并发出 run_cancelled（已取消则只回结果）。 */
export const cancelRun = async (
  runtime: ExpertWorkflowRuntimeContext,
  reloaded: Run,
  detail: string,
  options: ExpertWorkflowRunOptions,
): Promise<ExpertWorkflowCommandResult> => {
  let selected = reloaded;
  if (reloaded.status !== "cancelled") {
    const repair = cancelWorkflowSnapshot(reloaded, {
      reason: detail,
      timestamp: runtime.timestamp(),
    });
    await runtime.store.writeSnapshot(repair.snapshot, { signal: options.abortSignal });
    await runtime.appendLifecycleGraphChanges(
      repair.snapshot,
      repair.nodeChanges,
      options.abortSignal,
    );
    await runtime.appendEvent(repair.snapshot.runId, "run_cancelled", {
      message: detail,
      payload: lifecyclePayload(repair),
      signal: options.abortSignal,
    });
    selected = repair.snapshot;
  }
  return commandResult(selected, formatExpertWorkflowStatus(selected));
};

/** 暂停路径：归类失败、给出恢复动作、落盘并发出 workflow_paused。 */
export const pauseRun = async (
  runtime: ExpertWorkflowRuntimeContext,
  reloaded: Run,
  thrown: unknown,
  detail: string,
  options: ExpertWorkflowRunOptions,
): Promise<ExpertWorkflowCommandResult> => {
  const failure = workflowFailureFromError(thrown, detail, latestWorkflowActivity(reloaded));
  const halted = runtime.updateSnapshot(reloaded, {
    failure,
    pauseReason: failure.message,
    recoveryActions: workflowRecoveryActions(failure),
    status: "paused",
  });
  await runtime.store.writeSnapshot(halted, { signal: options.abortSignal });
  await runtime.appendEvent(halted.runId, "workflow_paused", {
    message: detail,
    payload: compactWorkflowPayload({
      failureKind: halted.failure?.kind,
      retryable: halted.failure?.retryable,
    }),
    phase: halted.currentPhase,
    signal: options.abortSignal,
  });
  return commandResult(halted, `${formatExpertWorkflowStatus(halted)}\n\nPaused: ${detail}`);
};

/** 失败入口：重读快照后按取消/暂停两条路径返回命令结果。 */
export const failRun = async (
  runtime: ExpertWorkflowRuntimeContext,
  state: Run,
  thrown: unknown,
  options: ExpertWorkflowRunOptions,
): Promise<ExpertWorkflowCommandResult> => {
  const restored = await reloadRun(runtime, state, options);
  const detail = thrown instanceof Error ? thrown.message : String(thrown);
  if (options.abortSignal?.aborted) {
    return await cancelRun(runtime, restored, detail, options);
  }
  return await pauseRun(runtime, restored, thrown, detail, options);
};
