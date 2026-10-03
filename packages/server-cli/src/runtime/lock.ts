import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, type FileHandle } from "node:fs/promises";
import { dirname } from "node:path";

export type DataRootLockInspection =
  | { state: "missing" }
  | { state: "active"; pid: number }
  | { state: "stale"; pid: number }
  | { state: "invalid" }
  | { state: "unreadable"; error: unknown };

type ObservedLock = { raw: string; record: { ownerToken?: string; pid?: number } };
type HeldLockFile = { handle?: FileHandle; token?: string };

const BUSY_LOCK_MESSAGE = "Another Knorvia Studio Server instance is already running";

function nativeCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function admittedPid(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function ownerReceipt(token: string): string {
  return `${JSON.stringify({ pid: process.pid, acquiredAt: Date.now(), ownerToken: token })}\n`;
}

function recoveryTurn(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 5));
}

class LockPathClaim {
  public readonly claimedPath: string;

  public constructor(
    private readonly sourcePath: string,
    reason: "stale" | "release",
  ) {
    this.claimedPath = `${sourcePath}.${reason}-${process.pid}-${randomUUID()}`;
  }

  public move(): Promise<void> {
    return rename(this.sourcePath, this.claimedPath);
  }
  public remove(): Promise<void> {
    return rm(this.claimedPath, { force: true });
  }
  public restore(): Promise<void> {
    return rename(this.claimedPath, this.sourcePath).catch(() => undefined);
  }
}

class LockPaths {
  public async observe(path: string): Promise<ObservedLock | null> {
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch {
      return null;
    }
    try {
      const value = JSON.parse(raw) as { ownerToken?: unknown; pid?: unknown };
      return {
        raw,
        record: {
          ownerToken: typeof value.ownerToken === "string" ? value.ownerToken : undefined,
          pid: admittedPid(value.pid),
        },
      };
    } catch {
      return { raw, record: {} };
    }
  }

  public async reclaimStale(path: string, expectedRaw: string): Promise<void> {
    const claim = new LockPathClaim(path, "stale");
    try {
      await claim.move();
    } catch (error) {
      if (nativeCode(error, "ENOENT")) return;
      throw error;
    }
    const actual = await readFile(claim.claimedPath, "utf8").catch(() => null);
    // 旧观察只允许删除同一份原始记录；rename 后看到后来者时必须尽力恢复。
    if (actual === expectedRaw) await claim.remove();
    else await claim.restore();
  }

  public async releaseToken(path: string, token: string): Promise<void> {
    const observed = await this.observe(path);
    if (observed?.record.ownerToken !== token) return;
    const claim = new LockPathClaim(path, "release");
    try {
      await claim.move();
    } catch {
      return;
    }
    const actual = await this.observe(claim.claimedPath);
    if (actual?.record.ownerToken === token) await claim.remove();
    else await claim.restore();
  }
}

export class DataRootLock {
  private readonly held: HeldLockFile = {};
  private readonly paths = new LockPaths();

  public constructor(private readonly path: string) {}

  public async inspect(): Promise<DataRootLockInspection> {
    let raw: string;
    try {
      raw = await readFile(this.path, "utf8");
    } catch (error) {
      return nativeCode(error, "ENOENT") ? { state: "missing" } : { state: "unreadable", error };
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return { state: "invalid" };
    }
    const pid =
      typeof value === "object" && value !== null && "pid" in value
        ? admittedPid(value.pid)
        : undefined;
    if (pid === undefined) return { state: "invalid" };
    return this.isHolderAlive(pid) ? { state: "active", pid } : { state: "stale", pid };
  }

  public isHolderAlive(pid: number | undefined): boolean {
    if (pid === undefined) return false;
    if (pid === process.pid) return true;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return nativeCode(error, "EPERM");
    }
  }

  private async abandonAttempt(path: string, attempt: HeldLockFile): Promise<void> {
    await attempt.handle?.close().catch(() => undefined);
    const observed = await this.paths.observe(path);
    if (observed?.record.ownerToken === attempt.token)
      await this.paths.releaseToken(path, attempt.token!);
  }

  private async acquireFile(): Promise<boolean> {
    const attempt: HeldLockFile = { token: randomUUID() };
    try {
      attempt.handle = await open(this.path, "wx", 0o600);
      await attempt.handle.writeFile(ownerReceipt(attempt.token!));
      this.held.handle = attempt.handle;
      this.held.token = attempt.token;
      return true;
    } catch (error) {
      if (nativeCode(error, "EEXIST")) return false;
      await this.abandonAttempt(this.path, attempt);
      throw error;
    }
  }

  private async acquireGate(path: string): Promise<string | null> {
    const attempt: HeldLockFile = { token: randomUUID() };
    try {
      attempt.handle = await open(path, "wx", 0o600);
      await attempt.handle.writeFile(ownerReceipt(attempt.token!));
      await attempt.handle.close();
      return attempt.token!;
    } catch (error) {
      if (!nativeCode(error, "EEXIST")) {
        await this.abandonAttempt(path, attempt);
        throw error;
      }
    } finally {
      await attempt.handle?.close().catch(() => undefined);
    }
    const observed = await this.paths.observe(path);
    if (observed && !this.isHolderAlive(observed.record.pid))
      await this.paths.reclaimStale(path, observed.raw);
    return null;
  }

  public async acquire(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    if (await this.acquireFile()) return;
    const gatePath = `${this.path}.recovery`;
    for (let remaining = 100; remaining > 0; remaining--) {
      const observed = await this.paths.observe(this.path);
      if (observed && this.isHolderAlive(observed.record.pid)) throw new Error(BUSY_LOCK_MESSAGE);
      const gate = await this.acquireGate(gatePath);
      if (!gate) {
        await recoveryTurn();
        continue;
      }
      try {
        const current = await this.paths.observe(this.path);
        if (current && this.isHolderAlive(current.record.pid)) throw new Error(BUSY_LOCK_MESSAGE);
        if (current) await this.paths.reclaimStale(this.path, current.raw);
        if (await this.acquireFile()) return;
      } finally {
        await this.paths.releaseToken(gatePath, gate);
      }
      await recoveryTurn();
    }
    throw new Error(BUSY_LOCK_MESSAGE);
  }

  public async release(): Promise<void> {
    await this.held.handle?.close().catch(() => undefined);
    this.held.handle = undefined;
    // close 等待期间可能更换持有者；按现有 API 的顺序读取并清除当前 token，而非入口快照。
    const token = this.held.token;
    this.held.token = undefined;
    if (token) await this.paths.releaseToken(this.path, token);
  }
}
