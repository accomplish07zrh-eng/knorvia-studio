import type { IKnorviaAgentService } from "#src/agent/agent.js";
import type { KnorviaTaskIndexSyncer } from "#src/agent/taskIndexSyncer.js";
import { formatModelPickerValue } from "#src/agent/configOptions.js";
import { createServiceLogger } from "#src/logger/serviceLogger.js";
import {
  createSessionTraceId,
  type KnorviaAgentMcpServer,
  type KnorviaSessionStateSnapshot,
} from "@knorvia/shared";
import type {
  IKnorviaSessionService,
  KnorviaSessionReadParams,
  KnorviaSessionResumeParams,
  KnorviaTaskTarget,
} from "./session.js";
import { createKnorviaSessionApiRetryRuntimeTracker } from "./sessionApiRetry.js";
import { createKnorviaDeferredDraftRegistry } from "./sessionDraftRegistry.js";
import { repairEmptyImportedClaudeSessionSnapshot } from "./importedClaudeSessionRepair.js";
import {
  prepareSessionInvocation,
  sessionSnapshotDiagnostics,
  sessionThoughtLevelChoices,
} from "./sessionPreparation.js";
import type { CuaProductMcpServerResolver } from "#src/cua-permission-broker/index.js";

const logger = createServiceLogger("agent-session-service");

interface CreateKnorviaSessionServiceOptions {
  agentService: IKnorviaAgentService;
  taskIndexSyncer?: KnorviaTaskIndexSyncer;
  cuaProductMcpServerResolver?: CuaProductMcpServerResolver;
  creationMcpServer?: (workspacePath: string) => Promise<KnorviaAgentMcpServer>;
}

