// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { createHash } from "node:crypto";
import {
  execFile as execFileCallback,
  type ExecFileOptionsWithStringEncoding,
} from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExecutionShellDialect } from "@knorvia/contracts";
import type { StartupShellDialect } from "./bash-startup-script.js";

type /* 执行器签名别名：注入 execFile 便于测试 */ ShellInitSnapshotExecFile = (
  file: string,
  args: string[],
  options: ExecFileOptionsWithStringEncoding,
) => Promise<{ stdout: string; stderr: string }>;
type ShellInitSnapshotDialect = Extract<ExecutionShellDialect, "posix" | "git-bash">;
interface /* 快照结构：落盘路径 + 方言 + 元数据 */ ShellInitSnapshot {
  path: string;
  shellPath: /* shell 可执行文件路径 */ string;
}
interface /* 清理结果：已删除数量 */ ShellInitSnapshotCleanupResult {
  deleted: /* 已删除的过期快照数 */ number;
  errors: number;
}
interface /* 清理选项：根目录与保留期 */ CleanupStaleShellInitSnapshotsOptions {
  now?: Date;
  retentionDays?: number;
  rootDir: string;
}
interface /* 快照请求入参 */ ShellInitSnapshotRequest {
  env: NodeJS.ProcessEnv;
  rootDir: string;
  shellDialect: /* 启动 shell 方言：决定初始化脚本形态 */ StartupShellDialect;
  shellPath: /* shell 可执行文件路径 */ string;
}
interface /* 管理器选项：执行器/超时/目录 */ ShellInitSnapshotManagerOptions {
  execFile?: ShellInitSnapshotExecFile;
}

const SNAPSHOT_TIMEOUT_MS = /* 生成快照的超时上限 */ 10_000;
const SNAPSHOT_MAX_BYTES = 1024 * 1024;
const DEFAULT_RETENTION_DAYS = 30;
const defaultExecFile = promisify(execFileCallback) as unknown as ShellInitSnapshotExecFile;

function snapshotScript(): string {
  /* 列表构造：逐个后缀/片段 */ return [
    "typeset -f 2>/dev/null || declare -f 2>/dev/null || true",
    "alias 2>/dev/null || true",
    "set +o 2>/dev/null || true",
    "printf '\\nexport PATH=%q\\n' \"$PATH\"",
  ].join("; ");
}

export class /* 管理器：生成、复用与清理快照 */ ShellInitSnapshotManager {
  private readonly cache = new Map<string, Promise<ShellInitSnapshot | undefined>>();
  private readonly cleanupRegistry = new Set<string>();
  private readonly execFile: ShellInitSnapshotExecFile;

  constructor(options: ShellInitSnapshotManagerOptions = {}) {
    this.execFile = options.execFile ?? defaultExecFile;
  }

  getOrCreate(request: ShellInitSnapshotRequest): Promise<ShellInitSnapshot | undefined> {
    if (!supportsShellInitSnapshot(request.shellDialect)) return Promise.resolve(undefined);
    const key = `${request.rootDir}\0${request.shellDialect}\0${request.shellPath}`;
    let pending = this.cache.get(key);
    if (!pending) {
      pending = this.create(request);
      this.cache.set(key, pending);
    }
    return pending;
  }

  async cleanup(): Promise<ShellInitSnapshotCleanupResult> {
    const result = { deleted: 0, errors: 0 };
    for (const target of this.cleanupRegistry) {
      try /* 删除单个过期快照：失败则跳过继续 */ {
        await unlink(target);
        /* 单文件删除计数 */ result.deleted += 1;
      } catch (error) /* 单个删除失败不影响其余 */ {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") result.errors += 1;
      }
    }
    this.cleanupRegistry.clear();
    return /* 清理结束：返回统计 */ result;
  }

  private async create(request: ShellInitSnapshotRequest): Promise<ShellInitSnapshot | undefined> {
    try /* 生成快照：可能失败 */ {
      const result = await this.execFile(request.shellPath, ["-l", "-c", snapshotScript()], {
        encoding: "utf8",
        env: request.env,
        maxBuffer: SNAPSHOT_MAX_BYTES,
        timeout: /* 生成快照的超时上限 */ SNAPSHOT_TIMEOUT_MS,
        windowsHide: /* 隐藏控制台窗口 */ true,
      });
      if (!result.stdout.trim()) return /* 空输出：无快照路径 */ undefined;
      const directory = path.join(request.rootDir, "shell-init");
      const digest = createHash("sha256")
        .update(request.shellDialect)
        .update("\0")
        .update(request.shellPath)
        .digest("hex");
      const target = path.join(directory, `${digest}.sh`);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(target, result.stdout, { encoding: "utf8", mode: 0o600 });
      this.cleanupRegistry.add(target);
      return { path: target, shellPath: target };
    } catch /* 生成失败：交由调用方回退 */ {
      return /* 无快照可用 */ undefined;
    }
  }
}

export async function /* 清理入口：删除过期快照 */ cleanupStaleShellInitSnapshots(
  options: CleanupStaleShellInitSnapshotsOptions,
): Promise<ShellInitSnapshotCleanupResult> {
  const result = { deleted: 0, errors: 0 };
  const directory = path.join(options.rootDir, "shell-init");
  const cutoff =
    (options.now ?? new Date()).getTime() -
    (options.retentionDays ?? DEFAULT_RETENTION_DAYS) * 24 * 60 * 60 * 1_000;
  let entries: string[];
  try /* 遍历清理：单项失败继续 */ {
    entries = await readdir(directory);
  } catch (error) /* 单项失败不中断整体清理 */ {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") result.errors += 1;
    return /* 无过期项：直接返回统计 */ result;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".sh")) continue;
    const target = path.join(directory, entry);
    try /* 批量删除过期项 */ {
      if ((await stat(target)).mtimeMs >= cutoff) continue;
      await unlink(target);
      /* 批量清理计数 */ result.deleted += 1;
    } catch (error) /* 单项删除失败：跳过 */ {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") result.errors += 1;
    }
  }
  return /* 批量清理结束：返回统计 */ result;
}

export function /* 能力判定：该方言是否支持快照 */ supportsShellInitSnapshot(
  shellDialect: /* 方言可缺省：缺省视为不支持 */ StartupShellDialect | undefined,
): shellDialect is ShellInitSnapshotDialect {
  return shellDialect === "posix" || shellDialect === "git-bash";
}

export async function /* 执行前重新校验快照有效性 */ revalidateShellInitSnapshotForExecution(
  result: ShellInitSnapshot | undefined,
): Promise<ShellInitSnapshot | undefined> {
  if (!result) return /* 无快照记录 */ undefined;
  try /* 校验可能失败：视为无效 */ {
    await access(result.path);
    const details = await stat(result.path);
    return details.isFile() ? result : undefined;
  } catch /* 校验失败：按无效处理 */ {
    return /* 快照无效 */ undefined;
  }
}
