import type { IStudioRuntimeService, StudioCommand, StudioCommandResult } from "../contract.js";
import type { Event } from "@knorvia/rpc";
import type {
  StudioKernelConfig,
  StudioKernelId,
  StudioKernelStatus,
  StudioKernelUsage,
} from "../kernelTypes.js";
import type { ICreationService } from "../../creation/contract.js";
import {
  activeRunStates,
  STUDIO_KERNEL_IDS,
  validStudioId,
  validKernel,
  validModel,
  validWorkspace,
  validateStudioKernelManagement,
} from "../domain/validation.js";
import type { StudioOverview, StudioTimeline, StudioMessage, StudioInteraction, StudioTurnSnapshot } from "../types.js";
import type { StudioKernelRegistry, StudioWorkspacePort } from "./ports.js";
import type { StudioClock, StudioRepository } from "./storePort.js";
import { admitStudioCommand, requiredRun } from "./commandAdmission.js";
import { executeStudioRun, expireRunInteractions } from "./runExecutor.js";
import { StudioExecutionLimiter } from "./executionLimiter.js";
import { studioProjectKey } from "../domain/projectIdentity.js";
import { StudioRuntimeLifecycle } from "./runtimeLifecycle.js";
import { hasUnknownStudioRun, studioRunHistory } from "./runQueries.js";
import { applyStudioWorkspaceChanges, inspectStudioWorkspaceChanges } from "./workspaceReview.js";
import { parseRemoteStudioKernelId } from "../domain/remoteAgentIdentity.js";
import { assertRemoteStudioMembersOnline } from "./remoteAdmission.js";
import { readStudioGroupMetrics } from "./groupMetricsProjection.js";
export interface StudioRuntimeDependencies {
  db: StudioRepository;
  clock: StudioClock;
  kernels: StudioKernelRegistry;
  workspaces: StudioWorkspacePort;
  creation?: ICreationService;
  onDidChange: Event<{ revision: number }>;
  notify(revision: number): void;
  process?: { id: number; alive(id: number): boolean };
}
export class StudioRuntimeService implements IStudioRuntimeService {
  readonly onDidChange: Event<{ revision: number }>;
  private readonly owner: string;
  private readonly active = new Map<
    string,
    { controller: AbortController; promise: Promise<void> }
  >();
  private readonly limiter = new StudioExecutionLimiter();
  private readonly lifecycle = new StudioRuntimeLifecycle();
  private lastRevision = -1;
  private disposal?: Promise<void>;

  constructor(private readonly deps: StudioRuntimeDependencies) {
    this.owner = deps.clock.id();
    this.onDidChange = deps.onDidChange;
  }
  async overview(): Promise<StudioOverview> {
    this.lifecycle.assertOpen();
    const { db } = this.deps;
    return {
      revision: db.revision(),
      configs: this.configs(),
      conversations: db.list("conversation", { all: true }),
      groups: db.list("group", { all: true }),
      workflows: db.list("workflow", { all: true }),
      runs: studioRunHistory(db),
    };
  }

  async timeline(targetId: string, before?: number): Promise<StudioTimeline> {
    this.lifecycle.assertOpen();
    validStudioId(targetId);
    const { db } = this.deps;
    const messages = db
      .list<StudioMessage>("message", { scope: targetId, limit: 500, before })
      .reverse();
    const runs = studioRunHistory(db, targetId).map((run) => ({
      ...run,
      workspaceStepIds: db
        .list<{ stepId: string }>("workspace-head", { scope: run.id, limit: 10000 })
        .map((item) => item.stepId),
    }));
    const latestRun = runs[0];
    const latestTurn = latestRun
      ? db.list<{ id: string }>("turn", { scope: latestRun.id, limit: 1 })[0]
      : undefined;
    const usage = latestTurn ? db.read<StudioKernelUsage>("usage", latestTurn.id) : undefined;
    return {
      revision: db.revision(),
      messages,
      nextBefore: messages.length === 500 ? messages[0]?.sequence : undefined,
      interactions: [
        ...new Map(
          [
            ...db.list<StudioInteraction>("interaction", { scope: targetId, limit: 100 }),
            ...db.list<StudioInteraction>("interaction", {
              scope: targetId,
              limit: 10000,
              pendingInteractionsOnly: true,
            }),
          ].map((item) => [item.id, item]),
        ).values(),
      ],
      runs,
      ...(usage && latestRun && latestTurn
        ? { usage: { ...usage, runId: latestRun.id, turnId: latestTurn.id } }
        : {}),
      ...(latestRun?.kind === "group" ? { groupMetrics: readStudioGroupMetrics(db, latestRun, this.deps.clock.now()) } : {}),
      turns: runs
        .slice(0, 10)
        .flatMap((run) =>
          db.list<StudioTurnSnapshot>(
            "turn",
            { scope: run.id, limit: 1000 },
          ),
        ),
    };
  }

