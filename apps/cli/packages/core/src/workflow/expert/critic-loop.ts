// SPDX-License-Identifier: Apache-2.0
// 终审循环：跑一次终审相位 → 判定 → 受理重开 → 重置并重跑，直到通过或达到轮次上限。
import type { ExpertWorkflowRunSnapshot, WorkflowPhaseDefinition } from "@knorvia/contracts";
import { dedupeReopenProposals, parseCriticResult } from "./parsers/critic.js";
import { runPhase } from "./phase-runner.js";
import { admitReopen, appendReopenRecord, resetPhaseForReopen } from "./critic-reopen.js";
import type { ExpertWorkflowRuntimeContext } from "./runtime-context.js";
import { runScheduledPhase } from "./scheduled-phase.js";
import type { ExpertWorkflowRunOptions } from "./types.js";

type PhaseName = WorkflowPhaseDefinition["phase"];
type Run = ExpertWorkflowRunSnapshot;

/** 轮次上限文案：事件与相位错误共用同一句。 */
const LIMIT_MESSAGE = "Final critic iteration limit reached.";

/** 失败补丁：状态固定为 failed，其余字段在调用处补齐。 */
const FAILED_PATCH = { status: "failed" as const };

/** 事件发出的公共形状：消息 + 负载 + 相位 + 取消信号。 */
type EventPayload = { message: string; payload?: Record<string, unknown>; signal?: AbortSignal };

/** 终审事件：统一补上相位名。 */
const emitCritic = (
  runtime: ExpertWorkflowRuntimeContext,
  runId: string,
  type: Parameters<ExpertWorkflowRuntimeContext["appendEvent"]>[1],
  phaseName: PhaseName,
  event: EventPayload,
): Promise<void> => runtime.appendEvent(runId, type, { ...event, phase: phaseName });

/** 找到执行相位（scheduled_graph）：终审重开要把它一起重置。 */
const executionPhaseOf = (runtime: ExpertWorkflowRuntimeContext): WorkflowPhaseDefinition => {
  const found = runtime.definition.phases.find((entry) => entry.behavior === "scheduled_graph");
  if (found === undefined) {
    throw new Error(`${runtime.definition.title} definition is missing a scheduled graph phase`);
  }
  return found;
};

/** 受理一批重开提案：返回新快照与被受理的节点 id。 */
const admitProposals = async (
  runtime: ExpertWorkflowRuntimeContext,
  input: Run,
  proposals: readonly Parameters<typeof appendReopenRecord>[2][],
  round: number,
  phaseName: PhaseName,
  runOptions: ExpertWorkflowRunOptions,
): Promise<{ acceptedIds: string[]; snapshot: Run }> => {
  let current = input;
  const acceptedIds: string[] = [];
  for (const candidate of proposals) {
    const admitted = await admitReopen(
      runtime,
      current,
      candidate,
      round,
      phaseName,
      runOptions.abortSignal,
    );
    if (admitted === null) continue;
    current = admitted.snapshot;
    acceptedIds.push(candidate.nodeId);
    await runtime.store.writeSnapshot(current, { signal: runOptions.abortSignal });
    await appendReopenRecord(
      runtime,
      current,
      candidate,
      round,
      admitted.reopenAttempts,
      phaseName,
      runOptions.abortSignal,
    );
    const reopened = {
      iteration: round,
      reason: candidate.reason,
      reopenAttempts: admitted.reopenAttempts,
      severity: candidate.severity,
    };
    await emitCritic(runtime, current.runId, "node_reopened", phaseName, {
      message: `Node reopened by final critic: ${candidate.nodeId}`,
      payload: reopened,
      signal: runOptions.abortSignal,
    });
  }
  return { acceptedIds, snapshot: current };
};

/** 达到轮次上限：把终审相位标记失败并发出事件。 */
const failCriticLoop = async (
  runtime: ExpertWorkflowRuntimeContext,
  input: Run,
  phaseName: PhaseName,
  runOptions: ExpertWorkflowRunOptions,
): Promise<Run> => {
  const failed = runtime.updatePhase(input, phaseName, {
    ...FAILED_PATCH,
    completedAt: runtime.timestamp(),
    error: LIMIT_MESSAGE,
  });
  await runtime.store.writeSnapshot(failed, { signal: runOptions.abortSignal });
  await runtime.appendGraphStatus(failed, phaseName, "failed", runOptions.abortSignal);
  await emitCritic(runtime, failed.runId, "critic_iteration_limit_reached", phaseName, {
    message: LIMIT_MESSAGE,
    payload: { maxIterations: failed.strategy.finalCritic.maxIterations },
    signal: runOptions.abortSignal,
  });
  return failed;
};

export async function runFinalCriticLoop(
  runtime: ExpertWorkflowRuntimeContext,
  input: Run,
  phaseDefinition: WorkflowPhaseDefinition,
  runOptions: ExpertWorkflowRunOptions,
): Promise<Run> {
  const executionDefinition = executionPhaseOf(runtime);
  let current = input;
  let round = 1;

  while (round <= current.strategy.finalCritic.maxIterations) {
    await emitCritic(runtime, current.runId, "critic_started", phaseDefinition.phase, {
      message: `Final critic iteration ${round} started.`,
      payload: { iteration: round },
      signal: runOptions.abortSignal,
    });

    const result = await runPhase(runtime, current, phaseDefinition, runOptions);
    current = result.snapshot;
    const critic = parseCriticResult(result.response);

    if (critic.verdict === "pass") {
      await emitCritic(runtime, current.runId, "critic_passed", phaseDefinition.phase, {
        message: critic.reasoning || `Final critic iteration ${round} passed.`,
        payload: { acceptanceGaps: critic.acceptanceGaps, iteration: round },
        signal: runOptions.abortSignal,
      });
      return current;
    }

    const proposals = dedupeReopenProposals(critic.reopenProposals);
    await emitCritic(runtime, current.runId, "critic_failed", phaseDefinition.phase, {
      message: critic.reasoning || `Final critic iteration ${round} failed.`,
      payload: {
        acceptanceGaps: critic.acceptanceGaps,
        iteration: round,
        reopenProposals: proposals,
      },
      signal: runOptions.abortSignal,
    });
    if (proposals.length === 0) {
      return current;
    }

    const admitted = await admitProposals(
      runtime,
      current,
      proposals,
      round,
      phaseDefinition.phase,
      runOptions,
    );
    current = admitted.snapshot;
    if (admitted.acceptedIds.length === 0) {
      return current;
    }

    const reason = `Final critic reopened node(s): ${admitted.acceptedIds.join(", ")}`;
    current = resetPhaseForReopen(runtime, current, executionDefinition.phase, reason);
    current = resetPhaseForReopen(runtime, current, phaseDefinition.phase, reason);
    await runtime.store.writeSnapshot(current, { signal: runOptions.abortSignal });
    await runtime.appendGraphStatus(
      current,
      executionDefinition.phase,
      "pending",
      runOptions.abortSignal,
    );
    await runtime.appendGraphStatus(
      current,
      phaseDefinition.phase,
      "pending",
      runOptions.abortSignal,
    );
    current = await runScheduledPhase(runtime, current, executionDefinition, runOptions);
    round += 1;
  }

  return await failCriticLoop(runtime, current, phaseDefinition.phase, runOptions);
}
