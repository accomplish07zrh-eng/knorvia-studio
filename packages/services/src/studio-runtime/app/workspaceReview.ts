import type { StudioKernelRegistry, StudioWorkspacePort } from "./ports.js";
import type { StoredWorkspace, StudioClock, StudioRepository } from "./storePort.js";
import { activeRunStates, validStudioId } from "../domain/validation.js";
import { studioProjectKey } from "../domain/projectIdentity.js";
import { requiredRun } from "./commandAdmission.js";

interface WorkspaceReviewDependencies {
  db: StudioRepository;
  clock: StudioClock;
  kernels: StudioKernelRegistry;
  workspaces: StudioWorkspacePort;
  process?: { id: number; alive(id: number): boolean };
}

/** Keep local and SSH project changes on their owning Host until explicitly applied. */
export function reviewableWorkspace(
  deps: WorkspaceReviewDependencies,
  runId: string,
  stepId: string,
): StoredWorkspace {
  validStudioId(runId);
  const run = requiredRun(deps.db, runId);
  if (
    activeRunStates.has(run.state) ||
    deps.db.list<{ targetId: string }>("active").some((item) => item.targetId === run.targetId)
  )
    throw new Error("请等待任务结束，再查看或应用修改");
  const saved = deps.db.read<StoredWorkspace>("workspace", `${runId}:${stepId}`);
  if (!saved) throw new Error("此步骤没有隔离修改");
  for (const item of deps.db.list<{ id: string }>("active")) {
    const other = requiredRun(deps.db, item.id);
    const project =
      other.definition?.workspacePath ??
      deps.db.read<{ workspacePath: string }>("conversation", other.targetId)?.workspacePath;
    if (project && studioProjectKey(project) === studioProjectKey(saved.sourcePath))
      throw new Error("同一项目仍有任务运行，请结束后再查看或应用修改");
  }
  return saved;
}

export async function inspectStudioWorkspaceChanges(
  deps: WorkspaceReviewDependencies,
  runId: string,
  stepId: string,
) {
  const saved = reviewableWorkspace(deps, runId, stepId);
  const { db } = deps;
  const targetId = studioProjectKey(saved.sourcePath);
  const lock = db.read<{ token: string; pid?: number; recoveryRequired?: boolean }>(
    "apply-lock",
    targetId,
  );
  if (
    lock &&
    !lock.recoveryRequired &&
    (!lock.pid || !deps.process || deps.process.alive(lock.pid))
  )
    throw new Error("项目修改仍在应用，请稍后查看");
  const remote = saved.remoteKernelId
    ? deps.kernels.remoteWorkspace?.(saved.remoteKernelId)
    : undefined;
  if (saved.remoteKernelId && !remote)
    throw new Error("远端 Agent 连接不可用，请重新连接后查看修改");
  // The owning Host verifies its journal before the abandoned local lock is removed.
  const changes = remote
    ? await remote.agentWorkspaceChanges({ runId: saved.runId, stepId: saved.stepId })
    : await deps.workspaces.changes(saved.runId, saved.stepId);
  if (lock)
    db.transaction(() => {
      if (db.read<{ token: string }>("apply-lock", targetId)?.token === lock.token)
        db.remove("apply-lock", targetId);
    });
  return changes;
}

export async function applyStudioWorkspaceChanges(
  deps: WorkspaceReviewDependencies,
  params: { runId: string; stepId: string; paths: string[] },
): Promise<void> {
  const saved = reviewableWorkspace(deps, params.runId, params.stepId);
  if (!Array.isArray(params.paths) || !params.paths.length || params.paths.length > 1000)
    throw new Error("请选择需要应用的文件");
  const { db, clock } = deps;
  const targetId = studioProjectKey(saved.sourcePath);
  const token = clock.id();
  db.transaction(() => {
    reviewableWorkspace(deps, params.runId, params.stepId);
    if (db.read("apply-lock", targetId))
      throw new Error("已有修改正在应用，或上次应用需要恢复检查");
    db.write("apply-lock", targetId, { token, pid: deps.process?.id, startedAt: clock.now() });
  });
  let recoveryRequired = false;
  try {
    const remote = saved.remoteKernelId
      ? deps.kernels.remoteWorkspace?.(saved.remoteKernelId)
      : undefined;
    if (saved.remoteKernelId && !remote)
      throw new Error("远端 Agent 连接不可用，请重新连接后应用修改");
    if (remote)
      await remote.applyAgentWorkspaceChanges({
        runId: saved.runId,
        stepId: saved.stepId,
        paths: params.paths,
      });
    else await deps.workspaces.apply(saved.runId, saved.stepId, params.paths);
  } catch (error) {
    // A failed remote apply is not proof of rollback; retain a recovery lock if verification fails.
    try {
      const remote = saved.remoteKernelId
        ? deps.kernels.remoteWorkspace?.(saved.remoteKernelId)
        : undefined;
      if (saved.remoteKernelId && !remote) throw new Error("远端离线");
      if (remote) await remote.agentWorkspaceChanges({ runId: saved.runId, stepId: saved.stepId });
      else await deps.workspaces.changes(saved.runId, saved.stepId);
    } catch {
      recoveryRequired = true;
    }
    throw error;
  } finally {
    db.transaction(() => {
      const lock = db.read<{ token: string }>("apply-lock", targetId);
      if (lock?.token !== token) return;
      if (recoveryRequired) db.write("apply-lock", targetId, { ...lock, recoveryRequired: true });
      else db.remove("apply-lock", targetId);
    });
  }
}
