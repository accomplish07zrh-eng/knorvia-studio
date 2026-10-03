import { createUuid } from "@knorvia/shared";
import { mkdir, open, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAppConfigDir } from "../paths.js";

export interface EnsureDeviceMidOptions {
  homeDir?: string;
  randomUUID?: () => string;
}

type DeviceState = { deviceMid?: string };
type LockOwner = { pid: number; createdAt: number };

const deviceMidByStateFile = new Map<string, Promise<string>>();
const lockLifetimeMs = 300_000;
const lockAttempts = 200;
const lockRetryMs = 10;

function stateDirectory(homeDir?: string): string {
  return homeDir ? join(homeDir, ".knorvia-studio", "v2") : getAppConfigDir();
}

function stateFile(homeDir?: string): string {
  return join(stateDirectory(homeDir), "telemetry-state.json");
}

function lockFile(homeDir?: string): string {
  return join(stateDirectory(homeDir), "telemetry-state.lock");
}

async function readDeviceState(homeDir?: string): Promise<DeviceState> {
  try {
    const parsed: unknown = JSON.parse(await readFile(stateFile(homeDir), "utf-8"));
    return parsed && typeof parsed === "object" ? (parsed as DeviceState) : {};
  } catch {
    return {};
  }
}

async function writeDeviceState(state: DeviceState, homeDir?: string): Promise<void> {
  const file = stateFile(homeDir);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(state, null, 2), "utf-8");
}

function remember(file: string, mid: string): string {
  deviceMidByStateFile.set(file, Promise.resolve(mid));
  return mid;
}

export async function ensureDeviceMidInLockedState(
  state: DeviceState,
  options: EnsureDeviceMidOptions,
): Promise<string> {
  const file = stateFile(options.homeDir);
  if (state.deviceMid) {
    return remember(file, state.deviceMid);
  }

  const generate = options.randomUUID ?? createUuid;
  const mid = generate();
  state.deviceMid = mid;
  await writeDeviceState(state, options.homeDir);
  return remember(file, mid);
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code !== "ESRCH";
  }
}

async function readLockOwner(file: string): Promise<LockOwner | null> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf-8")) as LockOwner;
    if (
      typeof parsed.pid === "number" &&
      Number.isInteger(parsed.pid) &&
      parsed.pid > 0 &&
      typeof parsed.createdAt === "number" &&
      Number.isFinite(parsed.createdAt)
    ) {
      return { pid: parsed.pid, createdAt: parsed.createdAt };
    }
    return null;
  } catch {
    return null;
  }
}

async function removeStaleLock(file: string, timestamp: number): Promise<boolean> {
  try {
    const metadata = await stat(file);
    if (timestamp - metadata.mtimeMs < lockLifetimeMs) {
      const owner = await readLockOwner(file);
      if (!owner || processIsAlive(owner.pid)) {
        return false;
      }
    }
    await unlink(file).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

async function withDeviceStateLock(
  homeDir: string | undefined,
  run: (state: DeviceState) => Promise<string>,
): Promise<string> {
  const file = lockFile(homeDir);
  await mkdir(dirname(file), { recursive: true });

  for (let attempt = 0; attempt < lockAttempts; attempt += 1) {
    try {
      const handle = await open(file, "wx");
      try {
        await handle.writeFile(
          JSON.stringify({ pid: process.pid, createdAt: Date.now() }),
          "utf-8",
        );
        const state = await readDeviceState(homeDir);
        return await run(state);
      } finally {
        await handle.close();
        await unlink(file).catch(() => {});
      }
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
        throw error;
      }
      if (await removeStaleLock(file, Date.now())) {
        continue;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, lockRetryMs));
    }
  }

  throw new Error("Device state lock timeout");
}

export function ensureDeviceMid(options: EnsureDeviceMidOptions = {}): Promise<string> {
  const file = stateFile(options.homeDir);
  const cached = deviceMidByStateFile.get(file);
  if (cached) {
    return cached;
  }

  const pending = withDeviceStateLock(options.homeDir, async (state) =>
    ensureDeviceMidInLockedState(state, options),
  ).catch((error: unknown) => {
    if (deviceMidByStateFile.get(file) === pending) {
      deviceMidByStateFile.delete(file);
    }
    throw error;
  });
  deviceMidByStateFile.set(file, pending);
  return pending;
}
