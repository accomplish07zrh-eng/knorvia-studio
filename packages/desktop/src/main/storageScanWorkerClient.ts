import { Worker } from "node:worker_threads";
import type { StorageScanProgress, StorageScanRunnerPort } from "@knorvia/services/node";
import { isStorageScanWorkerMessage } from "./storageScanWorkerProtocol.js";

const DEFAULT_PROGRESS_INTERVAL_MS = 300;
const ABORT_GRACE_MS = 500;

function abortedScan(): Error {
  return new DOMException("storage scan aborted", "AbortError");
}

class WorkerScanRun {
  private settled = false;
  private graceTimer: NodeJS.Timeout | null = null;
  private readonly abort = (): void => {
    this.worker.postMessage({ type: "abort" });
    this.graceTimer = setTimeout(
      () => this.finish(() => this.reject(abortedScan())),
      ABORT_GRACE_MS,
    );
    this.graceTimer.unref?.();
  };

  public constructor(
    private readonly worker: Worker,
    private readonly signal: AbortSignal,
    private readonly onProgress: (value: StorageScanProgress) => void,
    private readonly resolve: (value: StorageScanProgress) => void,
    private readonly reject: (error: unknown) => void,
  ) {}

  public attach(): void {
    this.worker.on("message", (message: unknown) => this.receive(message));
    this.worker.once("error", (error) => this.finish(() => this.reject(error)));
    this.worker.once("exit", (code) => {
      if (code !== 0) {
        this.finish(() => this.reject(new Error(`storage scan worker exited with code ${code}`)));
      }
    });
    if (this.signal.aborted) {
      this.finish(() => this.reject(abortedScan()));
      return;
    }
    this.signal.addEventListener("abort", this.abort, { once: true });
    this.worker.unref();
  }

  private receive(value: unknown): void {
    if (!isStorageScanWorkerMessage(value)) return;
    switch (value.type) {
      case "progress": {
        if (!this.settled) {
          const onProgress = this.onProgress;
          onProgress(value.progress);
        }
        return;
      }
      case "done":
        this.finish(() => this.resolve(value.progress));
        return;
      case "aborted":
        this.finish(() => this.reject(abortedScan()));
        return;
      case "error":
        this.finish(() =>
          this.reject(Object.assign(new Error(value.message), { code: value.code })),
        );
    }
  }

  private finish(deliver: () => void): void {
    if (this.settled) return;
    this.settled = true;
    // 先退休 signal/timer，再终止唯一 Worker；结果不拥有另一个扫描或取消队列。
    this.signal.removeEventListener("abort", this.abort);
    if (this.graceTimer) clearTimeout(this.graceTimer);
    void this.worker.terminate();
    deliver();
  }
}

export function createStorageScanWorkerRunner(
  options: { progressIntervalMs?: number; workerUrl?: URL } = {},
): StorageScanRunnerPort {
  const workerUrl = options.workerUrl ?? new URL("./storageScanWorker.js", import.meta.url);
  const progressIntervalMs = options.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS;
  return {
    run: ({ roots, signal, onProgress }) =>
      new Promise<StorageScanProgress>((resolve, reject) => {
        const worker = new Worker(workerUrl, { workerData: { roots, progressIntervalMs } });
        new WorkerScanRun(worker, signal, onProgress, resolve, reject).attach();
      }),
  };
}
