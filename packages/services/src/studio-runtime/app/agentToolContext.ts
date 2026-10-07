import type { StudioAgentPolicy, StudioAgentTask } from "../agentToolTypes.js";
import type { StudioKernelSink, StudioKernelTurn } from "../kernelTypes.js";
import type { StudioKernelRegistry, StudioWorkspacePort } from "./ports.js";
import type { StoredRun, StudioClock, StudioRepository } from "./storePort.js";
import { assertStudioRunOwned } from "./turnExecutor.js";
import { agentCallerKey, type StudioAgentRunLink } from "./agentOutbox.js";

export interface StudioAgentToolDependencies {
  db: StudioRepository;
  clock: StudioClock;
  kernels: StudioKernelRegistry;
  workspaces: StudioWorkspacePort;
  owner: string;
  policy: StudioAgentPolicy;
}
export interface StudioAgentCaller {
  turn: StudioKernelTurn;
  sink: StudioKernelSink;
  signal: AbortSignal;
}
export function assertStudioAgentCaller(
  deps: StudioAgentToolDependencies,
  caller: StudioAgentCaller,
): StoredRun {
  caller.signal.throwIfAborted();
  const run = assertStudioRunOwned(deps, caller.turn.runId);
  const turn = deps.db.read<{
    runId: string;
    attempt: number;
    state: string;
    kernel: string;
    permission: string;
    workspacePath: string;
    conversationId: string;
  }>("turn", caller.turn.turnId);
  if (
    !turn ||
    turn.runId !== run.id ||
    turn.attempt !== run.attempt ||
    turn.state !== "running" ||
    turn.kernel !== caller.turn.kernel ||
    turn.permission !== caller.turn.permission ||
    turn.workspacePath !== caller.turn.workspacePath ||
    turn.conversationId !== caller.turn.conversationId
  )
    throw new Error("Studio Agent 调用方执行权已失效");
  return run;
}
export function ownedStudioAgentTask(
  deps: StudioAgentToolDependencies,
  caller: StudioAgentCaller,
  taskId: string,
): StudioAgentTask {
  assertStudioAgentCaller(deps, caller);
  const task = deps.db.read<StudioAgentTask>("agent-task", taskId);
  if (!task || task.parentCallerId !== caller.turn.conversationId)
    throw new Error("此任务不属于当前调用方所属范围");
  return task;
}
export function studioAgentChain(
  deps: StudioAgentToolDependencies,
  run: StoredRun,
): { rootRunId: string; depth: number } {
  const link = deps.db.read<StudioAgentRunLink>("agent-run-link", run.id);
  const task = link ? deps.db.read<StudioAgentTask>("agent-task", link.taskId) : undefined;
  return task ? { rootRunId: task.rootRunId, depth: task.depth } : { rootRunId: run.id, depth: 0 };
}
export function studioAgentScope(
  deps: StudioAgentToolDependencies,
  caller: StudioAgentCaller,
): string {
  assertStudioAgentCaller(deps, caller);
  return agentCallerKey(caller.turn.conversationId);
}
