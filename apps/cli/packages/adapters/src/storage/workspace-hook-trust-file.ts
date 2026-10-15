// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { chmod, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { workspaceHookTrustStoreFileSchema } from "@knorvia/contracts";
import type { WorkspaceHookTrustStoreFile } from "@knorvia/contracts";
import type {
  FileWorkspaceHookTrustStoreOptions,
  WorkspaceHookTrustStoreLoadResult,
} from "./workspace-hook-trust-types.js";

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const DEFAULT_RENAME_DELAYS_MS = [50, 100, 200, 400, 800] as const;
const RETRYABLE_RENAME_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);
const JSON_INDENT = 2;

/** 发布相关选项：只取与「临时文件 → 目标」这一步有关的注入点。 */
export type TrustPublishOptions = Pick<
  FileWorkspaceHookTrustStoreOptions,
  "beforeRename" | "renameFile" | "renameRetryDelaysMs"
>;

interface RenamePlan {
  delays: readonly number[];
  renameFile: typeof rename;
}

function isMissing(cause: unknown): boolean {
  return cause instanceof Error && "code" in cause && cause.code === "ENOENT";
}

/** Windows 上 rename 可能被短暂占用：只对这几个 code 重试。 */
function isRetryableRename(cause: unknown): boolean {
  if (!(cause instanceof Error) || !("code" in cause)) return false;
  return typeof cause.code === "string" && RETRYABLE_RENAME_CODES.has(cause.code);
}

function renamePlan(options: TrustPublishOptions): RenamePlan {
  return {
    delays: options.renameRetryDelaysMs ?? DEFAULT_RENAME_DELAYS_MS,
    renameFile: options.renameFile ?? rename,
  };
}

export async function prepareTrustDirectory(target: string): Promise<void> {
  const directory = dirname(target);
  await mkdir(directory, { recursive: true, mode: DIRECTORY_MODE });
  await chmod(directory, DIRECTORY_MODE);
}

/** 损坏文件隔离：改名到 `.corrupt-<now>` 并收紧权限；隔离失败不承诺备份存在。 */
async function quarantine(target: string, now: () => number): Promise<string> {
  const recoveredCorruptPath = `${target}.corrupt-${now()}`;
  try {
    await rename(target, recoveredCorruptPath);
    await chmod(recoveredCorruptPath, FILE_MODE);
  } catch {
    /* 隔离路径可观察，但隔离失败时不承诺备份存在。 */
  }
  return recoveredCorruptPath;
}

export async function readTrustFile(
  target: string,
  now: () => number,
): Promise<WorkspaceHookTrustStoreLoadResult> {
  let raw: string;
  try {
    raw = await readFile(target, "utf8");
  } catch (cause) {
    if (isMissing(cause)) return { status: "missing", records: [] };
    throw cause;
  }

  let parsed: WorkspaceHookTrustStoreFile;
  try {
    parsed = workspaceHookTrustStoreFileSchema.parse(JSON.parse(raw));
  } catch {
    return { status: "corrupt", records: [], recoveredCorruptPath: await quarantine(target, now) };
  }

  try {
    await chmod(target, FILE_MODE);
  } catch {
    /* 已验证的读取结果不受此权限修正影响。 */
  }
  return { status: "ok", records: parsed.records };
}

/** 重试发布：按 delays 逐档退避；槽位为空即表示不再等待（不得退回默认延迟）。 */
async function renameWithRetry(source: string, target: string, plan: RenamePlan): Promise<void> {
  for (let round = 0; ; round += 1) {
    try {
      await plan.renameFile(source, target);
      return;
    } catch (cause) {
      if (!isRetryableRename(cause)) throw cause;
      const pause = plan.delays[round];
      if (pause === undefined) throw cause;
      await delay(pause);
    }
  }
}

/** 同目录临时名：前缀点号隐藏，尾部 pid/时间/随机数避免并发相撞。 */
function stagingName(target: string): string {
  const unique = Math.random().toString(16).slice(2);
  return join(dirname(target), `.${basename(target)}.${process.pid}.${Date.now()}.${unique}.tmp`);
}

/** 失败清理：先关句柄再删自己创建的临时文件，两者都不覆盖原始错因。 */
async function discardStaging(
  io: FileHandle | undefined,
  staged: string | undefined,
): Promise<void> {
  if (io !== undefined) {
    try {
      await io.close();
    } catch {
      /* 保留写入或关闭的原始失败。 */
    }
  }
  if (staged === undefined) return;
  try {
    await unlink(staged);
  } catch {
    /* 仅清理自己创建的临时路径。 */
  }
}

export async function writeTrustFile(
  target: string,
  file: WorkspaceHookTrustStoreFile,
  options: TrustPublishOptions,
): Promise<void> {
  const staging = stagingName(target);
  let io: FileHandle | undefined;
  let staged = false;
  try {
    io = await open(staging, "wx", FILE_MODE);
    staged = true;
    await io.writeFile(`${JSON.stringify(file, null, JSON_INDENT)}\n`, "utf8");
    await io.sync();
    await io.close();
    io = undefined;
    await options.beforeRename?.();
    await renameWithRetry(staging, target, renamePlan(options));
    await chmod(target, FILE_MODE);
  } catch (cause) {
    await discardStaging(io, staged ? staging : undefined);
    // 发布后的 chmod 失败仍拒绝：目标可能已是新字节，不能撤销为成功。
    throw cause;
  }
}
