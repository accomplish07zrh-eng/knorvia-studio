import { BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent, type WebContents } from "electron";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { PlatformChannels, type StorageCleanRequest, type StorageRootSpec } from "@knorvia/shared";
import {
  createFsStorageCleaner,
  createStorageRootsResolver,
  createStorageService,
  getDataBaseDir,
} from "@knorvia/services/node";
import type { IStorageService } from "@knorvia/services";
import { logger } from "./logger.js";
import { createStorageScanWorkerRunner } from "./storageScanWorkerClient.js";

function belongsToStorageRoot(path: string, roots: StorageRootSpec[]): boolean {
  const destination = resolve(path);
  return roots.some((root) => {
    const difference = relative(resolve(root.path), destination);
    return difference === "" || (!difference.startsWith("..") && !isAbsolute(difference));
  });
}

class StorageIpcOwner {
  private service: IStorageService | null = null;
  private latestJobId: string | null = null;
  private subscriber: WebContents | null = null;

  public constructor(private readonly roots: ReturnType<typeof createStorageRootsResolver>) {}

  public register(): void {
    ipcMain.handle(PlatformChannels.StorageStartScan, this.start.bind(this));
    ipcMain.handle(PlatformChannels.StorageCancelScan, this.cancel.bind(this));
    ipcMain.handle(PlatformChannels.StorageGetSnapshot, this.snapshot.bind(this));
    ipcMain.handle(PlatformChannels.StorageClean, this.clean.bind(this));
    ipcMain.handle(PlatformChannels.StorageRevealPath, this.reveal.bind(this));
  }

  private getService(): IStorageService {
    if (this.service) return this.service;
    this.service = createStorageService({
      roots: this.roots,
      scanRunner: createStorageScanWorkerRunner(),
      cleaner: createFsStorageCleaner(),
    });
    this.service.onScanProgress((snapshot) => {
      if (this.subscriber && !this.subscriber.isDestroyed()) {
        this.subscriber.send(PlatformChannels.StorageScanProgress, snapshot);
      }
    });
    return this.service;
  }

  private bind(event: IpcMainInvokeEvent): void {
    if (this.subscriber === event.sender) return;
    this.subscriber = event.sender;
    BrowserWindow.fromWebContents(event.sender)?.once("closed", () => {
      // 旧窗口关闭不能取消后来窗口的作业；读取原事件的 sender，沿用既有订阅身份。
      if (this.subscriber !== event.sender) return;
      this.subscriber = null;
      if (this.latestJobId && this.service) {
        void this.service.cancelScan(this.latestJobId);
        this.latestJobId = null;
      }
    });
  }

  private async start(event: IpcMainInvokeEvent) {
    this.bind(event);
    const result = await this.getService().startScan();
    this.latestJobId = result.jobId;
    return result;
  }

  private async cancel(_event: IpcMainInvokeEvent, jobId: string): Promise<void> {
    if (!this.service) return;
    await this.service.cancelScan(jobId);
    if (this.latestJobId === jobId) this.latestJobId = null;
  }

  private async snapshot() {
    return this.service ? this.service.getSnapshot() : null;
  }

  private async clean(event: IpcMainInvokeEvent, request: StorageCleanRequest) {
    this.bind(event);
    return this.getService().clean(request);
  }

  private async reveal(_event: IpcMainInvokeEvent, absolutePath: string): Promise<void> {
    const roots = await this.roots.resolveRoots();
    if (typeof absolutePath !== "string" || !belongsToStorageRoot(absolutePath, roots)) {
      logger.warn("[resource-manager] refused to reveal path outside storage roots", { absolutePath });
      return;
    }
    shell.showItemInFolder(absolutePath);
  }
}

const storageIpc = new StorageIpcOwner(
  createStorageRootsResolver({ getHomeDir: homedir, getDataBaseDir }),
);

export function registerResourceManagerStorageIpc(): void {
  storageIpc.register();
}
