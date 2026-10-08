import type { StudioWorkspaceChange } from "../types.js";
import { activeRunStates, validStudioId } from "../domain/validation.js";
import { requiredRun } from "./commandAdmission.js";
import type { StudioWorkspacePort } from "./ports.js";
import type { StoredWorkspace, StudioRepository } from "./storePort.js";

/**
 * 工作台每格预览的外部内核产物来源（specs/knorvia-workbench-artifact-preview-20261008.md）。
 * 与审阅/应用不同，这里只读：不要求同项目其他任务结束（四格并行时各自结束即可预览），
 * 也不清理应用锁或执行恢复。
 */
export async function listStudioWorkspaceArtifacts(
  deps: { db: StudioRepository; workspaces: StudioWorkspacePort },
  params: { runId: string; stepId: string },
): Promise<StudioWorkspaceChange[]> {
  validStudioId(params.runId);
  validStudioId(params.stepId);
  const run = requiredRun(deps.db, params.runId);
  if (activeRunStates.has(run.state)) throw new Error("任务仍在运行，结束后才能预览产物");
  const saved = deps.db.read<StoredWorkspace>("workspace", `${params.runId}:${params.stepId}`);
  if (!saved) throw new Error("此步骤没有隔离修改");
  if (saved.remoteKernelId) throw new Error("远端 Agent 的产物暂不支持在格子内预览");
  return (await deps.workspaces.artifacts?.(saved.runId, saved.stepId)) ?? [];
}
