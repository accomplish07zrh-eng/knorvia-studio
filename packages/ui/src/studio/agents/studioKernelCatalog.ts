import type { IStudioRuntimeService, StudioKernelStatus } from "@knorvia/services";

export interface KernelInspection {
  statuses: readonly StudioKernelStatus[];
  checking: boolean;
  inspected: boolean;
  error: string;
}

const unavailable: KernelInspection = {
  statuses: [],
  checking: false,
  inspected: false,
  error: "",
};
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** One ephemeral discovery projection per Studio service; Host remains the source of truth. */
export class StudioKernelCatalog {
  private snapshot: KernelInspection = unavailable;
  private listeners = new Set<() => void>();
  private pending?: Promise<void>;
  private rerun = false;

  constructor(private readonly service?: Pick<IStudioRuntimeService, "inspectKernels">) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1 && !this.snapshot.inspected && !this.pending) void this.refresh();
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(next: KernelInspection) {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  refresh = (): Promise<void> => {
    const service = this.service;
    if (!service) return Promise.resolve();
    if (this.pending) {
      this.rerun = true;
      return this.pending.then(() => this.pending);
    }
    this.publish({ ...this.snapshot, checking: true, error: "" });
    this.pending = Promise.resolve()
      .then(() => service.inspectKernels())
      .then((statuses) => {
        this.publish({ statuses, checking: false, inspected: true, error: "" });
      })
      .catch((cause: unknown) => {
        this.publish({ ...this.snapshot, checking: false, inspected: true, error: message(cause) });
      })
      .finally(() => {
        this.pending = undefined;
        if (this.rerun) {
          this.rerun = false;
          void this.refresh();
        }
      });
    return this.pending;
  };
}
