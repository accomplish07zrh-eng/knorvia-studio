import {
  resolveWorkspaceKey,
  type KnorviaSessionStateSnapshot,
  type KnorviaTaskMeta,
  type KnorviaWorkspaceEvent,
  type KnorviaWorkspaceTaskListChanged,
} from "@knorvia/shared";
import {
  sessionsIndexTopic,
  sessionsIndexTopicFrameSchema,
  workspaceConfigTopic,
  workspaceConfigTopicFrameSchema,
  TopicWireFrameAssembler,
  type SessionsIndexTopicFrame,
  type WorkspaceConfigTopicFrame,
} from "@knorvia/shared/protocol-v4";
import { Emitter, type Event, type IDisposable } from "@knorvia/rpc";
import { createServiceLogger } from "#src/logger/serviceLogger.js";
import type { TaskIndexRepo } from "#src/session/taskIndexRepo.js";
import type { KnorviaWorkspaceEventSubscriptionParams } from "#src/session/taskListTypes.js";
import type {
  IKnorviaAgentService,
  KnorviaAgentSessionTarget,
  KnorviaAgentWorkspaceTarget,
} from "./agent.js";
import { createTopicIngest } from "./task-index-ingestion/topicIngest.js";
import type { TopicIngest } from "./task-index-ingestion/topicTypes.js";
import { createSessionIndexProjection } from "./task-index-ingestion/sessionIndexProjection.js";
import {
  createSnapshotProjection,
  type SnapshotSyncOptions,
  type WorkspaceBroadcastTarget,
} from "./task-index-ingestion/snapshotProjection.js";

const logger = createServiceLogger("knorvia-task-index-syncer");
type WorkspaceEventInput = string | KnorviaWorkspaceEventSubscriptionParams;

export interface KnorviaTaskIndexTerminalEvent {
  target: KnorviaAgentSessionTarget;
  kind: "turn.completed" | "turn.failed";
}

export interface KnorviaTaskIndexReadyEvent {
  target: KnorviaAgentSessionTarget;
  reason: "prompt_completed" | "prompt_failed";
}

export interface KnorviaTaskIndexSyncer {
  ensureWorkspaceSubscription(target: KnorviaAgentWorkspaceTarget): void;
  ensureSessionSubscription(
    target: KnorviaAgentSessionTarget,
    options?: { includeSnapshot?: boolean },
  ): void;
  syncSnapshotAndBroadcast(
    snapshot: KnorviaSessionStateSnapshot,
    options: SnapshotSyncOptions,
  ): Promise<KnorviaTaskMeta>;
  syncTaskModel(target: KnorviaAgentSessionTarget, model: string): Promise<KnorviaTaskMeta | null>;
  emitWorkspaceTaskListChanged(
    target: WorkspaceBroadcastTarget,
    meta: KnorviaTaskMeta | undefined,
    reason: KnorviaWorkspaceTaskListChanged["reason"],
    options?: Pick<KnorviaWorkspaceTaskListChanged, "unreadSignal">,
  ): void;
  getWorkspaceEmitter(workspace: WorkspaceEventInput): Emitter<KnorviaWorkspaceEvent>;
  onDynamicWorkspaceEvent(workspace: WorkspaceEventInput): Event<KnorviaWorkspaceEvent>;
  onSessionTerminalEvent: Event<KnorviaTaskIndexTerminalEvent>;
  onSessionReadyEvent: Event<KnorviaTaskIndexReadyEvent>;
  disposeAll(): void;
}

interface CreateKnorviaTaskIndexSyncerOptions {
  agentService: IKnorviaAgentService;
  taskIndexRepo: TaskIndexRepo;
}

interface WorkspaceOwner {
  target: KnorviaAgentWorkspaceTarget;
  runtimeGeneration: number | null;
  index: TopicIngest;
  config: TopicIngest;
  listeners: IDisposable[];
  listening: boolean;
  assemblyTimer: ReturnType<typeof setTimeout> | null;
}

