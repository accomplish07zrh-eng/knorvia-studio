import { DataRootLock, type DataRootLockInspection } from "./lock.js";
import type { ServerLayout } from "./paths.js";
import { readPersistedStatusDetailed } from "./statusSnapshot.js";
import { describeLockInspection } from "./uninstallGuard.js";

function confirmsShutdown(
  snapshot: Awaited<ReturnType<typeof readPersistedStatusDetailed>>,
  lock: DataRootLockInspection,
  minUpdatedAt: number,
  requireFreshSnapshot: boolean,
): boolean {
  const released = lock.state === "missing" || lock.state === "stale";
  const terminal =
    snapshot.status?.state === "stopped" || snapshot.status?.state === "uninstalled";
  const newer = snapshot.status !== null && snapshot.status.updatedAt > minUpdatedAt;
  // 终态快照可能早于 lock.release；必须把两个既有 owner 的观测共同用作 admission。
  if (!released) return false;
  if (terminal && (!requireFreshSnapshot || newer)) return true;
  return !requireFreshSnapshot && snapshot.state === "missing";
}

export async function waitForServerStopped(
  layout: ServerLayout,
  minUpdatedAt = 0,
  requireFreshSnapshot = false,
): Promise<void> {
  const expiresAt = Date.now() + 6_000;
  while (Date.now() < expiresAt) {
    const snapshot = await readPersistedStatusDetailed(layout);
    if (snapshot.state === "invalid" || snapshot.state === "unreadable") {
      throw new Error("Cannot verify Server shutdown status");
    }
    const lock = await new DataRootLock(layout.lockFile).inspect();
    if (lock.state === "invalid" || lock.state === "unreadable") {
      throw new Error(`Cannot verify Server shutdown (${describeLockInspection(lock)})`);
    }
    if (confirmsShutdown(snapshot, lock, minUpdatedAt, requireFreshSnapshot)) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for Server shutdown (${layout.statusFile})`);
}
