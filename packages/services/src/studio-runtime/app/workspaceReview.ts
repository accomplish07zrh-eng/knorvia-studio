import type { StudioKernelRegistry, StudioWorkspacePort } from "./ports.js";
import type { StoredRun, StoredWorkspace, StudioClock, StudioRepository } from "./storePort.js";
import type {
  StudioAcceptanceConfirmation,
  StudioAcceptanceResult,
  StudioApplyAcceptance,
  StudioApplyReceipt,
} from "../types.js";
import { activeRunStates, validStudioId } from "../domain/validation.js";
import { studioProjectKey } from "../domain/projectIdentity.js";
import { decodeStepOutputs } from "../domain/outputRef.js";
import { requiredRun } from "./commandAdmission.js";
import { STUDIO_ACCEPTANCE_KIND } from "./runOutcomeProjection.js";

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

/**
 * 应用顺序（见 specs/knorvia-delivery-summary.md）：
 * 复核 → 加锁 → 应用（拿 Host 回执）→ 独立重读核验 → 同一事务写验收记录并释放锁。
 * 核验失败时不写"已验收"行，保留 `recoveryRequired` 锁；任务终态仍只属于 run/step-result/turn。
 */
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
    db.write("apply-lock", targetId, {
      token,
      pid: deps.process?.id,
      startedAt: clock.now(),
      phase: "applying",
    });
  });
  let recoveryRequired = false;
  let accepted = false;
  let applied = false;
  try {
    const remote = saved.remoteKernelId
      ? deps.kernels.remoteWorkspace?.(saved.remoteKernelId)
      : undefined;
    if (saved.remoteKernelId && !remote)
      throw new Error("远端 Agent 连接不可用，请重新连接后应用修改");
    const receipt = remote
      ? toStudioApplyReceipt(
          await remote.applyAgentWorkspaceChanges({
            runId: saved.runId,
            stepId: saved.stepId,
            paths: params.paths,
          }),
        )
      : toStudioApplyReceipt(await deps.workspaces.apply(saved.runId, saved.stepId, params.paths));
    applied = true;
    // 没有任何文件被发布（选中的路径已与项目一致）或旧实现没有回执：没有可验收的证据。
    if (!remote && (!receipt || !receipt.files.length)) return;
    const acceptance = await readAcceptance(deps, {
      saved,
      targetId,
      token,
      remote: Boolean(remote),
      receipt,
      paths: params.paths,
    });
    db.transaction(() => {
      if (db.read<{ token: string }>("apply-lock", targetId)?.token !== token)
        throw new Error("应用锁已失效，未写入验收记录");
      db.write(
        STUDIO_ACCEPTANCE_KIND,
        `${saved.runId}:${saved.stepId}:${acceptance.operationId}`,
        acceptance,
        saved.runId,
      );
      db.remove("apply-lock", targetId);
    });
    accepted = true;
    return;
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
    // 文件已经发布但核验没走完：锁必须留下，直到有人确认项目状态。
    if (applied && !accepted) recoveryRequired = true;
    throw error;
  } finally {
    if (!accepted)
      db.transaction(() => {
        const lock = db.read<{ token: string }>("apply-lock", targetId);
        if (lock?.token !== token) return;
        if (recoveryRequired) db.write("apply-lock", targetId, { ...lock, recoveryRequired: true });
        else db.remove("apply-lock", targetId);
      });
  }
}

interface AcceptanceInput {
  saved: StoredWorkspace;
  targetId: string;
  token: string;
  remote: boolean;
  receipt: StudioApplyReceipt | undefined;
  paths: string[];
}

async function readAcceptance(
  deps: WorkspaceReviewDependencies,
  input: AcceptanceInput,
): Promise<StudioApplyAcceptance> {
  const { saved, receipt } = input;
  const files = receipt?.files ?? [];
  let confirmation: StudioAcceptanceConfirmation = "host-journal";
  let result: StudioAcceptanceResult = "accepted";
  if (input.remote) {
    // 本地 Host 读不到远端项目文件：永不标记为已核验，只记录"远端返回了摘要"。
    confirmation = "remote-returned";
    result = "remote-unverified";
  } else if (deps.workspaces.versions) {
    try {
      // 独立重读只是取证：读到的当前哈希可以与 afterHash 不同（那属于"接受之后又被改动"）。
      await deps.workspaces.versions(
        saved.runId,
        saved.stepId,
        files.map((file) => file.path),
      );
      confirmation = "host-verified";
    } catch (error) {
      throw new Error(
        `新内容已写入项目，但验收核验失败：${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
  return {
    version: 1,
    runId: saved.runId,
    stepId: saved.stepId,
    projectKey: input.targetId,
    operationId: receipt?.operationId ?? input.token,
    acceptedAt: deps.clock.now(),
    paths: files.length ? files.map((file) => file.path) : input.paths,
    fileVersions: files,
    creation: studioStepCreation(deps.db, saved.runId, saved.stepId),
    confirmation,
    result,
    // 远端没有本地 journal，就不写 journal 状态；不把"没有"写成"complete"。
    ...(receipt?.journalState ? { journalState: receipt.journalState } : {}),
  };
}

/** 只认经 `decodeStepOutputs` 校验的创作引用；更高版本或非法载荷不写入验收记录。 */
function studioStepCreation(
  db: StudioRepository,
  runId: string,
  stepId: string,
): { jobId: string; outputIds: string[] } | null {
  const step = db.read<StoredRun>("run", runId)?.checkpoint?.steps?.[stepId];
  if (!step) return null;
  try {
    const decoded = decodeStepOutputs(step);
    if (decoded.kind !== "ok") return null;
    const refs = (decoded.refs ?? []).filter((ref) => ref.kind === "creation-output");
    if (!refs.length || refs[0]?.kind !== "creation-output") return null;
    return { jobId: refs[0].creationJobId, outputIds: refs.map((ref) => ref.outputId) };
  } catch {
    return null;
  }
}

/** 端口允许返回 `void`（旧实现或远端未返回摘要）；只有形状正确的回执才算证据。 */
function toStudioApplyReceipt(value: unknown): StudioApplyReceipt | undefined {
  if (!value || typeof value !== "object") return undefined;
  const receipt = value as StudioApplyReceipt;
  if (typeof receipt.operationId !== "string" || !Array.isArray(receipt.files)) return undefined;
  return receipt;
}
