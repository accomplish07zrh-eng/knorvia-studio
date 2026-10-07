// SPDX-License-Identifier: Apache-2.0
import type { StudioClock, StudioRepository } from "./storePort.js";
import type {
  WorkspaceRuntimePort,
  WorkspaceRuntimeProcess,
  WorkspaceRuntimeProcessProof,
} from "./workspaceRuntimePort.js";
import type {
  StudioWorkspaceRuntimeRequest,
  StudioWorkspaceRuntimeState,
  StudioWorkspaceRuntimeError,
} from "../workspaceRuntimeTypes.js";
import {
  WorkspaceRuntimeFault,
  validateWorkspaceRuntimeControl,
  workspaceRuntimeCommand,
} from "../domain/workspaceRuntime.js";
import {
  assertWorkspaceRuntimeExecution,
  workspaceRuntimeTarget,
} from "./workspaceRuntimeTarget.js";

export interface StoredWorkspaceRuntime extends Omit<StudioWorkspaceRuntimeState, "canControl"> {
  key: string;
  token: string;
  hostPid: number;
  owner: string;
  spawnPending?: boolean;
  proof?: WorkspaceRuntimeProcessProof;
}
interface ActiveRuntime {
  controller: AbortController;
  token: string;
  process?: WorkspaceRuntimeProcess;
  task: Promise<void>;
}
const KIND = "workspace-runtime";
const livePhases = new Set(["preparing", "starting", "ready", "stopping", "cleanup-required"]);

/** One app owner; database tokens fence every async observation and all window admission. */
export class StudioWorkspaceRuntime {
  private readonly active = new Map<string, ActiveRuntime>();
  private stopping = false;
  private readonly owner: string;
  constructor(
    private readonly deps: {
      db: StudioRepository;
      clock: StudioClock;
      io?: WorkspaceRuntimePort;
      host?: { id: number; alive(pid: number): boolean };
      changed(): void;
    },
  ) {
    this.owner = deps.clock.id();
  }

  async request(params: StudioWorkspaceRuntimeRequest): Promise<StudioWorkspaceRuntimeState> {
    const { db, clock, io, host } = this.deps;
    const target = workspaceRuntimeTarget(db, params.runId, params.stepId);
    const { key, saved, run } = target;
    const read = () => this.read(key, saved.path);
    const control = params.control;
    if (!control) return read();
    validateWorkspaceRuntimeControl(control);
    if (this.stopping || !io || !host) throw new WorkspaceRuntimeFault("unavailable");
    if (control.action === "stop") {
      const active = this.active.get(key);
      if (active) {
        this.write(key, active.token, { phase: "stopping", previewUrl: undefined });
        active.controller.abort();
        await active.task;
      } else if (!read().canControl) throw new WorkspaceRuntimeFault("busy");
      else if (["interrupted", "cleanup-required"].includes(read().phase))
        return this.request({ ...params, control: { action: "recover" } });
      return read();
    }
    if (control.action === "recover") {
      if (this.active.has(key)) throw new WorkspaceRuntimeFault("busy");
      const token = clock.id();
      let prior: StoredWorkspaceRuntime | undefined;
      db.transaction(() => {
        prior = db.read<StoredWorkspaceRuntime>(KIND, key);
        this.assertClaimable(key, prior, true);
        if (!prior || !livePhases.has(prior.phase)) return;
        db.write(KIND, key, {
          ...prior,
          token,
          owner: this.owner,
          hostPid: host.id,
          phase: "stopping",
          previewUrl: undefined,
          updatedAt: clock.now(),
        });
      });
      if (!prior || !livePhases.has(prior.phase)) return read();
      this.deps.changed();
      // 没有可信身份时不能把旧 PID 当成我们的进程，也不能承诺已清理。
      let cleaned = !prior.proof && !prior.spawnPending;
      try {
        if (prior.proof) cleaned = await io.recover(prior.proof);
      } catch {
        cleaned = false;
      }
      this.write(
        key,
        token,
        cleaned
          ? {
              phase: "stopped",
              proof: undefined,
              spawnPending: undefined,
              port: undefined,
              errorCode: undefined,
            }
          : { phase: "cleanup-required", errorCode: "cleanup-required" },
      );
      return read();
    }
    const token = clock.id();
    const command = control.command
      ? { executable: control.command.executable, args: [...control.command.args] }
      : undefined;
    db.transaction(() => {
      assertWorkspaceRuntimeExecution(db, run, saved, params.stepId);
      const previous = db.read<StoredWorkspaceRuntime>(KIND, key);
      this.assertClaimable(key, previous, false);
      if (control.action === "start" && !previous?.prepared)
        throw new WorkspaceRuntimeFault("setup-required");
      db.write<StoredWorkspaceRuntime>(KIND, key, {
        key,
        token,
        owner: this.owner,
        hostPid: host.id,
        workspacePath: saved.path,
        phase: control.action === "prepare" ? "preparing" : "starting",
        prepared: control.action === "start",
        updatedAt: clock.now(),
      });
    });
    const active: ActiveRuntime = {
      token,
      controller: new AbortController(),
      task: Promise.resolve(),
    };
    this.active.set(key, active);
    this.deps.changed();
    // 登记 owner 在异步工作之前，停止可以取消尚未完成的 socket/spawn 准备。
    active.task = Promise.resolve().then(() =>
      this.execute(
        key,
        saved.path,
        active,
        control.action,
        command,
        control.action === "start" ? (control.healthPath ?? "/") : "/",
        control.action === "start" ? (control.timeoutMs ?? 30_000) : 0,
      ),
    );
    return read();
  }

