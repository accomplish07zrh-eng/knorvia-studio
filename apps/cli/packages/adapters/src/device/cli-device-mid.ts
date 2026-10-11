// SPDX-License-Identifier: Apache-2.0
// CLI 设备标识：同一状态文件只初始化一次；跨进程用锁文件排他，失败回退到本次生成值。
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createUuid } from "@knorvia/shared";

const DATA_ENV = "KNORVIA_DATA_BASE_DIR";
const DIRECTORY = [".knorvia-studio", "v2"] as const;
const STATE_NAME = "telemetry-state.json";
const LOCK_NAME = "telemetry-state.lock";
const ATTEMPTS = 200;
const WAIT_MS = 10;
const EXPIRED_MS = 5 * 60 * 1000;
const FILE_ENCODING = "utf-8";

interface EnsureCliDeviceMidOptions {
  baseDir?: string;
  createId?: () => string;
  env?: Record<string, string | undefined>;
}

/** 每个状态路径只接受一次初始化；持久化失败仍复用这次请求生成的值。 */
const accepted = new Map<string, Promise<string>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasCode(value: unknown, code: string): boolean {
  return value instanceof Error && "code" in value && value.code === code;
}

async function readState(file: string): Promise<Record<string, unknown>> {
  const raw = await readFile(file, FILE_ENCODING).then(
    (text) => JSON.parse(text) as unknown,
    () => undefined,
  );
  return isRecord(raw) ? raw : {};
}

function stateDeviceMid(state: Record<string, unknown>): string | undefined {
  const value = state.deviceMid;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** 解析数据目录：`~`、`~/x`、绝对/相对路径与空串各有明确归宿。 */
function resolveDataDirectory(
  baseDir: string | undefined,
  env: Record<string, string | undefined>,
): string {
  const configured = (baseDir ?? env[DATA_ENV]?.trim() ?? homedir()) || homedir();
  if (configured === "~") return homedir();
  if (configured.startsWith("~/")) return join(homedir(), configured.slice(2));
  return resolve(configured);
}

function statePathFor(directory: string): string {
  return join(directory, ...DIRECTORY, STATE_NAME);
}

/** 同一请求内只生成一次标识；持久化失败时复用该值。 */
class IdentityRequest {
  private readonly lock: string;
  private generatedValue: string | undefined;

  constructor(
    private readonly file: string,
    private readonly createId: () => string,
  ) {
    this.lock = join(dirname(file), LOCK_NAME);
  }

  fallback(): string {
    this.generatedValue ??= this.createId();
    return this.generatedValue;
  }

  async resolve(): Promise<string> {
    const existing = stateDeviceMid(await readState(this.file));
    if (existing) return existing;
    await mkdir(dirname(this.lock), { recursive: true });
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      try {
        return await this.claim();
      } catch (error) {
        if (!hasCode(error, "EEXIST")) throw error;
        if (await this.reclaim()) continue;
        await new Promise<void>((done) => {
          setTimeout(done, WAIT_MS);
        });
      }
    }
    throw new Error("CLI telemetry state lock timeout");
  }

  private async claim(): Promise<string> {
    const handle = await open(this.lock, "wx");
    try {
      await handle.writeFile(
        JSON.stringify({ createdAt: Date.now(), pid: process.pid }),
        FILE_ENCODING,
      );
      const winner = stateDeviceMid(await readState(this.file));
      if (winner) return winner;
      const chosen = this.fallback();
      await this.publish({ ...(await readState(this.file)), deviceMid: chosen });
      return chosen;
    } finally {
      // 合同保留：close 失败时不继续 unlink，外层采用同请求的 fallback。
      await handle.close();
      await unlink(this.lock).catch(() => undefined);
    }
  }

  private async publish(state: Record<string, unknown>): Promise<void> {
    const directory = dirname(this.file);
    await mkdir(directory, { recursive: true });
    const temporary = join(
      directory,
      `.${basename(this.file)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
    );
    try {
      await writeFile(temporary, JSON.stringify(state, null, 2), FILE_ENCODING);
      await rename(temporary, this.file);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  /** 5 分钟内的锁只有在持有者进程确实不存在（或 EPERM）时才回收。 */
  private async reclaim(): Promise<boolean> {
    try {
      const lockStat = await stat(this.lock);
      if (Date.now() - lockStat.mtimeMs < EXPIRED_MS) {
        const owner = await readState(this.lock);
        if (typeof owner.pid !== "number" || typeof owner.createdAt !== "number") return false;
        if (Number.isInteger(owner.pid) && owner.pid > 0) {
          try {
            process.kill(owner.pid, 0);
            return false;
          } catch (error) {
            if (hasCode(error, "EPERM")) return false;
          }
        }
      }
      await unlink(this.lock).catch(() => undefined);
      return true;
    } catch {
      return false;
    }
  }
}

export function ensureCliDeviceMid(options: EnsureCliDeviceMidOptions = {}): Promise<string> {
  const directory = resolveDataDirectory(options.baseDir, options.env ?? process.env);
  const file = statePathFor(directory);
  const pending = accepted.get(file);
  if (pending) return pending;
  const request = new IdentityRequest(file, options.createId ?? createUuid);
  const started = request.resolve().catch(() => request.fallback());
  accepted.set(file, started);
  return started;
}
