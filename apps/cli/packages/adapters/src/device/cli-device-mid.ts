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
interface EnsureCliDeviceMidOptions {
  baseDir?: string;
  createId?: () => string;
  env?: Record<string, string | undefined>;
}
const requests = new Map<string, Promise<string>>();

/** 每个 state 路径只接受一次初始化；持久化失败仍复用这次请求的生成值。 */
export function ensureCliDeviceMid(options: EnsureCliDeviceMidOptions = {}): Promise<string> {
  const configured = options.baseDir ?? (options.env ?? process.env)[DATA_ENV]?.trim() ?? homedir();
  const base = configured.length ? configured : homedir();
  const directory =
    base === "~"
      ? homedir()
      : base.startsWith("~/")
        ? join(homedir(), base.slice(2))
        : resolve(base);
  const file = join(directory, ...DIRECTORY, STATE_NAME);
  const accepted = requests.get(file);
  if (accepted) return accepted;
  const owner = new IdentityRequest(file, options.createId ?? createUuid);
  const pending = owner.initialize().catch(() => owner.generated());
  requests.set(file, pending);
  return pending;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function nodeCode(value: unknown, code: string): boolean {
  return value instanceof Error && "code" in value && value.code === code;
}
async function snapshot(file: string): Promise<Record<string, unknown>> {
  try {
    const value: unknown = JSON.parse(await readFile(file, "utf-8"));
    return record(value) ? value : {};
  } catch {
    return {};
  }
}
function identity(state: Record<string, unknown>): string | undefined {
  const value = state.deviceMid;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

class IdentityRequest {
  private value: string | undefined;
  private readonly lock: string;
  constructor(
    private readonly file: string,
    private readonly create: () => string,
  ) {
    this.lock = join(dirname(file), LOCK_NAME);
  }
  generated(): string {
    this.value ??= this.create();
    return this.value;
  }
  async initialize(): Promise<string> {
    const first = identity(await snapshot(this.file));
    if (first) return first;
    await mkdir(dirname(this.lock), { recursive: true });
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      try {
        return await this.exclusive();
      } catch (error) {
        if (!nodeCode(error, "EEXIST")) throw error;
        if (await this.reclaim()) continue;
        await new Promise<void>((done) => {
          setTimeout(done, WAIT_MS);
        });
      }
    }
    throw new Error("CLI telemetry state lock timeout");
  }
  private async exclusive(): Promise<string> {
    const handle = await open(this.lock, "wx");
    try {
      await handle.writeFile(JSON.stringify({ createdAt: Date.now(), pid: process.pid }), "utf-8");
      const state = await snapshot(this.file);
      const winner = identity(state);
      if (winner) return winner;
      const chosen = this.generated();
      state.deviceMid = chosen;
      await this.publish(state);
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
      await writeFile(temporary, JSON.stringify(state, null, 2), "utf-8");
      await rename(temporary, this.file);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }
  private async reclaim(): Promise<boolean> {
    try {
      const age = Date.now() - (await stat(this.lock)).mtimeMs;
      if (age < EXPIRED_MS) {
        const owner = await snapshot(this.lock);
        if (typeof owner.pid !== "number" || typeof owner.createdAt !== "number") return false;
        if (Number.isInteger(owner.pid) && owner.pid > 0) {
          try {
            process.kill(owner.pid, 0);
            return false;
          } catch (error) {
            if (nodeCode(error, "EPERM")) return false;
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
