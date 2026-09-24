import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { type ExternalKernel, versionFrom } from "../../domain/kernelPolicy.js";
import { hashFile, installOfficialKernel } from "./installSource.js";
import {
  managedLock,
  readManaged,
  safeManagedPath,
  safeManagedRoot,
  writeManaged,
  type ManagedKernel,
} from "./managedPaths.js";
import { captureVersion } from "./processTransport.js";
import { resolveExecutable, type KernelExecutable } from "./executable.js";
import { acquireKernelLease, assertNoKernelLeases } from "./managementLease.js";
import { publishKernelVersion } from "./publishVersion.js";
import {
  removeOwnedVersions,
  versionForExecutable,
  writeVersionReceipt,
} from "./managedVersions.js";

type Installer = typeof installOfficialKernel;
export class ManagedKernels {
  private controllers = new Set<AbortController>();
  private operations = new Set<Promise<unknown>>();
  private disposed = false;
  constructor(
    readonly dataDir: string,
    private busy: (kernel: ExternalKernel) => boolean,
    private install: Installer = installOfficialKernel,
  ) {}
  async current(
    kernel: ExternalKernel,
  ): Promise<{ entry: ManagedKernel; path: string } | undefined> {
    const root = await safeManagedRoot(this.dataDir);
    const entry = await readManaged(root, kernel);
    if (!entry) return;
    return { entry, path: await safeManagedPath(root, entry.executable) };
  }
  async verifiedPath(kernel: ExternalKernel, supplied?: string): Promise<string | undefined> {
    const path = supplied?.trim() || (await this.current(kernel))?.path;
    if (path) await versionForExecutable(await safeManagedRoot(this.dataDir), kernel, path);
    return path;
  }
  async resolve(
    kernel: ExternalKernel,
    supplied?: string,
  ): Promise<KernelExecutable & { managed: boolean }> {
    const root = await safeManagedRoot(this.dataDir);
    const path = supplied?.trim() || (await this.current(kernel))?.path;
    const verified = new Map<string, ManagedKernel | undefined>();
    if (path) verified.set(path, await versionForExecutable(root, kernel, path));
    const executable = await resolveExecutable(kernel, path);
    // 显式配置、PATH 探测和 Node/Shell 启动器都走同一次受管归属检查，不能借外部别名绕过收据。
    for (const candidate of new Set([executable.path, executable.command, ...executable.args])) {
      if (!isAbsolute(candidate) || verified.has(candidate)) continue;
      verified.set(candidate, await versionForExecutable(root, kernel, candidate));
    }
    return { ...executable, managed: [...verified.values()].some(Boolean) };
  }
  async lease(kernel: ExternalKernel): Promise<() => Promise<void>> {
    if (this.disposed) throw new Error("内核管理已关闭");
    return acquireKernelLease(await safeManagedRoot(this.dataDir), kernel);
  }
  manage(kernel: ExternalKernel, action: "install" | "update" | "uninstall"): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("内核管理已关闭"));
    const controller = new AbortController();
    this.controllers.add(controller);
    const promise = this.change(kernel, action, controller.signal);
    this.operations.add(promise);
    const cleanup = () => {
      this.controllers.delete(controller);
      this.operations.delete(promise);
    };
    promise.then(cleanup, cleanup);
    return promise;
  }
  private async change(
    kernel: ExternalKernel,
    action: "install" | "update" | "uninstall",
    signal: AbortSignal,
  ): Promise<void> {
    const root = await safeManagedRoot(this.dataDir);
    const unlock = await managedLock(root);
    let stage: string | undefined;
    try {
      if (this.busy(kernel)) throw new Error("此内核仍有运行任务，请停止后再管理安装");
      await assertNoKernelLeases(root, kernel);
      signal.throwIfAborted();
      const current = await readManaged(root, kernel);
      if (action === "uninstall") {
        await removeOwnedVersions(root, kernel, current);
        return;
      }
      if (action === "update" && !current)
        throw new Error("只能更新 Studio 管理的副本，请先安装副本");
      stage = await safeManagedPath(root, `.staging-${randomUUID()}`);
      await mkdir(stage);
      const prepared = await this.install(kernel, stage, signal);
      signal.throwIfAborted();
      const stagedExecutable = await safeManagedPath(stage, prepared.executable);
      if ((await hashFile(stagedExecutable)) !== prepared.sha256)
        throw new Error("安装前完整性校验失败");
      const launcher = await resolveExecutable(kernel, stagedExecutable);
      const actual = versionFrom(await captureVersion(launcher, signal));
      if (actual !== prepared.version) throw new Error("安装包的实际版本与官方清单不一致");
      const directory = `${kernel}-${prepared.version}-${randomUUID()}`;
      const entry: ManagedKernel = {
        owner: "knorvia-studio",
        kernel,
        version: prepared.version,
        directory,
        executable: join(directory, prepared.executable),
        sha256: prepared.sha256,
      };
      await writeVersionReceipt(stage, entry, signal);
      const committed = await safeManagedPath(root, directory);
      await publishKernelVersion(stage, committed, signal);
      stage = committed;
      signal.throwIfAborted();
      await writeManaged(root, entry);
      stage = undefined;
      // 配置写入属于后续持久化步骤。保留旧副本，避免更新完成后进程崩溃使旧配置指向已删除文件。
    } finally {
      if (stage)
        await rm(await safeManagedPath(root, relative(root, stage)), {
          recursive: true,
          force: true,
        }).catch(() => {});
      await unlock();
    }
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    for (const controller of this.controllers) controller.abort();
    await Promise.allSettled(this.operations);
  }
}