  async command(command: StudioCommand): Promise<StudioCommandResult> {
    this.lifecycle.assertOpen();
    assertRemoteStudioMembersOnline(command, this.deps.db, this.deps.kernels);
    const result = admitStudioCommand(this.deps.db, this.deps.clock, command);
    this.changed();
    return result;
  }
  inspectKernels() {
    return this.lifecycle.run(async () => {
      const live = await this.deps.kernels.inspect(this.configs());
      const remote = live.filter((status) => parseRemoteStudioKernelId(status.id));
      const known = this.deps.db.list<StudioKernelStatus>("remote-kernel-status", {
        limit: 10_000,
      });
      this.deps.db.transaction(() => {
        for (const status of remote) {
          const saved = { ...status, executablePath: undefined };
          const previous = this.deps.db.read<StudioKernelStatus>("remote-kernel-status", status.id);
          if (JSON.stringify(previous) !== JSON.stringify(saved))
            this.deps.db.write("remote-kernel-status", status.id, saved);
        }
      });
      const liveIds = new Set(remote.map((status) => status.id));
      return [
        ...live,
        ...known
          .filter((status) => !liveIds.has(status.id))
          .map((status) => ({
            ...status,
            installed: false,
            error: "SSH 连接已断开",
          })),
      ];
    });
  }
  async kernelOptions(params: { kernel: StudioKernelId; workspacePath?: string; model?: string }) {
    return this.lifecycle.run(async () => {
      validKernel(params.kernel);
      if (params.workspacePath) validWorkspace(params.workspacePath);
      if (params.model) validModel(params.model);
      if (!this.deps.kernels.options) return { models: [], error: "当前内核未提供模型目录" };
      return this.deps.kernels.options({ ...params, config: this.configFor(params.kernel) });
    });
  }
  async manageKernel(params: {
    kernel: StudioKernelId;
    action: "install" | "update" | "uninstall" | "update-existing";
  }) {
    return this.lifecycle.run(async () => {
      validateStudioKernelManagement(params);
      if (this.deps.db.list("active").length)
        throw new Error("请先停止运行中的任务，再管理内核安装");
      const previous = this.configFor(params.kernel);
      const before = (await this.deps.kernels.inspect(this.configs())).find(
        (item) => item.id === params.kernel,
      );
      const status = await this.deps.kernels.manage(params.kernel, params.action);
      // 管理操作成功后由服务持久化受管路径；UI 断开不会留下已卸载或过时的配置。
      if (
        params.action !== "update-existing" &&
        (!previous.executablePath || before?.origin === "managed")
      ) {
        this.deps.db.transaction(() => {
          const latest = this.configFor(params.kernel);
          if (latest.executablePath !== previous.executablePath) return;
          this.deps.db.write("config", params.kernel, {
            ...latest,
            executablePath: params.action === "uninstall" ? "" : (status.executablePath ?? ""),
          });
        });
        this.changed();
      }
      return status;
    });
  }

  async prepareAgentWorkspace(params: {
    runId: string;
    stepId: string;
    sourcePath: string;
    mode: "isolated" | "shared";
  }): Promise<string> {
    return this.lifecycle.run(async () => {
      validStudioId(params.runId);
      validStudioId(params.stepId);
      validWorkspace(params.sourcePath);
      if (params.mode !== "isolated" && params.mode !== "shared")
        throw new Error("无效的工作区模式");
      return this.deps.workspaces.prepare(params);
    });
  }

  async agentWorkspaceChanges(params: { runId: string; stepId: string }) {
    return this.lifecycle.run(async () => {
      validStudioId(params.runId);
      validStudioId(params.stepId);
      return this.deps.workspaces.changes(params.runId, params.stepId);
    });
  }

  async applyAgentWorkspaceChanges(params: { runId: string; stepId: string; paths: string[] }) {
    return this.lifecycle.run(async () => {
      validStudioId(params.runId);
      validStudioId(params.stepId);
      if (!Array.isArray(params.paths) || !params.paths.length || params.paths.length > 1000)
        throw new Error("请选择需要应用的文件");
      await this.deps.workspaces.apply(params.runId, params.stepId, params.paths);
    });
  }

  async workspaceChanges(params: { runId: string; stepId: string }) {
    return this.lifecycle.run(() =>
      inspectStudioWorkspaceChanges(this.deps, params.runId, params.stepId),
    );
  }

  async applyWorkspaceChanges(params: {
    runId: string;
    stepId: string;
    paths: string[];
  }): Promise<void> {
    return this.lifecycle.run(() => applyStudioWorkspaceChanges(this.deps, params));
  }

