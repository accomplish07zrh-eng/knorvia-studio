import { randomUUID } from "node:crypto";
import { Emitter } from "@knorvia/rpc";
import {
  knorviaStorageStartupStateSchema,
  type KnorviaStorageStartupState,
  type DatabaseStartupErrorCode,
} from "@knorvia/shared";

interface StartupCompletion {
  view(): Promise<void>;
  ready(): void;
  failed(error: Error): void;
}

type CompletionOutcome = { kind: "ready" } | { kind: "failed"; error: Error };
interface CompletionObserver {
  ready(): void;
  failed(error: Error): void;
}

interface StartupObservation {
  report?: KnorviaStorageStartupState;
  rejection?: Error;
  completion?: StartupCompletion;
}

function createCompletion(): StartupCompletion {
  let outcome: CompletionOutcome | undefined;
  const observers = new Set<CompletionObserver>();
  function deliver(observer: CompletionObserver, completed: CompletionOutcome): void {
    if (completed.kind === "ready") observer.ready();
    else observer.failed(completed.error);
  }
  function settle(completed: CompletionOutcome): void {
    if (outcome) return;
    outcome = completed;
    for (const observer of observers) deliver(observer, completed);
    observers.clear();
  }
  return {
    view() {
      return new Promise<void>((resolve, reject) => {
        const observer: CompletionObserver = { ready: resolve, failed: reject };
        if (outcome) deliver(observer, outcome);
        else observers.add(observer);
      });
    },
    ready: () => settle({ kind: "ready" }),
    failed: (error) => settle({ kind: "failed", error }),
  };
}

/** One process attempt owns the observed fact, shared completion and first-status clock. */
export class KnorviaStorageStartupGate {
  private readonly observation: StartupObservation = {};
  private readonly events = new Emitter<KnorviaStorageStartupState>();
  private firstStatusDeadline?: ReturnType<typeof setTimeout>;
  readonly onDidChange = this.events.event;

  constructor(required: boolean, firstStatusTimeoutMs = 30_000) {
    if (!required) return;
    this.completion();
    this.firstStatusDeadline = setTimeout(
      () => this.rejectStartup("startup_status_timeout"),
      firstStatusTimeoutMs,
    );
    this.firstStatusDeadline.unref?.();
  }

  get snapshot(): KnorviaStorageStartupState | undefined {
    return this.observation.report;
  }

  get isWaiting(): boolean {
    if (this.observation.rejection) return true;
    return this.observation.completion !== undefined && this.observation.report?.phase !== "ready";
  }

  accept(input: unknown): boolean {
    const parsed = knorviaStorageStartupStateSchema.safeParse(input);
    if (!parsed.success || this.observation.rejection) return false;
    const next = parsed.data;
    const current = this.observation.report;
    if (current?.phase === "ready" || current?.phase === "failed") return false;
    if (
      current &&
      (current.attemptId !== next.attemptId ||
        current.databaseId !== next.databaseId ||
        next.sequence <= current.sequence)
    )
      return false;

    clearTimeout(this.firstStatusDeadline);
    this.observation.report = next;
    switch (next.phase) {
      case "ready":
        this.observation.completion?.ready();
        break;
      case "failed":
        this.rejectStartup(next.errorCode ?? "sql_failed");
        break;
      default:
        this.completion();
    }
    this.events.fire(next);
    return true;
  }

  async wait(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    const failure = this.observation.rejection;
    if (failure) throw failure;
    const completion = this.observation.completion;
    if (!completion || this.observation.report?.phase === "ready") return;
    if (!signal) return completion.view();

    let cancel!: () => void;
    try {
      await Promise.race([
        completion.view(),
        new Promise<never>((_, reject) => {
          cancel = () => reject(signal.reason);
          signal.addEventListener("abort", cancel, { once: true });
        }),
      ]);
    } finally {
      signal.removeEventListener("abort", cancel);
    }
  }

  dispose(): void {
    clearTimeout(this.firstStatusDeadline);
    if (
      this.observation.completion &&
      this.observation.report?.phase !== "ready" &&
      !this.observation.rejection
    ) {
      this.rejectStartup("transport_closed");
    }
    this.events.dispose();
  }

  private completion(): StartupCompletion {
    if (this.observation.completion) return this.observation.completion;
    const completion = createCompletion();
    this.observation.completion = completion;
    return completion;
  }

  private rejectStartup(code: DatabaseStartupErrorCode): void {
    const current = this.observation.report;
    if (current?.phase !== "failed") {
      this.observation.report = current
        ? { ...current, phase: "failed", errorCode: code, sequence: current.sequence + 1 }
        : {
            schemaVersion: 1,
            attemptId: randomUUID(),
            databaseId: `unresolved:${randomUUID()}`,
            databaseKind: "session",
            sequence: 1,
            phase: "failed",
            elapsedMs: 0,
            errorCode: code,
          };
      // 原边界先发布合成失败事实，随后才保存错误与拒绝共享 completion。
      this.events.fire(this.observation.report);
    }
    const failure = new Error(`SQLite startup failed: ${code}`);
    this.observation.rejection = failure;
    this.observation.completion?.failed(failure);
  }
}
