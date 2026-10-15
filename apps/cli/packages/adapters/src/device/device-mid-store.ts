// SPDX-License-Identifier: Apache-2.0
// 设备标识存储：读状态 → 抢锁 → 二次确认 → 原子发布；失败回退到本次生成值。
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const STATE_FILE = "telemetry-state.json";
const LOCK_FILE = "telemetry-state.lock";
const LOCK_ATTEMPTS = 200;
const LOCK_WAIT_MS = 10;
const LOCK_STALE_MS = 5 * 60 * 1000;
const ENCODING = "utf-8";

type StateRecord = Record<string, unknown>;

interface DeviceMidRequest {
  createId: () => string;
  file: string;
  lock: string;
}

/** 读状态：文件缺失、非法 JSON、非对象都归一成空对象。 */
async function readState(file: string): Promise<StateRecord> {
  const text = await readFile(file, ENCODING).catch(() => undefined);
  if (text === undefined) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return {};
  }
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as StateRecord)
    : {};
}

function deviceMidOf(state: StateRecord): string | undefined {
  const stored = state.deviceMid;
  if (typeof stored !== "string") return undefined;
  return stored.length > 0 ? stored : undefined;
}

/** 毫秒等待：抢锁失败后的退避，不忙等。 */
function pause(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && (error as { code?: unknown }).code === code;
}

/** 临时文件名：隐藏文件 + pid + 时间戳 + 随机后缀，保证同目录 rename 原子。 */
function stagingPath(file: string): string {
  const suffix = Math.random().toString(16).slice(2);
  return join(dirname(file), `.${basename(file)}.${process.pid}.${Date.now()}.${suffix}.tmp`);
}

/** 同目录临时文件 + rename：读取方永远看不到半截 JSON。 */
async function publishState(file: string, state: StateRecord): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const staging = stagingPath(file);
  try {
    await writeFile(staging, JSON.stringify(state, null, 2), ENCODING);
    await rename(staging, file);
  } catch (error) {
    await unlink(staging).catch(() => undefined);
    throw error;
  }
}

/** 5 分钟内的锁只有在持有者进程确实不存在（或 EPERM）时才回收。 */
async function reclaimLock(lock: string): Promise<boolean> {
  try {
    const lockStat = await stat(lock);
    if (Date.now() - lockStat.mtimeMs < LOCK_STALE_MS) {
      const holder = await readState(lock);
      if (typeof holder.pid !== "number" || typeof holder.createdAt !== "number") return false;
      if (Number.isInteger(holder.pid) && holder.pid > 0) {
        const alive = (): boolean => {
          try {
            process.kill(holder.pid as number, 0);
            return true;
          } catch (error) {
            return hasErrorCode(error, "EPERM");
          }
        };
        if (alive()) return false;
      }
    }
    await unlink(lock).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

/** 一次抢锁：写入持有者信息 → 二次读状态 → 决定复用还是发布新值。 */
async function claimLocked(request: DeviceMidRequest, generate: () => string): Promise<string> {
  const handle = await open(request.lock, "wx");
  try {
    await handle.writeFile(JSON.stringify({ createdAt: Date.now(), pid: process.pid }), ENCODING);
    // 锁下只读一次：复用与发布共用同一份快照，不二次读盘。
    const state = await readState(request.file);
    const existing = deviceMidOf(state);
    if (existing) return existing;
    const assigned = generate();
    await publishState(request.file, { ...state, deviceMid: assigned });
    return assigned;
  } finally {
    // 合同保留：close 失败时不继续 unlink，外层采用同请求的 fallback。
    await handle.close();
    await unlink(request.lock).catch(() => undefined);
  }
}

/** 抢锁循环：EEXIST 时回收或等待；用尽预算抛锁超时。 */
async function resolveWithLock(request: DeviceMidRequest, generate: () => string): Promise<string> {
  await mkdir(dirname(request.lock), { recursive: true });
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      return await claimLocked(request, generate);
    } catch (error) {
      if (!hasErrorCode(error, "EEXIST")) throw error;
      if (await reclaimLock(request.lock)) continue;
      await pause(LOCK_WAIT_MS);
    }
  }
  throw new Error("CLI telemetry state lock timeout");
}

/** 一个状态文件对应一个请求对象：生成值在请求内只算一次（成功落盘与失败回退共用）。 */
export function createDeviceMidRequest(request: DeviceMidRequest): {
  fallback: () => string;
  resolve: () => Promise<string>;
} {
  let generated: string | undefined;
  const fallback = (): string => {
    generated ??= request.createId();
    return generated;
  };
  return {
    fallback,
    resolve: async () => {
      const existing = deviceMidOf(await readState(request.file));
      if (existing) return existing;
      return await resolveWithLock(request, fallback);
    },
  };
}

export { LOCK_FILE, STATE_FILE };
