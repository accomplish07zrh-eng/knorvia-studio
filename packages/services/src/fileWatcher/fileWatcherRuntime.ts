// IO only. The service owns admission, retirement and pending-turn identity.
import { watch } from "node:fs";
import type { IDisposable } from "@knorvia/rpc";

export interface FileWatcherRuntime {
  open(
    path: string,
    recursive: boolean,
    signals: {
      change(filename: string | Buffer | null): void;
      error(error: unknown): void;
    },
  ): IDisposable;
  /** Schedule an asynchronous turn. Disposal cancels it; already queued work may arrive. */
  schedule(delay: number, run: () => void): IDisposable;
}

export const nodeFileWatcherRuntime: FileWatcherRuntime = {
  open(path, recursive, signals) {
    const handle = watch(path, { recursive }, (_kind, filename) => signals.change(filename));
    handle.on("error", signals.error);
    return { dispose: () => handle.close() };
  },
  schedule(delay, run) {
    const timer = setTimeout(run, delay);
    return { dispose: () => clearTimeout(timer) };
  },
};
