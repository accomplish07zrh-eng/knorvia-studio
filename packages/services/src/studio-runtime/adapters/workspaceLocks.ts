import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { absent, digest, exclusiveWrite, safeDirectory, safePath } from "./workspaceFiles.js";

export interface WorkspaceLockOwner {
  version: 1;
  pid: number;
  token: string;
}
const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** EPERM and every unknown result are deliberately not evidence of a dead owner. */
export function workspaceProcessState(pid: number): "alive" | "dead" | "unknown" {
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH" ? "dead" : "unknown";
  }
}

async function readOwner(path: string): Promise<WorkspaceLockOwner | null> {
  await safePath(path);
  const stat = await fs.lstat(path).catch((error) => {
    if (absent(error)) return null;
    throw error;
  });
  if (!stat) return null;
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > 4096)
    throw new Error(`Unrecognized workspace lock; its owner cannot be verified: ${path}`);
  const text = await fs.readFile(path, "utf8").catch((error) => {
    if (absent(error)) return null;
    throw error;
  });
  if (text === null) return null;
  let owner: WorkspaceLockOwner;
  try {
    owner = JSON.parse(text) as WorkspaceLockOwner;
  } catch (cause) {
    throw new Error(`Unrecognized workspace lock; its owner cannot be verified: ${path}`, {
      cause,
    });
  }
  if (
    !owner ||
    owner.version !== 1 ||
    !Number.isSafeInteger(owner.pid) ||
    owner.pid < 1 ||
    !tokenPattern.test(owner.token)
  )
    throw new Error(`Unrecognized workspace lock; its owner cannot be verified: ${path}`);
  return owner;
}

/**
 * Immutable, uniquely named claims avoid a stale-owner unlink deleting a newer lock.
 * Every contender publishes before scanning: overlapping contenders either see the
 * earlier claim or both withdraw. There is no retry loop or live-owner takeover.
 */
export async function withWorkspaceLock<T>(
  storage: string,
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const directory = join(storage, "workspace-locks");
  await safeDirectory(directory);
  const prefix = digest(key);
  const legacy = join(directory, prefix);
  await safePath(legacy);
  if (
    await fs.lstat(legacy).catch((error) => {
      if (absent(error)) return null;
      throw error;
    })
  )
    throw new Error(
      `Legacy workspace lock has no verifiable process owner; preserved for review: ${legacy}`,
    );
  const owner: WorkspaceLockOwner = { version: 1, pid: process.pid, token: randomUUID() };
  const path = join(directory, `${prefix}.${owner.pid}.${owner.token}.json`);
  const pending = `${path}.pending`;
  await exclusiveWrite(pending, JSON.stringify(owner));
  await safePath(path);
  await fs.rename(pending, path);
  try {
    const entries = await fs.readdir(directory);
    if (entries.length > 20_000)
      throw new Error("Workspace lock storage exceeds its inspection limit.");
    for (const name of entries) {
      if (
        !name.startsWith(`${prefix}.`) ||
        !name.endsWith(".json") ||
        join(directory, name) === path
      )
        continue;
      const competingPath = join(directory, name);
      const competing = await readOwner(competingPath);
      if (!competing) continue;
      if (name !== `${prefix}.${competing.pid}.${competing.token}.json`)
        throw new Error(`Workspace lock identity does not match its record: ${competingPath}`);
      const state = workspaceProcessState(competing.pid);
      if (state !== "dead")
        throw new Error(
          `Workspace is busy; process ${competing.pid} is ${state}. Lock preserved: ${competingPath}`,
        );
      // This immutable filename belongs only to the confirmed-dead pid/token.
      await fs.unlink(competingPath).catch((error) => {
        if (!absent(error)) throw error;
      });
    }
    return await operation();
  } finally {
    const actual = await readOwner(path);
    if (actual?.pid === owner.pid && actual.token === owner.token) await fs.unlink(path);
  }
}
