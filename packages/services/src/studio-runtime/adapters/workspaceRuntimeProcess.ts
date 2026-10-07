// SPDX-License-Identifier: Apache-2.0
import { spawn, ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  captureProcessTreeSnapshotAsync,
  captureProcessGroupSnapshot,
  filterCurrentProcessIdentitiesAsync,
  terminateProcessTreeAndWait,
  type ProcessTreeSnapshot,
} from "../../process/processTreeTerminator.js";
import type {
  WorkspaceRuntimePort,
  WorkspaceRuntimeProcess,
  WorkspaceRuntimeProcessProof,
} from "../app/workspaceRuntimePort.js";
import { WorkspaceRuntimeFault } from "../domain/workspaceRuntime.js";
import { workspaceRuntimeEnvironment } from "../domain/workspaceRuntimeEnvironment.js";
import { safePath } from "./workspaceFiles.js";
import {
  reserveWorkspaceRuntimePort,
  workspaceRuntimeHttpReady,
  workspaceRuntimeOwnsPort,
} from "./workspaceRuntimeNetwork.js";

const token = (value: string) => createHash("sha256").update(value).digest("hex");
function proofOf(
  pid: number,
  snapshot: ProcessTreeSnapshot | undefined,
): WorkspaceRuntimeProcessProof {
  return {
    rootPid: pid,
    identities: (snapshot?.identities ?? []).map((identity) => ({
      pid: identity.pid,
      parentPid: identity.parentPid,
      ...(identity.processGroupId !== undefined ? { processGroupId: identity.processGroupId } : {}),
      startToken: token(identity.startTime),
    })),
  };
}
function processReference(pid: number, exited: boolean): ChildProcess {
  const child = new ChildProcess();
  Object.defineProperties(child, {
    pid: { value: pid },
    exitCode: { value: exited ? 0 : null },
    signalCode: { value: null },
  });
  return child;
}
export function createWorkspaceRuntimePort(): WorkspaceRuntimePort {
  return {
    reservePort: reserveWorkspaceRuntimePort,
    async spawn(path, command, port, onCreated) {
      await safePath(path);
      // 修复：集成探测确认继承宿主环境会泄露凭据；工作区只取得明确的 OS 运行变量。
      const env = workspaceRuntimeEnvironment(
        process.env,
        process.platform === "win32" ? "win32" : "posix",
        port,
      );
      const startedAt = Date.now();
      const child = spawn(command.executable, command.args, {
        cwd: path,
        env,
        shell: false,
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
      let code: number | null | undefined;
      let exitedAt: number | undefined;
      let conflict = false;
      let tail = "";
      const discard = (chunk: Buffer) => {
        // Output is consumed without logs/files; retain only the non-sensitive conflict fact.
        tail = (tail + chunk.toString()).slice(-256);
        if (/EADDRINUSE|address already in use/i.test(tail)) conflict = true;
      };
      child.stdout?.on("data", discard);
      child.stderr?.on("data", discard);
      let finish!: (value: { code: number | null; conflict: boolean }) => void;
      const exited = new Promise<{ code: number | null; conflict: boolean }>((resolve) => {
        finish = resolve;
      });
      child.once("error", () => {
        code = null;
        finish({ code: null, conflict });
      });
      child.once("exit", (value) => {
        code = value;
        exitedAt = Date.now();
        finish({ code: value, conflict });
      });
      let snapshot: ProcessTreeSnapshot | undefined;
      const options = () => ({
        // 修复：证明与清理的 ps/PowerShell/taskkill 也不得继承宿主凭据。
        helperEnvironment: env,
        ownedProcessStartedAtMs: startedAt,
        resolveOwnedProcessExitedAtMs: () => exitedAt,
        ...(process.platform !== "win32" ? { ownedProcessGroupId: child.pid } : {}),
        forceAfterMs: 300,
        waitAfterForceMs: 500,
      });
      let cleanup: Promise<boolean> | undefined;
      const refresh = async () => {
        if (!runtime.alive()) return;
        const priorRoot = snapshot?.identities.find((identity) => identity.pid === child.pid);
        const fresh = await captureProcessTreeSnapshotAsync(child, options());
        const freshRoot = fresh?.identities.find((identity) => identity.pid === child.pid);
        if (freshRoot && (!priorRoot || priorRoot.startTime === freshRoot.startTime))
          snapshot = fresh;
      };
      const runtime: WorkspaceRuntimeProcess = {
        exited,
        alive: () => code === undefined && child.exitCode === null && child.signalCode === null,
        async proof() {
          await refresh();
          return proofOf(child.pid ?? 0, snapshot);
        },
        stop() {
          if (cleanup) return cleanup;
          cleanup = (async () => {
            await refresh();
            if (process.platform !== "win32" && child.pid && !runtime.alive()) {
              const group = captureProcessGroupSnapshot(child.pid, options());
              const oldRoot = snapshot?.identities.find((identity) => identity.pid === child.pid);
              const currentRoot = group?.identities.find((identity) => identity.pid === child.pid);
              // 根先退出的命令仍可能留下同一自有 PGID 的子进程；复用的根身份不能被认领。
              if (
                group &&
                (!currentRoot || (oldRoot && currentRoot.startTime === oldRoot.startTime))
              )
                snapshot = group;
            }
            const result = await terminateProcessTreeAndWait(child, {
              ...options(),
              ...(snapshot ? { snapshot } : {}),
            });
            return result.remainingPids.length === 0;
          })();
          return cleanup;
        },
      };
      try {
        if (child.pid) onCreated({ rootPid: child.pid, identities: [] });
        await new Promise<void>((resolve, reject) => {
          child.once("spawn", resolve);
          child.once("error", () => reject(new WorkspaceRuntimeFault("spawn-failed")));
        });
        await refresh();
        return runtime;
      } catch (error) {
        if (!(await runtime.stop())) throw new WorkspaceRuntimeFault("cleanup-required");
        throw error;
      }
    },
    async ready(runtime, port, path) {
      if (!runtime.alive()) return false;
      const proof = await runtime.proof();
      return (
        runtime.alive() &&
        (await workspaceRuntimeOwnsPort(proof, port)) &&
        (await workspaceRuntimeHttpReady(port, path)) &&
        runtime.alive()
      );
    },
    async recover(proof) {
      if (!Number.isInteger(proof.rootPid) || proof.rootPid < 1 || proof.identities.length > 256)
        return false;
      const helperOptions = {
        helperEnvironment: workspaceRuntimeEnvironment(
          process.env,
          process.platform === "win32" ? "win32" : "posix",
        ),
      };
      const identities: ProcessTreeSnapshot["identities"][number][] = [];
      for (const known of proof.identities) {
        if (
          !Number.isInteger(known.pid) ||
          known.pid < 1 ||
          !/^[a-f0-9]{64}$/.test(known.startToken)
        )
          return false;
        const snapshot = await captureProcessTreeSnapshotAsync(
          processReference(known.pid, false),
          helperOptions,
        );
        const identity = snapshot?.identities.find((item) => item.pid === known.pid);
        if (
          identity &&
          token(identity.startTime) === known.startToken &&
          identity.processGroupId === known.processGroupId
        )
          identities.push(identity);
        else if (!identity) {
          try {
            process.kill(known.pid, 0);
            return false;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") return false;
          }
        }
      }
      if (!proof.identities.length) {
        try {
          process.kill(proof.rootPid, 0);
          return false;
        } catch (error) {
          return (error as NodeJS.ErrnoException).code === "ESRCH";
        }
      }
      const current = await filterCurrentProcessIdentitiesAsync(identities, helperOptions);
      if (!current.length) return true;
      const snapshot: ProcessTreeSnapshot = {
        rootPid: proof.rootPid,
        identities: current,
        descendantPids: current
          .filter((item) => item.pid !== proof.rootPid)
          .map((item) => item.pid),
      };
      const result = await terminateProcessTreeAndWait(processReference(proof.rootPid, true), {
        ...helperOptions,
        snapshot,
        forceAfterMs: 300,
        waitAfterForceMs: 500,
      });
      return result.remainingPids.length === 0;
    },
  };
}
