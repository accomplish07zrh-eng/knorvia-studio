import type {
  IStudioRuntimeService,
  StudioKernelInspectOptions,
  StudioKernelStatus,
} from "@knorvia/services";

export interface KernelInspection {
  statuses: readonly StudioKernelStatus[];
  checking: boolean;
  inspected: boolean;
  error: string;
  /** 用户显式重探（跳过协议缓存）正在进行。 */
  reprobing: boolean;
}

const unavailable: KernelInspection = {
  statuses: [],
  checking: false,
  inspected: false,
  error: "",
  reprobing: false,
};
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * 端口本身只声明 `inspectKernels()`；这里是向后兼容的加宽视图，
 * 让「重新探测」显式传入 `{ refresh: true }` 以跳过短时协议缓存（与后端 `app/kernelOperations.ts` 同构）。
 */
export type RefreshableKernelInspection = Pick<IStudioRuntimeService, "inspectKernels"> & {
  inspectKernels(options?: StudioKernelInspectOptions): Promise<StudioKernelStatus[]>;
};

/** One ephemeral discovery projection per Studio service; Host remains the source of truth. */
export class StudioKernelCatalog {
  private snapshot: KernelInspection = unavailable;
  private listeners = new Set<() => void>();
  private pending?: Promise<void>;
  private rerun = false;
  private rerunRefresh = false;

  constructor(private readonly service?: RefreshableKernelInspection) {}

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

  /** 普通检测：沿用协议缓存。 */
  refresh = (): Promise<void> => this.inspect(false);
  /** 用户主动重探：绕过协议缓存，必须显示本次真实结果。 */
  reprobe = (): Promise<void> => this.inspect(true);

  private inspect(refresh: boolean): Promise<void> {
    const service = this.service;
    if (!service) return Promise.resolve();
    if (this.pending) {
      // 在飞检测期间的重探请求合并为「结束后再跑一轮」，并保留 refresh 语义；
      // 返回链上的后续轮次，调用方 await 到的才是重探后的真实结果。
      this.rerun = true;
      this.rerunRefresh = this.rerunRefresh || refresh;
      if (refresh && !this.snapshot.reprobing)
        this.publish({ ...this.snapshot, checking: true, reprobing: true });
      return this.pending.then(() => this.pending);
    }
    this.publish({ ...this.snapshot, checking: true, reprobing: refresh, error: "" });
    this.pending = Promise.resolve()
      .then(() => service.inspectKernels(refresh ? { refresh: true } : undefined))
      .then((statuses) => {
        this.publish({ statuses, checking: false, inspected: true, error: "", reprobing: false });
      })
      .catch((cause: unknown) => {
        this.publish({
          ...this.snapshot,
          checking: false,
          reprobing: false,
          inspected: true,
          error: message(cause),
        });
      })
      .finally(() => {
        this.pending = undefined;
        if (this.rerun) {
          const nextRefresh = this.rerunRefresh;
          this.rerun = false;
          this.rerunRefresh = false;
          void this.inspect(nextRefresh);
        }
      });
    return this.pending;
  }
}
