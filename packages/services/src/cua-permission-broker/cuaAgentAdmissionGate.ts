export interface CuaAgentSpawnAdmissionContext {
  workspaceKey: string;
  workspacePath?: string;
  workspaceIdentity?: string;
  signal?: AbortSignal;
}

type WaitingSpawn = {
  release: () => void;
  fail: (reason: Error) => void;
};

export class CuaAgentAdmissionGate {
  private epochCounter = 0;
  private activeEpoch: number | undefined;
  private readonly waitingSpawns = new Set<WaitingSpawn>();

  beginRecovery(): number {
    if (this.activeEpoch !== undefined) {
      return this.activeEpoch;
    }
    this.activeEpoch = ++this.epochCounter;
    return this.activeEpoch;
  }

  isRecovering(): boolean {
    return this.activeEpoch !== undefined;
  }

  waitForSpawnAdmission(context: CuaAgentSpawnAdmissionContext): Promise<void> {
    const signal = context.signal;
    if (signal?.aborted) {
      return Promise.reject(
        signal.reason ?? new Error("Knorvia Studio agent process start was cancelled."),
      );
    }
    if (this.activeEpoch === undefined) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const onAbort = (): void => {
        this.waitingSpawns.delete(waiter);
        reject(signal?.reason ?? new Error("Knorvia Studio agent process start was cancelled."));
      };
      const waiter: WaitingSpawn = {
        release: () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        },
        fail: (reason) => {
          signal?.removeEventListener("abort", onAbort);
          reject(reason);
        },
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.waitingSpawns.add(waiter);
    });
  }

  commitRecovery(epoch: number): boolean {
    if (this.activeEpoch !== epoch) {
      return false;
    }
    this.activeEpoch = undefined;
    for (const waiter of this.waitingSpawns) {
      waiter.release();
    }
    this.waitingSpawns.clear();
    return true;
  }

  failRecovery(epoch: number, error: unknown): boolean {
    if (this.activeEpoch !== epoch) {
      return false;
    }
    this.activeEpoch = undefined;
    const reason = error instanceof Error ? error : new Error(String(error));
    for (const waiter of this.waitingSpawns) {
      waiter.fail(reason);
    }
    this.waitingSpawns.clear();
    return true;
  }
}
