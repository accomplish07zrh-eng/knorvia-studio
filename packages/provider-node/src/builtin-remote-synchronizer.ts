import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { atomicWritePrivateTextFile, withFileLock } from "@knorvia/shared/node";
import type { NodeKnorviaBuiltinProviderConfigSource } from "./builtin-provider-config-source.js";
import type { KnorviaBuiltinRelease } from "./builtin-release.js";

const HOUR_MS = 60 * 60 * 1_000;

export type KnorviaBuiltinRefreshResult =
  | "updated"
  | "unchanged"
  | "stale"
  | "missing"
  | "skipped"
  | "disposed";

export interface KnorviaBuiltinRemoteSynchronizerOptions {
  readonly source: NodeKnorviaBuiltinProviderConfigSource;
  readonly controlFilePath: string;
  readonly resolveEndpointKey: () => string | Promise<string>;
  readonly fetchRelease: (
    endpointKey: string,
    signal: AbortSignal,
  ) => Promise<KnorviaBuiltinRelease | null>;
  readonly onRefreshResult?: (event: KnorviaBuiltinRefreshEvent) => void;
  readonly now?: () => number;
  readonly successIntervalMs?: number;
  readonly leaseDurationMs?: number;
  readonly failureBaseDelayMs?: number;
  readonly failureMaxDelayMs?: number;
}

export interface KnorviaBuiltinRefreshEvent {
  readonly result: KnorviaBuiltinRefreshResult;
  readonly reason?: "lease-held" | "not-due" | "endpoint-changed";
  readonly revision?: number;
}

interface RefreshControl {
  readonly schemaVersion: 1;
  readonly endpointKey: string;
  readonly leaseId?: string;
  readonly leaseUntil: number;
  readonly nextEligibleAt: number;
  readonly failureCount: number;
}

/** Environment 共享控制文件合并多进程刷新；网络期间不持有文件锁。 */
export class KnorviaBuiltinRemoteSynchronizer {
  readonly #options: KnorviaBuiltinRemoteSynchronizerOptions;
  readonly #now: () => number;
  #inflight: Promise<KnorviaBuiltinRefreshResult> | null = null;
  #disposed = false;
  #abortController: AbortController | null = null;

  constructor(options: KnorviaBuiltinRemoteSynchronizerOptions) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
  }

  refresh(options: { readonly force?: boolean } = {}): Promise<KnorviaBuiltinRefreshResult> {
    if (this.#disposed) {
      return Promise.resolve("disposed");
    }
    if (this.#inflight) {
      return this.#inflight;
    }

    const controller = new AbortController();
    this.#abortController = controller;
    const force = options.force === true;
    const promise = this.#refreshInternal(force, controller.signal).finally(() => {
      if (this.#inflight === promise) {
        this.#inflight = null;
        this.#abortController = null;
      }
    });
    this.#inflight = promise;
    return promise;
  }

  dispose(): void {
    this.#disposed = true;
    this.#abortController?.abort();
  }

  async #refreshInternal(
    force: boolean,
    signal: AbortSignal,
  ): Promise<KnorviaBuiltinRefreshResult> {
    const endpoint = (await this.#options.resolveEndpointKey()).trim();
    if (this.#disposed) {
      return "disposed";
    }
    if (!endpoint) {
      throw new Error("Knorvia Studio Built-in 远端 Endpoint 不能为空");
    }

    const leaseId = randomUUID();
    const acquired = await withFileLock(
      this.#options.controlFilePath,
      async (): Promise<true | "lease-held" | "not-due"> => {
        const now = this.#now();
        const current = await readControl(this.#options.controlFilePath);
        const same = current.endpointKey === endpoint;
        if (same && current.leaseUntil > now) {
          return "lease-held";
        }
        if (!force && same && current.nextEligibleAt > now) {
          return "not-due";
        }
        await writeControl(this.#options.controlFilePath, {
          schemaVersion: 1,
          endpointKey: endpoint,
          leaseId,
          leaseUntil: now + (this.#options.leaseDurationMs ?? 30000),
          nextEligibleAt: same ? current.nextEligibleAt : 0,
          failureCount: same ? current.failureCount : 0,
        });
        return true;
      },
    );

    if (acquired !== true) {
      this.#report({ result: "skipped", reason: acquired });
      return "skipped";
    }

    try {
      signal.throwIfAborted();
      const release = await this.#options.fetchRelease(endpoint, signal);
      if (this.#disposed) {
        await this.#finishLease(endpoint, leaseId, "cancelled");
        return "disposed";
      }

      const nextEndpoint = (await this.#options.resolveEndpointKey()).trim();
      signal.throwIfAborted();
      if (nextEndpoint !== endpoint) {
        await this.#finishLease(endpoint, leaseId, true);
        this.#report({ result: "skipped", reason: "endpoint-changed" });
        return "skipped";
      }

      const result = release ? await this.#options.source.applyRemoteRelease(release) : "missing";
      await this.#finishLease(endpoint, leaseId, true);
      this.#report({ result, ...(release ? { revision: release.revision } : {}) });
      return result;
    } catch (error) {
      await this.#finishLease(endpoint, leaseId, this.#disposed ? "cancelled" : false);
      if (this.#disposed) {
        return "disposed";
      }
      throw error;
    }
  }

  #report(event: KnorviaBuiltinRefreshEvent): void {
    if (this.#disposed) {
      return;
    }
    try {
      this.#options.onRefreshResult?.(event);
    } catch {
      // A reporting callback does not determine the refresh outcome.
    }
  }

  async #finishLease(
    endpoint: string,
    leaseId: string,
    success: boolean | "cancelled",
  ): Promise<void> {
    await withFileLock(this.#options.controlFilePath, async () => {
      const current = await readControl(this.#options.controlFilePath);
      if (current.endpointKey !== endpoint || current.leaseId !== leaseId) {
        return;
      }

      const failureCount =
        success === "cancelled" ? current.failureCount : success ? 0 : current.failureCount + 1;
      const delay =
        success === "cancelled"
          ? 0
          : success
            ? (this.#options.successIntervalMs ?? HOUR_MS)
            : Math.min(
                (this.#options.failureBaseDelayMs ?? 60000) * 2 ** Math.max(0, failureCount - 1),
                this.#options.failureMaxDelayMs ?? HOUR_MS,
              );
      await writeControl(this.#options.controlFilePath, {
        schemaVersion: 1,
        endpointKey: endpoint,
        leaseUntil: 0,
        nextEligibleAt: this.#now() + delay,
        failureCount,
      });
    });
  }
}

async function readControl(filePath: string): Promise<RefreshControl> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return emptyControl();
    }
    throw error;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return isRefreshControl(parsed) ? parsed : emptyControl();
  } catch {
    return emptyControl();
  }
}

function writeControl(filePath: string, control: RefreshControl): Promise<void> {
  return atomicWritePrivateTextFile(filePath, JSON.stringify(control, null, 2));
}

function isRefreshControl(value: unknown): value is RefreshControl {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const control = value as Record<string, unknown>;
  return (
    control.schemaVersion === 1 &&
    typeof control.endpointKey === "string" &&
    (control.leaseId === undefined || typeof control.leaseId === "string") &&
    typeof control.leaseUntil === "number" &&
    typeof control.nextEligibleAt === "number" &&
    Number.isInteger(control.failureCount) &&
    (control.failureCount as number) >= 0
  );
}

function emptyControl(): RefreshControl {
  return {
    schemaVersion: 1,
    endpointKey: "",
    leaseUntil: 0,
    nextEligibleAt: 0,
    failureCount: 0,
  };
}
