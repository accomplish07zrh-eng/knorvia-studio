// Source-exposed reconstruction from frozen contracts, not a clean-room or license claim.
// See specs/knorvia-file-watcher-fast-20261001.md and the Lane C handoff for provenance.
import { Emitter, Event, type IDisposable } from "@knorvia/rpc";
import type { FileWatchEvent } from "@knorvia/shared";
import { createServiceLogger, type ServiceLogger } from "#src/logger/serviceLogger.js";
import { registerMemoryDiagnosticsProvider } from "#src/memoryDiagnostics.js";
import type { IFileWatcherService } from "./fileWatcher.js";
import {
  emptyFileWatcherBatch,
  mergeFileWatcherSignal,
  type FileWatcherBatch,
} from "./fileWatcherBatch.js";
import { nodeFileWatcherRuntime, type FileWatcherRuntime } from "./fileWatcherRuntime.js";

interface ScheduledFlush {
  cancel?: IDisposable;
}

interface Registration {
  readonly id: string;
  readonly directory: string;
  readonly changes: Emitter<FileWatchEvent>;
  native?: IDisposable;
  pending?: ScheduledFlush;
  batch: FileWatcherBatch;
}

export function createFileWatcherService(options?: {
  logger?: ServiceLogger;
  runtime?: FileWatcherRuntime;
}): IFileWatcherService {
  const runtime = options?.runtime ?? nodeFileWatcherRuntime;
  const logger = options?.logger ?? createServiceLogger("file-watcher");
  const admitted = new Map<string, Registration>();
  let sequence = 0;
  const diagnostics = registerMemoryDiagnosticsProvider("fileWatcher", () => ({
    open: admitted.size,
  }));

  const isCurrent = (owner: Registration) => admitted.get(owner.id) === owner;

  function retire(owner: Registration): void {
    if (!isCurrent(owner)) return;
    admitted.delete(owner.id);
    owner.pending?.cancel?.dispose();
    owner.pending = undefined;
    owner.batch = emptyFileWatcherBatch;
    try {
      owner.native?.dispose();
    } finally {
      owner.changes.dispose();
    }
  }

  function receive(owner: Registration, filename: string | Buffer | null): void {
    if (!isCurrent(owner)) return;
    owner.batch = mergeFileWatcherSignal(owner.batch, owner.directory, filename);
    owner.pending?.cancel?.dispose();
    const turn: ScheduledFlush = {};
    owner.pending = turn;
    turn.cancel = runtime.schedule(150, () => {
      // 已取消的回调可能已经排队；只允许当前 owner 的当前轮次取走批次。
      if (!isCurrent(owner) || owner.pending !== turn) return;
      const batch = owner.batch;
      owner.pending = undefined;
      owner.batch = emptyFileWatcherBatch;
      owner.changes.fire(
        batch.kind === "exact"
          ? { dirPath: owner.directory, changedPath: batch.path }
          : { dirPath: owner.directory },
      );
    });
  }

  function fail(owner: Registration, error: unknown): void {
    if (!isCurrent(owner)) return;
    logger.warn(undefined, "文件监听器异常，清理 watcher", {
      id: owner.id,
      path: owner.directory,
      error: error instanceof Error ? error.message : String(error),
    });
    owner.changes.fire({ dirPath: owner.directory });
    retire(owner);
  }

  return {
    async watch({ path, recursive }) {
      const owner: Registration = {
        id: String(sequence++),
        directory: path,
        changes: new Emitter<FileWatchEvent>(),
        batch: emptyFileWatcherBatch,
      };
      try {
        owner.native = runtime.open(path, recursive ?? false, {
          change: (filename) => receive(owner, filename),
          error: (error) => fail(owner, error),
        });
      } catch (error) {
        owner.changes.dispose();
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`无法监视目录 '${path}': ${detail}`);
      }
      admitted.set(owner.id, owner);
      return { id: owner.id };
    },
    async unwatch({ id }) {
      const owner = admitted.get(id);
      if (owner) retire(owner);
    },
    onDynamicChange(id) {
      const owner = admitted.get(id);
      if (owner) return owner.changes.event;
      logger.warn(undefined, "忽略已失效的文件监听订阅", { id });
      return Event.None;
    },
    disposeAll() {
      diagnostics.dispose();
      for (const owner of Array.from(admitted.values())) retire(owner);
    },
  };
}