export function createKnorviaSessionService({
  agentService,
  taskIndexSyncer,
  cuaProductMcpServerResolver,
  creationMcpServer,
}: CreateKnorviaSessionServiceOptions): IKnorviaSessionService {
  const retry = createKnorviaSessionApiRetryRuntimeTracker();
  const drafts = createKnorviaDeferredDraftRegistry();
  const preparation = { creationMcpServer, cuaProductMcpServerResolver };

  // 一个投影入口只向既有 index owner 发命令，不保存另一份已接受的 session 状态。
  const index = {
    watch(target: KnorviaTaskTarget, options?: { includeSnapshot?: boolean }): void {
      taskIndexSyncer?.ensureSessionSubscription(
        {
          workspacePath: target.workspacePath,
          workspaceIdentity: target.workspaceIdentity,
          sessionId: target.sessionId,
        },
        options,
      );
    },
    async publish(
      snapshot: KnorviaSessionStateSnapshot,
      operation: string,
      options: Parameters<KnorviaTaskIndexSyncer["syncSnapshotAndBroadcast"]>[1],
    ): Promise<void> {
      if (!taskIndexSyncer) return;
      try {
        logger.debug(
          undefined,
          `[list-refresh-trace] broadcastSnapshot tag=${operation} taskId=${snapshot.session.sessionId}`,
        );
        await taskIndexSyncer.syncSnapshotAndBroadcast(snapshot, options);
      } catch (error) {
        logger.warn(
          undefined,
          `[agent-session-service] ${operation} syncSnapshotAndBroadcast 失败 taskId=${snapshot.session.sessionId}`,
          error,
        );
      }
    },
  };

  async function recover(
    snapshot: KnorviaSessionStateSnapshot,
    target: KnorviaSessionResumeParams | KnorviaSessionReadParams,
  ): Promise<KnorviaSessionStateSnapshot> {
    const projected = retry.withApiRetryRuntime(snapshot);
    const repaired = await repairEmptyImportedClaudeSessionSnapshot({
      agentService,
      snapshot: projected,
      target,
    });
    return retry.withApiRetryRuntime(repaired);
  }

  function selectThoughtLevelOverride(
    initial: KnorviaSessionStateSnapshot,
    target: KnorviaSessionResumeParams,
  ): string | undefined {
    const requested = target.thoughtLevel?.trim();
    if (!requested || initial.settings.thoughtLevel.current === requested) {
      return requested;
    }
    const choices = sessionThoughtLevelChoices(initial);
    if (choices !== null && !choices.has(requested)) {
      // 模型能力由恢复快照决定；不能把旧模型的 task-local 等级写到不支持它的新模型。
      logger.warn(undefined, "[agent-session-service] resumeSession 跳过不支持的 task 思考强度", {
        availableThoughtLevels: Array.from(sessionThoughtLevelChoices(initial) ?? []),
        requestedThoughtLevel: requested,
        sessionId: target.sessionId,
        snapshotThoughtLevel: initial.settings.thoughtLevel.current ?? null,
        workspaceIdentity: target.workspaceIdentity ?? null,
        workspacePath: target.workspacePath,
      });
      return undefined;
    }
    return requested;
  }

  function declineDraftClose(target: KnorviaTaskTarget, error: unknown): false {
    logger.warn(undefined, "[agent-session-service] 条件关闭 deferred draft 失败，保留旧 session", {
      error: error instanceof Error ? error.message : String(error),
      sessionId: target.sessionId,
      workspaceIdentity: target.workspaceIdentity ?? null,
      workspacePath: target.workspacePath,
    });
    return false;
  }

  function acceptDraftClose(target: KnorviaTaskTarget, closed: boolean): boolean {
    try {
      // Agent 的关闭确认才允许释放草稿；请求提交时仍由 registry 保持原成员关系。
      if (closed) drafts.forget(target);
      return closed;
    } catch (error) {
      return declineDraftClose(target, error);
    }
  }

  const service: IKnorviaSessionService = {
    async initializeWorkspace(params) {
      const initialized = await agentService.initialize(params);
      if (initialized.available && taskIndexSyncer) {
        taskIndexSyncer.ensureWorkspaceSubscription({
          workspacePath: params.workspacePath,
          workspaceIdentity: params.workspaceIdentity,
        });
      }
      return initialized;
    },
    getWorkspaceRuntimeIdentity: (params) => agentService.getWorkspaceRuntimeIdentity(params),
    readWorkspacePresentation: (params) => agentService.readWorkspacePresentation(params),

    async createSession(params) {
      const start = Date.now();
      const trace = params.sessionTraceId ?? createSessionTraceId();
      const invocation = await prepareSessionInvocation(
        { ...params, sessionTraceId: trace },
        preparation,
      );
      logger.info(trace, "[agent-session-service] createSession 分配 session trace", {
        persistence: invocation.persistence,
        workspaceIdentity: invocation.workspaceIdentity,
        workspacePath: invocation.workspacePath,
      });
      const snapshot = await agentService.createSession(invocation);
      logger.info(trace, "[agent-session-service] createSession agent 返回", {
        durationMs: Date.now() - start,
        mcpServerCount: invocation.mcpServers?.length ?? 0,
        persistence: invocation.persistence,
        snapshotTraceId: snapshot.session.traceId ?? null,
        sessionId: snapshot.session.sessionId,
        workspaceIdentity: invocation.workspaceIdentity,
        workspacePath: invocation.workspacePath,
      });
      if (invocation.persistence === "deferred") {
        drafts.remember(invocation, snapshot);
        return snapshot;
      }
      index.watch({
        workspacePath: snapshot.session.workspace.workspacePath,
        workspaceIdentity: snapshot.session.workspace.workspaceIdentity,
        sessionId: snapshot.session.sessionId,
      });
      const projected = retry.withApiRetryRuntime(snapshot);
      const publishStart = Date.now();
      await index.publish(projected, "createSession", {
        moveGroupedTaskToTop: true,
        broadcastReason: "task_meta_changed",
      });
      logger.info(trace, "[agent-session-service] createSession task index 同步完成", {
        broadcastDurationMs: Date.now() - publishStart,
        durationMs: Date.now() - start,
        sessionId: snapshot.session.sessionId,
        workspaceIdentity: params.workspaceIdentity,
        workspacePath: params.workspacePath,
      });
      return projected;
    },

    async resumeSession(params) {
      const start = Date.now();
      const { broadcastSnapshot = true, ...request } = params;
      const invocation = await prepareSessionInvocation(request, preparation);
      let snapshot = await recover(await agentService.resumeSession(invocation), invocation);
      const thoughtLevelOverride = selectThoughtLevelOverride(snapshot, invocation);
      if (thoughtLevelOverride && snapshot.settings.thoughtLevel.current !== thoughtLevelOverride) {
        logger.info(undefined, "[agent-session-service] resumeSession 重放 task 思考强度", {
          requestedThoughtLevel: thoughtLevelOverride,
          sessionId: invocation.sessionId,
          snapshotThoughtLevel: snapshot.settings.thoughtLevel.current ?? null,
          workspaceIdentity: invocation.workspaceIdentity ?? null,
          workspacePath: invocation.workspacePath,
        });
        snapshot = await recover(
          await agentService.setThoughtLevel({
            workspacePath: invocation.workspacePath,
            workspaceIdentity: invocation.workspaceIdentity,
            sessionId: invocation.sessionId,
            thoughtLevel: thoughtLevelOverride,
          }),
          invocation,
        );
      }
      const agentDurationMs = Date.now() - start;
      index.watch(invocation, { includeSnapshot: broadcastSnapshot });
      const publishStart = Date.now();
      const modelOverride = invocation.model ? formatModelPickerValue(invocation.model) : undefined;
      if (broadcastSnapshot) {
        await index.publish(snapshot, "resumeSession", {
          ...(modelOverride ? { modelOverride } : {}),
          ...(thoughtLevelOverride ? { thoughtLevelOverride } : {}),
          broadcastReason: "task_status_changed",
        });
      } else if (modelOverride && taskIndexSyncer) {
        // 发送前恢复只能更新模型记录；历史终态快照会覆盖 UI 已开始的新输入运行态。
        await taskIndexSyncer.syncTaskModel(
          {
            workspacePath: invocation.workspacePath,
            workspaceIdentity: invocation.workspaceIdentity,
            sessionId: invocation.sessionId,
          },
          modelOverride,
        );
      }
      logger.info(undefined, "[agent-session-service] resumeSession 历史恢复完成", {
        agentDurationMs,
        broadcastDurationMs: broadcastSnapshot ? Date.now() - publishStart : 0,
        broadcastSnapshot,
        durationMs: Date.now() - start,
        mcpServerCount: invocation.mcpServers?.length ?? 0,
        sessionId: invocation.sessionId,
        snapshot: sessionSnapshotDiagnostics(snapshot),
        workspaceIdentity: invocation.workspaceIdentity ?? null,
        workspacePath: invocation.workspacePath,
      });
      return snapshot;
    },
    listSessions: (params) => agentService.listSessions(params),

    async readSession(params) {
      const start = Date.now();
      const snapshot = await recover(await agentService.readSession(params), params);
      logger.info(undefined, "[agent-session-service] readSession 历史快照读取完成", {
        deliveryKind: params.deliveryKind,
        durationMs: Date.now() - start,
        messageLimit: params.messageLimit ?? null,
        sessionId: params.sessionId,
        snapshot: sessionSnapshotDiagnostics(snapshot),
        workspaceIdentity: params.workspaceIdentity ?? null,
        workspacePath: params.workspacePath,
      });
      return snapshot;
    },
    readSessionMessages: (params) => agentService.readSessionMessages(params),
    readSessionEvents: (params) => agentService.readSessionEvents(params),

    promoteDeferredDraftSession(params) {
      const remembered = drafts.has(params);
      drafts.forget(params);
      if (remembered) {
        index.watch(params);
        logger.info(undefined, "[agent-session-service] deferred draft session 已提升为 task", {
          sessionId: params.sessionId,
          workspaceIdentity: params.workspaceIdentity ?? null,
          workspacePath: params.workspacePath,
        });
      }
      return Promise.resolve();
    },
    closeSession(params) {
      drafts.forget(params);
      return agentService.closeSession(params).then(() => undefined);
    },
    async closeDeferredDraftSession(params) {
      let acknowledgement: Promise<boolean>;
      try {
        acknowledgement = Promise.resolve(
          agentService.closeSession({ ...params, expectedPersistence: "deferred" }),
        );
      } catch (error) {
        return declineDraftClose(params, error);
      }
      // 两个完成通道分别处理确认和拒绝，避免把诊断失败再次当作关闭失败重复报告。
      return acknowledgement.then(
        (closed) => acceptDraftClose(params, closed),
        (error) => declineDraftClose(params, error),
      );
    },
    async setModel(params) {
      const draftAtAdmission = drafts.has(params);
      if (!draftAtAdmission) index.watch(params);
      const snapshot = retry.withApiRetryRuntime(await agentService.setModel(params));
      if (!draftAtAdmission) {
        await index.publish(snapshot, "setModel", {
          modelOverride: formatModelPickerValue(params.model),
          broadcastReason: "task_model_changed",
        });
      }
      return snapshot;
    },
    async setThoughtLevel(params) {
      return retry.withApiRetryRuntime(await agentService.setThoughtLevel(params));
    },
    async setMode(params) {
      return retry.withApiRetryRuntime(await agentService.setMode(params));
    },
  };
  return service;
}
