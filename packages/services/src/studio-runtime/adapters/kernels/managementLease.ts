import { randomUUID } from "node:crypto";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { record, type ExternalKernel } from "../../domain/kernelPolicy.js";
import { managedLock, processAlive, safeManagedPath } from "./managedPaths.js";

export async function acquireKernelLease(
  root: string,
  kernel: ExternalKernel,
): Promise<() => Promise<void>> {
  let unlock: (() => Promise<void>) | undefined;
  for (let attempt = 0; !unlock; attempt++) {
    try {
      unlock = await managedLock(root);
    } catch (error) {
      if (
        attempt === 30 ||
        !(error instanceof Error) ||
        !error.message.includes("另一个内核管理操作")
      )
        throw error;
      await delay(25);
    }
  }
  const path = await safeManagedPath(root, `.running-${kernel}-${randomUUID()}.json`);
  try {
    await writeFile(path, JSON.stringify({ kernel, pid: process.pid }), { flag: "wx" });
    return async () => {
      await rm(await safeManagedPath(root, path), { force: true });
    };
  } finally {
    await unlock();
  }
}

// 调用者持有管理锁，因此不能有新运行在检查和安装替换之间取得租约。
export async function assertNoKernelLeases(root: string, kernel: ExternalKernel): Promise<void> {
  for (const name of await readdir(root)) {
    if (!name.startsWith(`.running-${kernel}-`) || !name.endsWith(".json")) continue;
    const path = await safeManagedPath(root, name);
    let entry: Record<string, unknown>;
    try {
      entry = record(JSON.parse(await readFile(path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (entry.kernel !== kernel || processAlive(entry.pid))
      throw new Error("此内核在另一个窗口仍有运行任务，请停止后再管理安装");
    await rm(path, { force: true });
  }
}
