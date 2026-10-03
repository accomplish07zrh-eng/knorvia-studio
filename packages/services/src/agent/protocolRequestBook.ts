import type {
  KnorviaProtocolMethod,
  KnorviaProtocolRequestId,
  KnorviaProtocolTrace,
} from "@knorvia/shared";
import type { V4Method } from "@knorvia/shared/protocol-v4";
import type { z } from "zod";

export type ProtocolClientMethod = KnorviaProtocolMethod | V4Method;

export interface ProtocolRequestOptions {
  lifecycle?: "operation" | "observation";
  signal?: AbortSignal;
  trace?: KnorviaProtocolTrace;
  timeoutMs?: number;
}

export interface ProtocolTimeoutFact {
  method: ProtocolClientMethod;
  requestId: KnorviaProtocolRequestId;
  timeoutMs: number;
}

interface RequestBookPorts {
  disposed(): boolean;
  drained(): void;
  timedOut(fact: ProtocolTimeoutFact): void;
  timeoutError(fact: ProtocolTimeoutFact): Error;
}

interface RequestEntry {
  operation: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  detachAbort(): void;
  arm(): void;
  accept(result: unknown): void;
  reject(error: Error): void;
}

/** Owns request resources and settlement; transport/runtime lifetime stays outside. */
export function createProtocolRequestBook(ports: RequestBookPorts) {
  const entries = new Map<string, RequestEntry>();
  let operations = 0;

  function stopClock(entry: RequestEntry): void {
    if (entry.timer !== null) clearTimeout(entry.timer);
    entry.timer = null;
  }

  function release(key: string): RequestEntry | undefined {
    const entry = entries.get(key);
    if (!entry) return undefined;
    stopClock(entry);
    entry.detachAbort();
    entries.delete(key);
    if (entry.operation) {
      operations--;
      if (operations === 0 && !ports.disposed()) ports.drained();
    }
    return entry;
  }

  function open<T>(
    method: ProtocolClientMethod,
    requestId: KnorviaProtocolRequestId,
    timeoutMs: number,
    resultSchema: z.ZodType<T> | undefined,
    signal: AbortSignal | undefined,
    observation: boolean,
  ): { key: string; result: Promise<T> } {
    const key = String(requestId);
    let resolve!: (result: T) => void;
    let reject!: (error: Error) => void;
    const result = new Promise<T>((fulfil, fail) => {
      resolve = fulfil;
      reject = fail;
    });

    function abort(): void {
      const pending = release(key);
      if (!pending) return;
      const reason = signal?.reason;
      pending.reject(reason instanceof Error ? reason : new DOMException("Request aborted", "AbortError"));
    }

    function expire(): void {
      const pending = release(key);
      if (!pending) return;
      const fact: ProtocolTimeoutFact = { method, requestId, timeoutMs };
      const error = ports.timeoutError(fact);
      if (pending.operation) ports.timedOut(fact);
      pending.reject(error);
    }

    const entry: RequestEntry = {
      operation: !observation,
      timer: null,
      detachAbort: () => signal?.removeEventListener("abort", abort),
      arm() { entry.timer = setTimeout(expire, timeoutMs); },
      accept(value) {
        try {
          resolve(resultSchema ? resultSchema.parse(value) : value as T);
        } catch (error) {
          reject(error instanceof Error
            ? error
            : new Error(`Knorvia Studio Protocol response parse failed: ${method}`));
        }
      },
      reject,
    };
    entry.arm();
    entries.set(key, entry);
    if (entry.operation) operations++;
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    return { key, result };
  }

  return {
    get count() { return entries.size; },
    get operationCount() { return operations; },
    open,
    has: (key: string) => entries.has(key),
    discard(key: string): void { release(key); },
    accept(id: KnorviaProtocolRequestId, value: unknown): void {
      release(String(id))?.accept(value);
    },
    reject(id: KnorviaProtocolRequestId, error: Error): void {
      release(String(id))?.reject(error);
    },
    failAll(error: Error): void {
      const hadOperations = operations > 0;
      for (const entry of entries.values()) {
        stopClock(entry);
        entry.detachAbort();
        entry.reject(error);
      }
      entries.clear();
      operations = 0;
      if (hadOperations && !ports.disposed()) ports.drained();
    },
    setWatchdogsReady(ready: boolean): void {
      for (const entry of entries.values()) {
        stopClock(entry);
        if (ready) entry.arm();
      }
    },
  };
}
