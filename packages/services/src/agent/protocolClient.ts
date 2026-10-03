import { KnorviaStorageStartupGate } from "#src/agent/storageStartupGate.js";
import { Emitter, type IDisposable } from "@knorvia/rpc";
import type {
  KnorviaProtocolNotification,
  KnorviaProtocolRequest,
  KnorviaProtocolRequestId,
} from "@knorvia/shared";
import type { z } from "zod";
import type { KnorviaProtocolTransport } from "./protocolTransport.js";
import {
  createProtocolRequestBook,
  type ProtocolClientMethod,
  type ProtocolRequestOptions,
  type ProtocolTimeoutFact,
} from "./protocolRequestBook.js";

type KnorviaProtocolClientMethod = ProtocolClientMethod;
type KnorviaProtocolClientRequestOptions = ProtocolRequestOptions;
type KnorviaProtocolRequestTimeoutEvent = ProtocolTimeoutFact;

interface KnorviaProtocolClientOptions {
  requireStorageStartup?: boolean;
  requestTimeoutMs?: number;
}

class KnorviaProtocolClientError extends Error {
  constructor(message: string, readonly code?: number, readonly data?: unknown) {
    super(message);
    this.name = "KnorviaProtocolClientError";
  }
}

export class KnorviaProtocolRequestTimeoutError extends Error {
  constructor(
    readonly method: KnorviaProtocolClientMethod,
    readonly requestId: KnorviaProtocolRequestId,
    readonly timeoutMs: number,
  ) {
    super(`Knorvia Studio Protocol request timed out: ${method}`);
    this.name = "KnorviaProtocolRequestTimeoutError";
  }
}

/** Protocol facade; the request book owns pending settlement and watchdogs. */
export class KnorviaProtocolClient implements IDisposable {
  readonly storageStartup: KnorviaStorageStartupGate;
  private disposed = false;
  private requestSerial = 1;
  private readonly timeoutMs: number;
  private readonly notifications = new Emitter<KnorviaProtocolNotification>();
  private readonly serverRequests = new Emitter<KnorviaProtocolRequest>();
  private readonly timeouts = new Emitter<KnorviaProtocolRequestTimeoutEvent>();
  private readonly drained = new Emitter<void>();
  private readonly closed = new Emitter<void>();
  private readonly listeners: IDisposable[];
  private readonly requests = createProtocolRequestBook({
    disposed: () => this.disposed,
    drained: () => this.drained.fire(),
    timedOut: (fact) => this.timeouts.fire(fact),
    timeoutError: ({ method, requestId, timeoutMs }) =>
      new KnorviaProtocolRequestTimeoutError(method, requestId, timeoutMs),
  });

  readonly onNotification = this.notifications.event;
  readonly onRequest = this.serverRequests.event;
  readonly onRequestTimeout = this.timeouts.event;
  readonly onPendingRequestsDrained = this.drained.event;
  readonly onClose = this.closed.event;

  constructor(
    private readonly transport: KnorviaProtocolTransport,
    options?: KnorviaProtocolClientOptions,
  ) {
    this.storageStartup = new KnorviaStorageStartupGate(options?.requireStorageStartup ?? false);
    this.timeoutMs = options?.requestTimeoutMs ?? 180_000;
    this.listeners = [
      transport.onMessage((message) => this.route(message)),
      transport.onClose((event) => {
        this.storageStartup.dispose();
        this.requests.failAll(new Error(
          `Knorvia Studio agent transport closed${event.reason ? `: ${event.reason}` : ""}`,
        ));
        this.closed.fire();
      }),
    ];
  }

  get isDisposed(): boolean { return this.disposed; }
  get transportKind() { return this.transport.kind; }
  get pendingRequestCount(): number { return this.requests.count; }
  get pendingOperationRequestCount(): number { return this.requests.operationCount; }

  async request<T = unknown>(
    method: KnorviaProtocolClientMethod,
    params?: unknown,
    resultSchema?: z.ZodType<T>,
    options?: KnorviaProtocolClientRequestOptions,
  ): Promise<T> {
    this.assertOpen();
    if (this.storageStartup.isWaiting) await this.storageStartup.wait(options?.signal);
    this.assertOpen();
    options?.signal?.throwIfAborted();
    const id = this.requestSerial++;
    const request = this.requests.open(
      method,
      id,
      options?.timeoutMs ?? this.timeoutMs,
      resultSchema,
      options?.signal,
      options?.lifecycle === "observation",
    );
    if (!this.requests.has(request.key)) return request.result;
    try {
      await this.transport.send({
        id,
        method,
        params,
        ...(options?.trace ? { trace: options.trace } : {}),
      });
    } catch (error) {
      this.requests.discard(request.key);
      throw error;
    }
    return request.result;
  }

  async notify(method: KnorviaProtocolClientMethod, params?: unknown): Promise<void> {
    this.assertOpen();
    await this.transport.send({ method, params });
  }

  async respond(id: KnorviaProtocolRequestId, result: unknown): Promise<void> {
    this.assertOpen();
    await this.transport.send({ id, result });
  }

  async respondError(
    id: KnorviaProtocolRequestId,
    error: { code: number; message: string; data?: unknown },
  ): Promise<void> {
    this.assertOpen();
    await this.transport.send({ id, error });
  }

  dispose(): void {
    if (this.beginDisposal()) this.transport.dispose();
  }

  async disposeAndWait(): Promise<void> {
    const firstDisposal = this.beginDisposal();
    if (this.transport.disposeAndWait) await this.transport.disposeAndWait();
    else if (firstDisposal) this.transport.dispose();
  }

  private route(value: unknown): void {
    if (value === null || typeof value !== "object") return;
    if ("id" in value) {
      const id = value.id as KnorviaProtocolRequestId;
      if ("result" in value) this.requests.accept(id, value.result);
      else if ("error" in value) {
        const error = value.error as { code: number; message: string; data?: unknown };
        this.requests.reject(id, new KnorviaProtocolClientError(error.message, error.code, error.data));
      } else if ("method" in value) this.serverRequests.fire(value as KnorviaProtocolRequest);
      return;
    }
    if (!("method" in value)) return;
    const notification = value as KnorviaProtocolNotification;
    if (notification.method === "startup/storageState" && this.storageStartup.accept(notification.params)) {
      const state = this.storageStartup.snapshot;
      this.requests.setWatchdogsReady(state?.phase === "ready");
      if (state?.phase === "failed") {
        this.requests.failAll(new Error(`SQLite startup failed: ${state.errorCode}`));
      }
    }
    this.notifications.fire(notification);
  }

  private beginDisposal(): boolean {
    if (this.disposed) return false;
    this.disposed = true;
    this.requests.failAll(new Error("Knorvia Studio Protocol client disposed"));
    for (const listener of this.listeners) listener.dispose();
    this.listeners.length = 0;
    this.storageStartup.dispose();
    for (const emitter of [this.notifications, this.serverRequests, this.timeouts, this.drained, this.closed]) {
      emitter.dispose();
    }
    return true;
  }

  private assertOpen(): void {
    if (this.disposed) throw new Error("Knorvia Studio Protocol client is disposed");
  }
}
