// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { CoreErrorType, createCoreError } from "@knorvia/contracts";

type PublicationState =
  | { kind: "preparing" | "publishing" | "cancelled" }
  | { kind: "published"; startedAt: number }
  | { kind: "failed"; error: unknown };

/** Owns publication only. Answers remain with the prepared request, never in this barrier. */
export class PermissionPublication {
  private state: PublicationState = { kind: "preparing" };
  private admit!: (allow: boolean) => void;
  readonly hooks = new Promise<boolean>((resolve) => {
    this.admit = resolve;
  });

  get published(): boolean {
    return this.state.kind === "published";
  }
  get failure(): { error: unknown } | undefined {
    return this.state.kind === "failed" ? this.state : undefined;
  }
  get elapsed(): number {
    return this.state.kind === "published"
      ? Math.max(0, Math.round(Date.now() - this.state.startedAt))
      : 0;
  }

  publish(work: () => Promise<void>, signal: AbortSignal, result: Promise<unknown>): Promise<void> {
    this.state = { kind: "publishing" };
    return new Promise((resolve, reject) => {
      const cleanup = () => signal.removeEventListener("abort", abort);
      const abort = () => {
        if (this.state.kind !== "publishing") return;
        this.state = { kind: "cancelled" };
        this.admit(false);
        cleanup();
        // 取消不等待失去响应的发布端口；沿用 broker 的取消错误，已先作答时仍停止本次执行。
        void result.then(
          () =>
            reject(createCoreError(CoreErrorType.ToolCancelled, "Permission request cancelled")),
          reject,
        );
      };
      const failed = (error: unknown) => {
        if (this.state.kind !== "publishing") return;
        this.state = { kind: "failed", error };
        this.admit(false);
        cleanup();
        reject(error);
      };
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
      try {
        void work().then(() => {
          if (this.state.kind !== "publishing") return;
          cleanup();
          this.state = { kind: "published", startedAt: Date.now() };
          resolve();
        }, failed);
      } catch (error) {
        failed(error);
      }
    });
  }
  allowHooks(waiting: boolean): void {
    this.admit(waiting);
  }
  close(): void {
    this.admit(false);
  }
}
