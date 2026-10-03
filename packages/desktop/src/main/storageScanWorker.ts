import { isMainThread, parentPort, workerData, type MessagePort } from "node:worker_threads";
import type { StorageRootSpec } from "@knorvia/shared";
import { runStorageScan } from "@knorvia/services/node";
import {
  isStorageScanWorkerCommand,
  type StorageScanWorkerData,
  type StorageScanWorkerMessage,
} from "./storageScanWorkerProtocol.js";

class StorageWorkerBridge {
  private readonly cancellation = new AbortController();

  public constructor(
    private readonly port: MessagePort,
    private readonly input: StorageScanWorkerData,
  ) {}

  public start(): void {
    this.port.on("message", (message: unknown) => {
      if (isStorageScanWorkerCommand(message) && message.type === "abort") {
        this.cancellation.abort();
      }
    });
    void runStorageScan({
      roots: this.input.roots as StorageRootSpec[],
      signal: this.cancellation.signal,
      progressIntervalMs: this.input.progressIntervalMs,
      onProgress: (progress) => this.send({ type: "progress", progress }),
    })
      .then((progress) => this.send({ type: "done", progress }))
      .catch((error: unknown) => this.reportFailure(error));
  }

  private send(message: StorageScanWorkerMessage): void {
    this.port.postMessage(message);
  }

  private reportFailure(error: unknown): void {
    const aborted = error instanceof Error && error.name === "AbortError";
    const message = error instanceof Error ? error.message : String(error);
    const code =
      error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
    this.send({ type: aborted ? "aborted" : "error", message, code });
  }
}

const port = parentPort;
if (!isMainThread && port) {
  new StorageWorkerBridge(port, workerData as StorageScanWorkerData).start();
}
