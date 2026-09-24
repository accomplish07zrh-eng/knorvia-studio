import type { IKnorviaSessionService } from "@knorvia/services";
import { logger } from "@/logger.js";
import { useKnorviaSessionStore } from "@/store/sessionStore.js";

interface DeferredDraftRuntimeChangeParams {
  logScope: string;
  reason: string;
  workspacePath?: string | null;
  workspaceIdentity?: string | null;
  sessionService: Pick<IKnorviaSessionService, "closeSession">;
}

export async function invalidateDeferredDraftSessionForRuntimeChange(
  params: DeferredDraftRuntimeChangeParams,
): Promise<void> {
  if (!params.workspacePath) {
    return;
  }

  const workspaceIdentity = params.workspaceIdentity?.trim() || undefined;
  const store = useKnorviaSessionStore.getState();
  const draftSessionId = store.getWorkspaceState(
    params.workspacePath,
    workspaceIdentity,
  ).draftSessionId;
  // protocol-v4 的草稿 session 由 pane 本地预热，draftSessionId 会保持 null。
  // 无论 legacy session 是否存在，都要先发布 workspace 隔离的运行时失效版本。
  store.invalidateDraftRuntime(params.workspacePath, workspaceIdentity);
  if (!draftSessionId) {
    return;
  }

  try {
    await params.sessionService.closeSession({
      workspacePath: params.workspacePath,
      ...(workspaceIdentity ? { workspaceIdentity } : {}),
      sessionId: draftSessionId,
    });
    logger.info(`[${params.logScope}] invalidated deferred draft session after runtime change`, {
      draftSessionId,
      reason: params.reason,
      workspaceIdentity: workspaceIdentity ?? null,
      workspacePath: params.workspacePath,
    });
  } catch (error) {
    logger.warn(`[${params.logScope}] close deferred draft session after runtime change failed`, {
      draftSessionId,
      reason: params.reason,
      workspaceIdentity: workspaceIdentity ?? null,
      workspacePath: params.workspacePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function invalidateDeferredDraftSessionForSkillChange(
  params: Omit<DeferredDraftRuntimeChangeParams, "logScope">,
): Promise<void> {
  await invalidateDeferredDraftSessionForRuntimeChange({ ...params, logScope: "skills" });
}