export function createKnorviaTaskIndexSyncer({
  agentService,
  taskIndexRepo,
}: CreateKnorviaTaskIndexSyncerOptions): KnorviaTaskIndexSyncer {
  const workspaces = new Map<string, WorkspaceOwner>();
  const emitters = new Map<string, Emitter<KnorviaWorkspaceEvent>>();
  const available = new Map<string, number>();
  const terminal = new Emitter<KnorviaTaskIndexTerminalEvent>();
  const ready = new Emitter<KnorviaTaskIndexReadyEvent>();
  let disposed = false;
  const lifecycleAware = Boolean(agentService.onAgentRuntimeLifecycle);

  function live(workspace: WorkspaceOwner): boolean {
    return !disposed && workspaces.get(resolveWorkspaceKey(workspace.target)) === workspace;
  }

  function getWorkspaceEmitter(workspace: WorkspaceEventInput): Emitter<KnorviaWorkspaceEvent> {
    const key =
      typeof workspace === "string"
        ? workspace
        : resolveWorkspaceKey({
            workspacePath: workspace.workspacePath,
            workspaceIdentity: workspace.workspaceIdentity,
          });
    const previous = emitters.get(key);
    if (previous) return previous;
    const emitter = new Emitter<KnorviaWorkspaceEvent>();
    emitters.set(key, emitter);
    return emitter;
  }

  function emitWorkspaceTaskListChanged(
    target: WorkspaceBroadcastTarget,
    meta: KnorviaTaskMeta | undefined,
    reason: KnorviaWorkspaceTaskListChanged["reason"],
    options?: Pick<KnorviaWorkspaceTaskListChanged, "unreadSignal">,
  ): void {
    logger.debug(
      undefined,
      `[list-refresh-trace] emitWorkspaceTaskListChanged reason=${reason} taskId=${target.taskId ?? "-"} workspace=${target.workspacePath} hasMeta=${Boolean(meta)}`,
    );
    getWorkspaceEmitter({
      workspacePath: target.workspacePath,
      workspaceIdentity: target.workspaceIdentity,
    }).fire({
      type: "workspace_task_list_changed",
      workspacePath: target.workspacePath,
      workspaceIdentity: target.workspaceIdentity,
      taskId: target.taskId,
      reason,
      ...(meta ? { taskMeta: meta } : {}),
      ...(options?.unreadSignal ? { unreadSignal: options.unreadSignal } : {}),
    });
  }

  const snapshots = createSnapshotProjection(taskIndexRepo, emitWorkspaceTaskListChanged, logger);

  function clearAssemblyTimer(workspace: WorkspaceOwner): void {
    if (workspace.assemblyTimer) clearTimeout(workspace.assemblyTimer);
    workspace.assemblyTimer = null;
  }

  function scheduleAssembly(workspace: WorkspaceOwner): void {
    clearAssemblyTimer(workspace);
    const deadlines = [workspace.index.nextExpiryAt, workspace.config.nextExpiryAt].filter(
      (value): value is number => value !== null,
    );
    if (deadlines.length === 0) return;
    workspace.assemblyTimer = setTimeout(
      () => {
        workspace.assemblyTimer = null;
        const now = Date.now();
        workspace.index.expire(now);
        workspace.config.expire(now);
        scheduleAssembly(workspace);
      },
      Math.max(0, Math.min(...deadlines) - Date.now()),
    );
    workspace.assemblyTimer.unref?.();
  }

  function createWorkspace(
    target: KnorviaAgentWorkspaceTarget,
    generation: number | null,
  ): WorkspaceOwner {
    const summary = createSessionIndexProjection({
      target,
      agent: agentService,
      repo: taskIndexRepo,
      logger,
      emit: emitWorkspaceTaskListChanged,
      sync: snapshots.sync,
      terminal(target, next) {
        const failed = next.phase === "error";
        terminal.fire({ target, kind: failed ? "turn.failed" : "turn.completed" });
        ready.fire({ target, reason: failed ? "prompt_failed" : "prompt_completed" });
      },
      captureGenerationGuard() {
        const admitted = workspace.index.generation;
        return () => live(workspace) && admitted === workspace.index.generation;
      },
    });
    const workspace: WorkspaceOwner = {
      target,
      runtimeGeneration: generation,
      listeners: [],
      listening: false,
      assemblyTimer: null,
      index: createTopicIngest<SessionsIndexTopicFrame>({
        kind: "sessions-index",
        target,
        logger,
        live: () => live(workspace),
        topic: () => sessionsIndexTopic(resolveWorkspaceKey(target)),
        assembler: new TopicWireFrameAssembler(sessionsIndexTopicFrameSchema),
        subscribe: () =>
          agentService.subscribeSessionsIndexV4({
            ...target,
            visibility: "background",
            subscriberScope: "task-index",
            runtimePolicy: "existing-only",
          }),
        unsubscribe: (subscriptionId) =>
          agentService.unsubscribeSessionsIndexV4({
            ...target,
            subscriptionId,
            runtimePolicy: "existing-only",
          }),
        resync: (input) =>
          agentService.resyncSessionsIndexV4({
            ...target,
            subscriptionId: input.subscriptionId,
            base: input.base,
            runtimePolicy: "existing-only",
            ...(input.forceSnapshot ? { forceSnapshot: true } : {}),
          }),
        becameUnavailable: () => {
          workspace.runtimeGeneration = null;
        },
        apply: summary.apply,
        commitDeltaBeforeProjection: false,
        expiryChanged: () => scheduleAssembly(workspace),
      }),
      config: createTopicIngest<WorkspaceConfigTopicFrame>({
        kind: "workspace-config",
        target,
        logger,
        live: () => live(workspace),
        topic: () => workspaceConfigTopic(resolveWorkspaceKey(target)),
        assembler: new TopicWireFrameAssembler(workspaceConfigTopicFrameSchema),
        subscribe: () =>
          agentService.subscribeWorkspaceConfigV4({
            ...target,
            visibility: "background",
            subscriberScope: "task-index",
            runtimePolicy: "existing-only",
          }),
        unsubscribe: (subscriptionId) =>
          agentService.unsubscribeWorkspaceConfigV4({
            ...target,
            subscriptionId,
            runtimePolicy: "existing-only",
          }),
        resync: (input) =>
          agentService.resyncWorkspaceConfigV4({
            ...target,
            subscriptionId: input.subscriptionId,
            base: input.base,
            runtimePolicy: "existing-only",
            ...(input.forceSnapshot ? { forceSnapshot: true } : {}),
          }),
        becameUnavailable: () => {
          workspace.runtimeGeneration = null;
        },
        apply(frame) {
          const config =
            frame.payload.kind === "snapshot"
              ? frame.payload.snapshot.config
              : frame.payload.deltas.at(-1)?.config;
          // 空种子目录不能清除 UI 当前使用的模型选项。
          if (!config || config.configOptions.length === 0) return;
          getWorkspaceEmitter({
            workspacePath: target.workspacePath,
            workspaceIdentity: target.workspaceIdentity,
          }).fire({
            type: "workspace_config_options_update",
            workspacePath: target.workspacePath,
            workspaceIdentity: target.workspaceIdentity,
            configOptions: config.configOptions,
          });
        },
        commitDeltaBeforeProjection: true,
        expiryChanged: () => scheduleAssembly(workspace),
      }),
    };
    return workspace;
  }

  function start(workspace: WorkspaceOwner, reason: "initial" | "runtime-restart"): void {
    if (!live(workspace)) return;
    if (!workspace.listening) {
      workspace.listeners.push(
        agentService.onDynamicSessionsIndexFrame(workspace.target)((frame) =>
          workspace.index.receive(frame),
        ),
        agentService.onDynamicWorkspaceConfigFrame(workspace.target)((frame) =>
          workspace.config.receive(frame),
        ),
      );
      workspace.listening = true;
    }
    // 两个独立代际在同一同步入口启动；sibling 的 ACK 不受另一个 topic 的重试影响。
    void workspace.index.subscribe(reason, false);
    void workspace.config.subscribe(reason, false);
  }

  function ensureWorkspaceSubscription(target: KnorviaAgentWorkspaceTarget): void {
    if (disposed || !target.workspacePath) return;
    const key = resolveWorkspaceKey(target);
    if (workspaces.has(key)) return;
    const workspace = createWorkspace(
      {
        workspacePath: target.workspacePath,
        workspaceIdentity: target.workspaceIdentity,
      },
      available.get(key) ?? null,
    );
    workspaces.set(key, workspace);
    if (!lifecycleAware || workspace.runtimeGeneration !== null) start(workspace, "initial");
  }

  const lifecycle = agentService.onAgentRuntimeLifecycle?.((event) => {
    if (disposed) return;
    const generation = event.runtimeIdentity.generation;
    const workspace = workspaces.get(event.workspaceKey);
    if (event.state === "unavailable") {
      if (available.get(event.workspaceKey) === generation) available.delete(event.workspaceKey);
      if (!workspace || workspace.runtimeGeneration !== generation) return;
      workspace.runtimeGeneration = null;
      workspace.index.reset(false);
      workspace.config.reset(false);
      clearAssemblyTimer(workspace);
      return;
    }
    available.set(event.workspaceKey, generation);
    if (!workspace) {
      ensureWorkspaceSubscription({
        workspacePath: event.workspacePath,
        workspaceIdentity: event.workspaceIdentity,
      });
    } else if (workspace.runtimeGeneration !== generation) {
      workspace.runtimeGeneration = generation;
      start(workspace, "runtime-restart");
    }
  });
  const restarted = lifecycleAware
    ? undefined
    : agentService.onAgentRuntimeRestarted?.((event) => {
        const workspace = workspaces.get(event.workspaceKey);
        if (workspace) start(workspace, "runtime-restart");
      });

  return {
    ensureWorkspaceSubscription,
    ensureSessionSubscription(target) {
      if (target.sessionId && target.workspacePath)
        ensureWorkspaceSubscription({
          workspacePath: target.workspacePath,
          workspaceIdentity: target.workspaceIdentity,
        });
    },
    syncSnapshotAndBroadcast: snapshots.sync,
    syncTaskModel: snapshots.model,
    emitWorkspaceTaskListChanged,
    getWorkspaceEmitter,
    onDynamicWorkspaceEvent: (workspace) => getWorkspaceEmitter(workspace).event,
    onSessionTerminalEvent: terminal.event,
    onSessionReadyEvent: ready.event,
    disposeAll() {
      disposed = true;
      for (const workspace of workspaces.values()) {
        workspace.index.reset(true);
        workspace.config.reset(true);
        clearAssemblyTimer(workspace);
        for (const listener of workspace.listeners) {
          try {
            listener.dispose();
          } catch {
            // 每个已持有的 listener 都需要尝试释放，单个异常不能阻断其余资源。
          }
        }
      }
      workspaces.clear();
      for (const emitter of emitters.values()) emitter.dispose();
      emitters.clear();
      terminal.dispose();
      ready.dispose();
      lifecycle?.dispose();
      restarted?.dispose();
      available.clear();
    },
  };
}
