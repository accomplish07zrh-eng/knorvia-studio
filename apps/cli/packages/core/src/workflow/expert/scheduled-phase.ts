// SPDX-License-Identifier: Apache-2.0
// 调度相位：把相位标记为 active、装配调度器依赖、执行调度循环，再交给收尾模块完成相位。
import type { ExpertWorkflowRunSnapshot, WorkflowPhaseDefinition } from "@knorvia/contracts";
import {
  WorkflowGraphScheduler,
  type WorkflowGraphSchedulerDeps,
  type WorkflowGraphSchedulerRunOptions,
} from "../scheduler.js";
import { executableNodeIdsForPhase, safeArtifactName } from "./ids.js";
import { buildScheduledNodePrompt } from "./prompts.js";
import { completeScheduledPhase } from "./scheduled-phase-completion.js";
import { nodeRunnerOf, plannerRunnerOf } from "./scheduled-phase-runners.js";
import type { ExpertWorkflowRuntimeContext } from "./runtime-context.js";
import type { ExpertWorkflowRunOptions } from "./types.js";

/** 端口转发器：把门面的 store 端口适配成调度器需要的回调。 */
const appendEventVia =
  (runtime: ExpertWorkflowRuntimeContext) =>
  (
    event: Parameters<ExpertWorkflowRuntimeContext["store"]["appendEvent"]>[0],
    eventOptions?: Parameters<ExpertWorkflowRuntimeContext["store"]["appendEvent"]>[1],
  ) =>
    runtime.store.appendEvent(event, eventOptions);

const appendGraphRecordVia =
  (runtime: ExpertWorkflowRuntimeContext) =>
  (...args: Parameters<ExpertWorkflowRuntimeContext["store"]["appendGraphRecord"]>) =>
    runtime.store.appendGraphRecord(...args);

const writeArtifactVia =
  (runtime: ExpertWorkflowRuntimeContext) =>
  (...args: Parameters<ExpertWorkflowRuntimeContext["store"]["writeArtifact"]>) =>
    runtime.store.writeArtifact(...args);

const writeSnapshotVia =
  (runtime: ExpertWorkflowRuntimeContext) =>
  (...args: Parameters<ExpertWorkflowRuntimeContext["store"]["writeSnapshot"]>) =>
    runtime.store.writeSnapshot(...args);

/** 调度器依赖：端口全部来自门面，规划/节点运行器来自适配模块。 */
const depsOf = (
  runtime: ExpertWorkflowRuntimeContext,
  phaseDefinition: WorkflowPhaseDefinition,
): WorkflowGraphSchedulerDeps => ({
  appendEvent: appendEventVia(runtime),
  appendGraphRecord: appendGraphRecordVia(runtime),
  createActivityId: runtime.createActivityId,
  now: runtime.now,
  onWorkflowEvent: runtime.onWorkflowEvent,
  plannerRunner: plannerRunnerOf(runtime, phaseDefinition),
  runner: nodeRunnerOf(runtime),
  writeArtifact: writeArtifactVia(runtime),
  writeSnapshot: writeSnapshotVia(runtime),
});
/** 执行一个调度相位：active → 调度循环 → 完成；调度器暂停时抛错交给上层归类。 */
export async function runScheduledPhase(
  runtime: ExpertWorkflowRuntimeContext,
  input: ExpertWorkflowRunSnapshot,
  phaseDefinition: WorkflowPhaseDefinition,
  runOptions: ExpertWorkflowRunOptions,
): Promise<ExpertWorkflowRunSnapshot> {
  const activated = runtime.updatePhase(input, phaseDefinition.phase, {
    error: undefined,
    startedAt: runtime.timestamp(),
    status: "active",
  });
  await runtime.store.writeSnapshot(activated, { signal: runOptions.abortSignal });
  await runtime.appendEvent(activated.runId, "phase_started", {
    message: `${phaseDefinition.title} started.`,
    phase: phaseDefinition.phase,
    signal: runOptions.abortSignal,
  });

  const request: WorkflowGraphSchedulerRunOptions = {
    abortSignal: runOptions.abortSignal,
    artifactDirectory: `artifacts/${safeArtifactName(phaseDefinition.phase)}`,
    buildPrompt: ({ node, snapshot: promptSnapshot }) =>
      buildScheduledNodePrompt(promptSnapshot, phaseDefinition, node),
    cwd: runOptions.cwd,
    executableNodeIds: executableNodeIdsForPhase(activated.graph, phaseDefinition.phase),
    onEvent: runOptions.onEvent,
    parentSessionId: activated.sessionId,
    phase: phaseDefinition.phase,
    snapshot: activated,
    traceContext: runOptions.traceContext,
  };
  const outcome = await new WorkflowGraphScheduler(depsOf(runtime, phaseDefinition)).run(request);
  if (outcome.status !== "completed") {
    throw new Error(`Workflow ${phaseDefinition.phase} scheduler paused: ${outcome.reason}`);
  }
  return await completeScheduledPhase(runtime, outcome.snapshot, phaseDefinition, runOptions);
}