  tick(): void {
    if (this.lifecycle.stopping) return;
    const { db, clock } = this.deps;
    const claim = db.claim(this.owner, clock.now());
    if (claim === "busy") {
      for (const item of this.active.values())
        item.controller.abort(new Error("任务已由另一个窗口接管"));
      this.changed();
      return;
    }
    if (claim === "acquired") this.recover();
    const activeTargets = new Set<string>();
    for (const [id, item] of this.active) {
      const run = requiredRun(db, id);
      activeTargets.add(run.targetId);
      if (run.cancelRequested || !activeRunStates.has(run.state))
        item.controller.abort(new Error("任务已停止"));
    }
    const queuedRuns = db.queuedRuns();
    for (const run of queuedRuns) {
      if (hasUnknownStudioRun(db, run.targetId)) continue;
      if (this.active.size >= 8 || activeTargets.has(run.targetId)) continue;
      const project =
        run.definition?.workspacePath ??
        db.read<{ workspacePath: string }>("conversation", run.targetId)?.workspacePath;
      if (project && db.read("apply-lock", studioProjectKey(project))) continue;
      db.transaction(() => {
        if (!db.owns(this.owner, clock.now())) throw new Error("执行权失效");
        run.owner = this.owner;
        run.state = "running";
        run.updatedAt = clock.now();
        db.write("run", run.id, run, run.targetId);
      });
      activeTargets.add(run.targetId);
      const controller = new AbortController();
      const promise = executeStudioRun(
        {
          ...this.deps,
          owner: this.owner,
          config: (kernel) => this.configFor(kernel),
          acquire: (key, signal) => this.limiter.acquire(key, signal),
        },
        run.id,
        controller.signal,
      )
        .catch((error: unknown) => this.failRun(run.id, error))
        .finally(() => {
          this.active.delete(run.id);
          this.changed();
        });
      this.active.set(run.id, { controller, promise });
    }
    this.changed();
  }

  disposeAll(): void {
    void this.disposeAllAndWait();
  }
  disposeAllAndWait(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.lifecycle.stop();
    // 先固定唯一 disposal，再触发 abort 回调，避免重入退出创建第二条关库路径。
    this.disposal = Promise.resolve().then(async () => {
      const { db, clock } = this.deps;
      if (db.owns(this.owner, clock.now()))
        db.transaction(() => {
          for (const id of this.active.keys()) {
            const run = requiredRun(db, id);
            if (!activeRunStates.has(run.state)) continue;
            run.state = "interrupted";
            run.resultKnown = false;
            run.error = "应用已退出，请检查未完成步骤后继续";
            run.updatedAt = clock.now();
            db.write("run", id, run, run.targetId);
            db.remove("active", id);
            expireRunInteractions(db, run);
          }
        });
      for (const item of this.active.values()) item.controller.abort(new Error("应用退出"));
      // 内核取消必须与 RPC 排空并行：安装/探测可能正等该取消才能退出。
      // 文件应用不被中途遗弃，finally 清理与管理配置提交均须发生在 close 之前。
      const [kernels] = await Promise.allSettled([
        Promise.resolve().then(() => this.deps.kernels.dispose()),
        this.lifecycle.drain(),
        ...[...this.active.values()].map((item) => item.promise),
      ]);
      try {
        db.release(this.owner);
      } finally {
        db.close();
      }
      if (kernels.status === "rejected") throw kernels.reason;
    });
    return this.disposal;
  }

  private configFor(kernel: StudioKernelId): StudioKernelConfig {
    return this.deps.db.read("config", kernel) ?? { executablePath: "", permission: "ask" };
  }

  private configs(): Record<StudioKernelId, StudioKernelConfig> {
    const custom = this.deps.db.list<{ id: StudioKernelId }>("config-index", { limit: 10_000 });
    return Object.fromEntries(
      [...new Set([...STUDIO_KERNEL_IDS, ...custom.map((entry) => entry.id)])].map((id) => [
        id,
        this.configFor(id),
      ]),
    ) as Record<StudioKernelId, StudioKernelConfig>;
  }

  private changed(): void {
    if (this.lifecycle.stopping) return;
    const revision = this.deps.db.revision();
    if (revision !== this.lastRevision) {
      this.lastRevision = revision;
      this.deps.notify(revision);
    }
  }
  private recover(): void {
    const { db, clock } = this.deps;
    for (const item of this.active.values()) item.controller.abort(new Error("执行租约已过期"));
    db.transaction(() => {
      for (const item of db.list<{ id: string }>("active")) {
        const run = requiredRun(db, item.id);
        if (!["running", "waiting"].includes(run.state)) continue;
        const uncertain = db
          .list<{ state: string; attempt: number }>("turn", { scope: run.id })
          .some((turn) => turn.state === "running" && turn.attempt === run.attempt);
        run.state = uncertain ? "interrupted" : "queued";
        run.owner = undefined;
        run.updatedAt = clock.now();
        if (uncertain) {
          run.resultKnown = false;
          run.error = "上次执行意外中断，部分操作结果不确定。请检查项目后选择重试。";
          db.remove("active", run.id);
          expireRunInteractions(db, run);
        }
        db.write("run", run.id, run, run.targetId);
      }
    });
  }
  private failRun(id: string, error: unknown): void {
    if (this.lifecycle.stopping || !this.deps.db.owns(this.owner, this.deps.clock.now())) return;
    this.deps.db.transaction(() => {
      const run = requiredRun(this.deps.db, id);
      if (run.owner !== this.owner || !activeRunStates.has(run.state)) return;
      run.state = "interrupted";
      run.resultKnown = false;
      run.error = error instanceof Error ? error.message : String(error);
      this.deps.db.write("run", id, run, run.targetId);
      this.deps.db.remove("active", id);
      expireRunInteractions(this.deps.db, run);
    });
  }
}