  private assertClaimable(
    key: string,
    previous: StoredWorkspaceRuntime | undefined,
    recovering: boolean,
  ): void {
    if (this.active.has(key)) throw new WorkspaceRuntimeFault("busy");
    if (!previous || !livePhases.has(previous.phase)) return;
    if (previous.owner === this.owner && previous.phase !== "cleanup-required")
      throw new WorkspaceRuntimeFault("busy");
    if (previous.owner !== this.owner && this.deps.host?.alive(previous.hostPid))
      throw new WorkspaceRuntimeFault("busy");
    if (!recovering) throw new WorkspaceRuntimeFault("interrupted");
  }
  private read(key: string, workspacePath: string): StudioWorkspaceRuntimeState {
    const row = this.deps.db.read<StoredWorkspaceRuntime>(KIND, key);
    if (!row)
      return {
        workspacePath,
        phase: "idle",
        prepared: false,
        updatedAt: 0,
        canControl: Boolean(this.deps.io),
      };
    const local = this.active.get(key)?.token === row.token;
    const live = livePhases.has(row.phase);
    const abandoned =
      live && !local && row.owner !== this.owner && !this.deps.host?.alive(row.hostPid);
    return {
      workspacePath: row.workspacePath,
      prepared: row.prepared,
      updatedAt: row.updatedAt,
      phase: abandoned ? "interrupted" : row.phase,
      canControl:
        Boolean(this.deps.io) && (local || row.owner === this.owner || !live || abandoned),
      ...(row.port !== undefined ? { port: row.port } : {}),
      ...(row.phase === "ready" && !abandoned && row.previewUrl
        ? { previewUrl: row.previewUrl }
        : {}),
      ...(abandoned
        ? { errorCode: "interrupted" as const }
        : row.errorCode
          ? { errorCode: row.errorCode }
          : {}),
      ...(row.exitCode !== undefined ? { exitCode: row.exitCode } : {}),
    };
  }
  private write(key: string, token: string, update: Partial<StoredWorkspaceRuntime>): void {
    this.deps.db.transaction(() => {
      const row = this.deps.db.read<StoredWorkspaceRuntime>(KIND, key);
      if (row?.token !== token) throw new WorkspaceRuntimeFault("busy");
      this.deps.db.write(KIND, key, { ...row, ...update, updatedAt: this.deps.clock.now() });
    });
    this.deps.changed();
  }
  private async execute(
    key: string,
    path: string,
    active: ActiveRuntime,
    action: "prepare" | "start",
    command: import("../workspaceRuntimeTypes.js").StudioWorkspaceRuntimeCommand | undefined,
    healthPath: string,
    timeoutMs: number,
  ): Promise<void> {
    const { io, db, clock } = this.deps;
    const { signal } = active.controller;
    let reservation: Awaited<ReturnType<WorkspaceRuntimePort["reservePort"]>> | undefined;
    let failed: StudioWorkspaceRuntimeError | undefined;
    let exitCode: number | null | undefined;
    let prepared = action === "start";
    try {
      signal.throwIfAborted();
      if (action === "start") {
        reservation = await io!.reservePort(
          db
            .list<StoredWorkspaceRuntime>(KIND, { all: true })
            .filter((row) => livePhases.has(row.phase) && row.port !== undefined)
            .map((row) => row.port!),
        );
        signal.throwIfAborted();
        // 事务内再核验跨 owner 分配；socket 仍保留到行已发布。
        db.transaction(() => {
          if (
            db
              .list<StoredWorkspaceRuntime>(KIND, { all: true })
              .some(
                (row) =>
                  row.key !== key && livePhases.has(row.phase) && row.port === reservation!.port,
              )
          )
            throw new WorkspaceRuntimeFault("port-conflict");
          const row = db.read<StoredWorkspaceRuntime>(KIND, key);
          if (row?.token !== active.token) throw new WorkspaceRuntimeFault("busy");
          db.write(KIND, key, { ...row, port: reservation!.port, updatedAt: clock.now() });
        });
        this.deps.changed();
        await reservation.release();
      }
      signal.throwIfAborted();
      if (!command) {
        prepared = true;
        return;
      }
      this.write(key, active.token, { spawnPending: true });
      active.process = await io!.spawn(
        path,
        workspaceRuntimeCommand(command, reservation?.port),
        reservation?.port,
        (proof) => this.write(key, active.token, { proof }),
      );
      this.write(key, active.token, { proof: await active.process.proof() });
      signal.throwIfAborted();
      if (action === "prepare") {
        const exit = await this.waitExit(active);
        exitCode = exit.code;
        if (!signal.aborted && exit.code !== 0) failed = "setup-failed";
        prepared = !signal.aborted && !failed;
      } else {
        const deadline = clock.now() + timeoutMs;
        let ready = false;
        while (clock.now() < deadline && active.process.alive()) {
          signal.throwIfAborted();
          if (await io!.ready(active.process, reservation!.port, healthPath)) {
            ready = true;
            break;
          }
          await clock.delay(100, signal);
        }
        signal.throwIfAborted();
        if (!ready || !active.process.alive()) {
          const exit = active.process.alive() ? undefined : await active.process.exited;
          exitCode = exit?.code;
          throw new WorkspaceRuntimeFault(exit?.conflict ? "port-conflict" : "readiness-failed");
        }
        this.write(key, active.token, {
          phase: "ready",
          proof: await active.process.proof(),
          previewUrl: `http://127.0.0.1:${reservation!.port}/`,
        });
        let missed = 0;
        while (active.process.alive()) {
          await clock.delay(1000, signal);
          signal.throwIfAborted();
          const healthy = await io!.ready(active.process, reservation!.port, healthPath);
          this.write(key, active.token, { proof: await active.process.proof() });
          if (!healthy) {
            this.write(key, active.token, { phase: "starting", previewUrl: undefined });
            if (++missed >= 3) throw new WorkspaceRuntimeFault("readiness-failed");
          } else {
            missed = 0;
            this.write(key, active.token, {
              phase: "ready",
              previewUrl: `http://127.0.0.1:${reservation!.port}/`,
            });
          }
        }
        const exit = await active.process.exited;
        exitCode = exit.code;
        failed = exit.conflict ? "port-conflict" : "process-exited";
      }
    } catch (error) {
      if (!signal.aborted)
        failed = error instanceof WorkspaceRuntimeFault ? error.code : "spawn-failed";
    } finally {
      let cleaned = failed !== "cleanup-required";
      try {
        if (active.process) cleaned = await active.process.stop();
      } catch {
        cleaned = false;
      }
      try {
        await reservation?.release();
      } catch {
        cleaned = false;
      }
      if (!cleaned && active.process) {
        try {
          this.write(key, active.token, { proof: await active.process.proof() });
        } catch {
          /* retain prior proof */
        }
      }
      this.write(key, active.token, {
        phase: !cleaned
          ? "cleanup-required"
          : signal.aborted
            ? "stopped"
            : failed
              ? "failed"
              : "prepared",
        prepared: action === "prepare" ? prepared && cleaned : prepared,
        errorCode: !cleaned ? "cleanup-required" : failed,
        previewUrl: undefined,
        ...(cleaned ? { proof: undefined, spawnPending: undefined, port: undefined } : {}),
        ...(exitCode !== undefined ? { exitCode } : {}),
      });
      if (this.active.get(key) === active) this.active.delete(key);
    }
  }
  private async waitExit(active: ActiveRuntime) {
    const signal = active.controller.signal;
    signal.throwIfAborted();
    const stopped = new Promise<{ code: null; conflict: false }>((resolve) => {
      signal.addEventListener("abort", () => resolve({ code: null, conflict: false }), {
        once: true,
      });
    });
    return Promise.race([active.process!.exited, stopped]);
  }
  async dispose(): Promise<void> {
    this.stopping = true;
    const pending = [...this.active.values()];
    for (const runtime of pending) runtime.controller.abort();
    await Promise.all(pending.map((runtime) => runtime.task));
  }
}
