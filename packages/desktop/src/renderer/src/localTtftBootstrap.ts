import type { IPlatformService, LocalTtftRecord } from "@knorvia/shared";
import { LocalTtftObserver, setLocalTtftObserver } from "@knorvia/ui";

interface PendingTtftRecord {
  value: LocalTtftRecord;
  next?: PendingTtftRecord;
}

/** A bounded FIFO owns finished records; detached batches belong to publication. */
class LocalTtftDelivery {
  private first?: PendingTtftRecord;
  private last?: PendingTtftRecord;
  private count = 0;
  private sequence = 0;
  private dropped = 0;

  offer(record: LocalTtftRecord): void {
    if (this.count >= 128) {
      this.dropped++;
      return;
    }
    const pending: PendingTtftRecord = { value: record };
    if (this.last) this.last.next = pending;
    else this.first = pending;
    this.last = pending;
    this.count++;
  }

  private detachBatch(): LocalTtftRecord[] {
    const batch: LocalTtftRecord[] = [];
    while (this.first && batch.length < 32) {
      const pending = this.first;
      this.first = pending.next;
      this.count--;
      batch.push(pending.value);
    }
    if (!this.first) this.last = undefined;
    return batch;
  }

  publish(platform: IPlatformService, rendererInstanceId: string): void {
    while (this.first) {
      const batch = this.detachBatch();
      try {
        platform.reportLocalTtftBatch?.({
          version: 1,
          rendererInstanceId,
          sequence: this.sequence++,
          records: batch,
          dropped: this.dropped,
        });
        this.dropped = 0;
      } catch {
        this.dropped += batch.length;
      }
    }
  }

  clear(): void {
    this.first = undefined;
    this.last = undefined;
    this.count = 0;
  }
}

class DesktopTtftLifetime {
  private readonly rendererInstanceId = crypto.randomUUID();
  private readonly delivery = new LocalTtftDelivery();
  private readonly observer = new LocalTtftObserver(
    (record) => this.delivery.offer(record),
    undefined,
    undefined,
    () => document.visibilityState === "visible" && document.hasFocus(),
  );
  private stopConfiguration: (() => void) | undefined;
  private timer!: ReturnType<typeof setInterval>;
  private readonly applyConfiguration = (config: { localTtftEnabled?: boolean }) => {
    this.observer.enabled = config.localTtftEnabled === true;
  };
  private readonly background = () => this.observer.background();
  private readonly foreground = () => {
    if (document.visibilityState === "visible") this.observer.foreground();
  };
  private readonly visibilityChanged = () => {
    if (document.visibilityState === "visible") this.foreground();
    else this.background();
  };
  private readonly flush = () => {
    this.observer.sampleClock();
    this.observer.expire();
    this.delivery.publish(this.platform, this.rendererInstanceId);
  };

  constructor(private readonly platform: IPlatformService) {}

  publish(): void {
    setLocalTtftObserver(this.observer);
    void this.platform.getRendererActionTraceConfig!()
      .then(this.applyConfiguration)
      .catch(() => {});
    this.stopConfiguration = this.platform.onRendererActionTraceConfigChanged?.(
      this.applyConfiguration,
    );
    if (!document.hasFocus() || document.visibilityState !== "visible") this.background();
    window.addEventListener("blur", this.background);
    window.addEventListener("focus", this.foreground);
    document.addEventListener("visibilitychange", this.visibilityChanged);
    this.timer = setInterval(this.flush, 1000);
  }

  release(): void {
    this.observer.interrupt();
    this.flush();
    this.delivery.clear();
    clearInterval(this.timer);
    const stopConfiguration = this.stopConfiguration;
    stopConfiguration?.();
    setLocalTtftObserver(undefined);
    window.removeEventListener("blur", this.background);
    window.removeEventListener("focus", this.foreground);
    document.removeEventListener("visibilitychange", this.visibilityChanged);
  }
}

/** Disabling collection affects new inputs; finished observations keep delivery. */
export function initializeDesktopLocalTtft(platform: IPlatformService): () => void {
  if (!platform.reportLocalTtftBatch || !platform.getRendererActionTraceConfig) return () => {};
  const lifetime = new DesktopTtftLifetime(platform);
  lifetime.publish();
  return () => lifetime.release();
}
