// SPDX-License-Identifier: Apache-2.0
// 匿名设备标识的读写。
//
// 它不是身份，只是把同一个安装的遥测串起来；因此任何失败都只意味着「本次缺一个匿名关联」，
// 绝不影响主链路。并发形状：同一状态文件在进程内单飞，跨进程靠锁文件互斥。
//
// 所有可能抛错的 IO 都经 `bestEffort` 折成 undefined，业务代码里因此没有散落的 try/catch。
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveKnorviaDataRoot } from "@knorvia/shared/node";
import type { EnvRecord } from "./env-record.js";
import { bestEffort } from "./gates.js";

/** 状态目录段与两个文件名。 */
const STATE_DIR = "v2";
const STATE_FILE = "telemetry-state.json";
const LOCK_FILE = "telemetry-state.lock";
/** 锁过期时长与抢锁次数。 */
const LOCK_STALE_MS = 5 * 60_000;
const LOCK_ATTEMPTS = 2;
/** 设备标识的环境键。 */
export const DEVICE_MID_ENV = "KNORVIA_TELEMETRY_DEVICE_MID";
/** 安装标识的合法形态：有界字符集，避免把任意字符串当 ID 打进资源属性。 */
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;

/** 同一状态文件的进行中解析：进程内单飞。 */
const inFlight = new Map<string, Promise<string | undefined>>();

/** 安装标识归一：去空白后必须整串合法，否则视为没有。 */
export function normalizeInstallationId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && ID_PATTERN.test(trimmed) ? trimmed : undefined;
}

/** 从环境记录里取已有的安装标识。 */
export function installationIdFromEnv(env: EnvRecord): string | undefined {
  return normalizeInstallationId(env[DEVICE_MID_ENV]);
}

/** 状态文件路径：`<KNORVIA_HOME>/v2/...`，未给 home 时跟随数据根。 */
export function statePath(knorviaHome: string | undefined): string {
  return join(knorviaHome?.trim() || resolveKnorviaDataRoot(), STATE_DIR, STATE_FILE);
}

/** 读出现有安装标识，缺失时生成并落盘；失败只意味着没有匿名关联。 */
export async function resolveInstallationId(
  knorviaHome: string | undefined,
): Promise<string | undefined> {
  const file = statePath(knorviaHome);
  const pending = inFlight.get(file);
  if (pending) return pending;
  const resolution = ensureInstallation(file);
  inFlight.set(file, resolution);
  try {
    return await resolution;
  } finally {
    if (inFlight.get(file) === resolution) inFlight.delete(file);
  }
}

async function ensureInstallation(file: string): Promise<string | undefined> {
  const existing = await readInstallationId(file);
  if (existing !== undefined) return existing;
  return (await bestEffort(() => withLock(file, () => createInstallation(file)))) ?? undefined;
}

async function createInstallation(file: string): Promise<string> {
  const present = await readInstallationId(file);
  if (present !== undefined) return present;
  const created = randomUUID();
  await writeAtomically(file, { ...(await readState(file)), deviceMid: created });
  return created;
}

/**
 * 锁协议：`wx` 独占打开。冲突时判断持有者是否已死或锁是否超时：
 * 可回收就删掉再来一次，否则读现有值收工（不排队）。
 */
async function withLock(file: string, run: () => Promise<string>): Promise<string | undefined> {
  const lockFile = join(dirname(file), LOCK_FILE);
  await bestEffort(() => mkdir(dirname(file), { recursive: true }));
  for (let round = 0; round < LOCK_ATTEMPTS; round += 1) {
    const handle = await bestEffort(() => open(lockFile, "wx"));
    if (handle === undefined) {
      if (!(await reclaimLock(lockFile))) return readInstallationId(file);
      continue;
    }
    await bestEffort(() =>
      handle.writeFile(JSON.stringify({ createdAt: Date.now(), pid: process.pid }), "utf8"),
    );
    try {
      return await run();
    } finally {
      await bestEffort(() => handle.close());
      await bestEffort(() => unlink(lockFile));
    }
  }
  return readInstallationId(file);
}

/** 过期判定：锁龄超限，或持有进程已不存在。任一成立即可回收。 */
async function reclaimLock(lockFile: string): Promise<boolean> {
  const metadata = await bestEffort(() => stat(lockFile));
  if (metadata === undefined) return false;
  if (Date.now() - metadata.mtimeMs < LOCK_STALE_MS) {
    const owner = await readState(lockFile);
    const pid = Number.isInteger(owner.pid) ? (owner.pid as number) : undefined;
    if (pid === undefined || isAlive(pid)) return false;
  }
  await bestEffort(() => unlink(lockFile));
  return true;
}

/** 进程存活探测：`kill(pid, 0)` 成功即活着；ESRCH 表示已退出。 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch (error) {
    return !(error instanceof Error && (error as NodeJS.ErrnoException).code === "ESRCH");
  }
  return true;
}

/** 状态文件 → 对象；损坏、非对象或不可读都按空记录处理。 */
async function readState(file: string): Promise<Record<string, unknown>> {
  const raw = await bestEffort(() => readFile(file, "utf8"));
  if (raw === undefined) return {};
  const parsed = await bestEffort(async () => JSON.parse(raw) as unknown);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

async function readInstallationId(file: string): Promise<string | undefined> {
  const value = (await readState(file)).deviceMid;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** 临时文件 + rename，避免半写状态被下一个进程读到。 */
async function writeAtomically(file: string, state: Record<string, unknown>): Promise<void> {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2), "utf8");
  await rename(temporary, file);
}
