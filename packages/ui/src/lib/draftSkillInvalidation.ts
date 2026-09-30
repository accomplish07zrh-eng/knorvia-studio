// SPDX-License-Identifier: Apache-2.0
// Modified for Knorvia Studio: B1 draft retirement phases, 2026-09-30.
// Prior source was reviewed; independent authorship/license review remains pending.
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

interface DraftRetirement {
  draftSessionId: string;
  workspaceIdentity: string | undefined;
}

function invalidateRuntime(params: DeferredDraftRuntimeChangeParams): DraftRetirement | undefined {
  if (!params.workspacePath) return undefined;
  const workspaceIdentity = params.workspaceIdentity?.trim() || undefined;
  const owner = useKnorviaSessionStore.getState();
  const draftSessionId = owner.getWorkspaceState(
    params.workspacePath,
    workspaceIdentity,
  ).draftSessionId;
  // store 是唯一 epoch owner：先同步失效，再关闭捕获的旧草稿，V4 无 legacy id 也必须失效。
  owner.invalidateDraftRuntime(params.workspacePath, workspaceIdentity);
  return draftSessionId ? { draftSessionId, workspaceIdentity } : undefined;
}

type RetirementOutcome = { kind: "closed" } | { kind: "failed"; error: unknown };

function reportRetirement(
  params: DeferredDraftRuntimeChangeParams,
  retirement: DraftRetirement,
  outcome: RetirementOutcome,
): void {
  const message =
    outcome.kind === "closed"
      ? `[${params.logScope}] invalidated deferred draft session after runtime change`
      : `[${params.logScope}] close deferred draft session after runtime change failed`;
  const context = {
    draftSessionId: retirement.draftSessionId,
    reason: params.reason,
    workspaceIdentity: retirement.workspaceIdentity ?? null,
    workspacePath: params.workspacePath,
  };
  if (outcome.kind === "closed") {
    logger.info(message, context);
  } else {
    logger.warn(message, {
      ...context,
      error: outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
    });
  }
}

export async function invalidateDeferredDraftSessionForRuntimeChange(
  params: DeferredDraftRuntimeChangeParams,
): Promise<void> {
  // 同步阶段的 owner 失败直接 reject；只有后续 close/info 才进入 warn 路径。
  const retirement = invalidateRuntime(params);
  if (!retirement) return;
  try {
    await params.sessionService.closeSession({
      workspacePath: params.workspacePath!,
      ...(retirement.workspaceIdentity ? { workspaceIdentity: retirement.workspaceIdentity } : {}),
      sessionId: retirement.draftSessionId,
    });
    reportRetirement(params, retirement, { kind: "closed" });
  } catch (error) {
    reportRetirement(params, retirement, { kind: "failed", error });
  }
}

export async function invalidateDeferredDraftSessionForSkillChange(
  params: Omit<DeferredDraftRuntimeChangeParams, "logScope">,
): Promise<void> {
  await invalidateDeferredDraftSessionForRuntimeChange({ ...params, logScope: "skills" });
}
