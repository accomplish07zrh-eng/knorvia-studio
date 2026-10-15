// SPDX-License-Identifier: Apache-2.0
// CLI 设备标识入口：解析数据目录 + 进程内单飞 + 回退到本次生成值。
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createUuid } from "@knorvia/shared";
import { createDeviceMidRequest, LOCK_FILE, STATE_FILE } from "./device-mid-store.js";

/** 数据根覆盖变量：与既有实现一致，指向 .knorvia-studio 的父目录。 */
const DATA_ENV = "KNORVIA_DATA_BASE_DIR";
const DIRECTORY = [".knorvia-studio", "v2"] as const;
const HOME_ONLY = "~";
const HOME_PREFIX = "~/";

interface EnsureCliDeviceMidOptions {
  baseDir?: string;
  createId?: () => string;
  env?: Record<string, string | undefined>;
}

/** 进程内单飞表：键是状态文件绝对路径，值是那次初始化（成功或回退）的 Promise。 */
/** 同一状态路径只初始化一次；持久化失败仍复用这次请求生成的值。 */
const inFlight = new Map<string, Promise<string>>();

/** 解析数据目录：`~`、`~/x`、绝对/相对路径与空串各有明确归宿。 */
function resolveDataDirectory(
  baseDir: string | undefined,
  env: Record<string, string | undefined>,
): string {
  const configured = (baseDir ?? env[DATA_ENV]?.trim() ?? homedir()) || homedir();
  if (configured === HOME_ONLY) return homedir();
  const underHome = configured.startsWith(HOME_PREFIX)
    ? configured.slice(HOME_PREFIX.length)
    : undefined;
  return underHome === undefined ? resolve(configured) : join(homedir(), underHome);
}

/** 数据目录下的状态文件与锁文件同目录，锁文件由存储层独占创建。 */
function pathsFor(directory: string): { file: string; lock: string } {
  const stateDirectory = join(directory, ...DIRECTORY);
  return { file: join(stateDirectory, STATE_FILE), lock: join(stateDirectory, LOCK_FILE) };
}

export function ensureCliDeviceMid(options: EnsureCliDeviceMidOptions = {}): Promise<string> {
  const directory = resolveDataDirectory(options.baseDir, options.env ?? process.env);
  const { file, lock } = pathsFor(directory);
  const existing = inFlight.get(file);
  if (existing) return existing;

  const request = createDeviceMidRequest({ createId: options.createId ?? createUuid, file, lock });
  const attempt = request.resolve().catch(() => request.fallback());
  inFlight.set(file, attempt);
  return attempt;
}
