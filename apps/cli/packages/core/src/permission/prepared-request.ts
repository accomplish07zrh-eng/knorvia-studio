// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { PermissionBrokerResult, PreparedPermissionRequest } from "@knorvia/contracts";

interface PreparationActions<T> {
  activate: (owner: PermissionPreparation<T>) => void | Promise<void>;
  dispose?: () => void;
  signal?: AbortSignal;
  cancelled: () => unknown;
  timeout?: { milliseconds: number; error: () => unknown };
}

/** One result cell and one lifecycle; adapters may index this owner but never copy its state. */
export class PermissionPreparation<T = PermissionBrokerResult> {
  readonly result: Promise<T>;
  private phase: "prepared" | "active" | "finished" = "prepared";
  private timer?: ReturnType<typeof setTimeout>;
  private deliver!: (result: T) => void;
  private fail!: (error: unknown) => void;
  private readonly abort = () => this.reject(this.actions.cancelled());

  constructor(private readonly actions: PreparationActions<T>) {
    if (actions.signal?.aborted) throw actions.cancelled();
    this.result = new Promise((resolve, reject) => {
      this.deliver = resolve;
      this.fail = reject;
    });
    // 登记可能在调用方拿到 handle 前取消；观察同一 Promise，不吞掉调用方随后读取的拒绝。
    void this.result.catch(() => {});
    actions.signal?.addEventListener("abort", this.abort, { once: true });
  }

  get settled(): boolean {
    return this.phase === "finished";
  }

  activate(): boolean {
    if (this.phase !== "prepared") return !this.settled;
    this.phase = "active";
    try {
      if (this.actions.timeout)
        this.timer = setTimeout(
          () => this.reject(this.actions.timeout!.error()),
          this.actions.timeout.milliseconds,
        );
      const started = this.actions.activate(this);
      if (started) void Promise.resolve(started).catch((error) => this.reject(error));
    } catch (error) {
      this.reject(error);
    }
    return true;
  }

  resolve(result: T): void {
    this.resolveFrom(() => result);
  }
  resolveFrom(read: () => T): void {
    this.finish(read);
  }
  reject(error: unknown): void {
    this.finish(undefined, error);
  }
  dispose(): void {
    if (!this.settled) this.reject(this.actions.cancelled());
  }

  private finish(read?: () => T, error?: unknown): void {
    if (this.settled) return;
    this.phase = "finished";
    try {
      if (this.timer !== undefined) clearTimeout(this.timer);
      this.timer = undefined;
      this.actions.signal?.removeEventListener("abort", this.abort);
      this.actions.dispose?.();
      if (read) this.deliver(read());
      else this.fail(error);
    } catch (failure) {
      this.fail(read ? failure : error);
    }
  }
}

export async function activatePermissionRequest(
  preparation: Promise<PreparedPermissionRequest>,
): Promise<PermissionBrokerResult> {
  const handle = await preparation;
  try {
    handle.activate();
    return await handle.result;
  } finally {
    handle.dispose();
  }
}

/** A protocol projection shares activation and disposal with its original owner. */
export function mapPreparedPermission<T>(
  owner: { result: Promise<T>; activate(): boolean; dispose(): void },
  project: (value: T) => PermissionBrokerResult,
): PreparedPermissionRequest {
  const result = owner.result.then(project);
  void result.catch(() => {});
  return { result, activate: () => owner.activate(), dispose: () => owner.dispose() };
}

/** Cancel waiting for preparation without permitting a late continuation to start notification. */
export function awaitPermissionPreparation<T>(
  work: () => Promise<T>,
  signal: AbortSignal | undefined,
  cancelled: () => unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(cancelled());
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    const cleanup = () => signal?.removeEventListener("abort", abort);
    try {
      void work().then(
        (value) => {
          cleanup();
          resolve(value);
        },
        (error) => {
          cleanup();
          reject(error);
        },
      );
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
