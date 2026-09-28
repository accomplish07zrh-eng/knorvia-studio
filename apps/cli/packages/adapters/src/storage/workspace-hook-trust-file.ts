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

export type TrustPublishOptions = Pick<
  FileWorkspaceHookTrustStoreOptions,
  "beforeRename" | "renameFile" | "renameRetryDelaysMs"
>;

export async function prepareTrustDirectory(path: string): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: DIRECTORY_MODE });
  await chmod(directory, DIRECTORY_MODE);
}

export async function readTrustFile(
  path: string,
  now: () => number,
): Promise<WorkspaceHookTrustStoreLoadResult> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { status: "missing", records: [] };
    }
    throw error;
  }
  let file: WorkspaceHookTrustStoreFile;
  try {
    file = workspaceHookTrustStoreFileSchema.parse(JSON.parse(content));
  } catch {
    const recoveredCorruptPath = `${path}.corrupt-${now()}`;
    try {
      await rename(path, recoveredCorruptPath);
      await chmod(recoveredCorruptPath, FILE_MODE);
    } catch {
      /* 隔离路径可观察，但隔离失败时不承诺备份存在。 */
    }
    return { status: "corrupt", records: [], recoveredCorruptPath };
  }
  try {
    await chmod(path, FILE_MODE);
  } catch {
    /* 已验证的读取结果不受此权限修正影响。 */
  }
  return { status: "ok", records: file.records };
}

async function publishRename(
  temporaryPath: string,
  path: string,
  options: TrustPublishOptions,
): Promise<void> {
  const renameFile = options.renameFile ?? rename;
  const delays = options.renameRetryDelaysMs ?? DEFAULT_RENAME_DELAYS_MS;
  for (let attempt = 0; ; attempt++) {
    try {
      await renameFile(temporaryPath, path);
      return;
    } catch (error) {
      const retryable =
        error instanceof Error &&
        "code" in error &&
        typeof error.code === "string" &&
        RETRYABLE_RENAME_CODES.has(error.code);
      if (!retryable) throw error;
      const wait = delays[attempt];
      // 空槽和 undefined 都表示没有下一次等待，不能变成默认延迟继续重试。
      if (wait === undefined) throw error;
      await delay(wait);
    }
  }
}

export async function writeTrustFile(
  path: string,
  file: WorkspaceHookTrustStoreFile,
  options: TrustPublishOptions,
): Promise<void> {
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  let handle: FileHandle | undefined;
  let created = false;
  try {
    handle = await open(temporaryPath, "wx", FILE_MODE);
    created = true;
    await handle.writeFile(`${JSON.stringify(file, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await options.beforeRename?.();
    await publishRename(temporaryPath, path, options);
    await chmod(path, FILE_MODE);
  } catch (error) {
    if (handle) {
      try {
        await handle.close();
      } catch {
        /* 保留写入或关闭的原始失败。 */
      }
    }
    if (created) {
      try {
        await unlink(temporaryPath);
      } catch {
        /* 仅清理自己创建的临时路径。 */
      }
    }
    // 发布后的 chmod 失败仍拒绝；此时目标可能已经是新字节，不能撤销为成功。
    throw error;
  }
}
