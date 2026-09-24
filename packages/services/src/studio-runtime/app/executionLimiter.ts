/** Runtime-only permits. Durable admission and ownership remain in the repository. */
export class StudioExecutionLimiter {
  private total = 0;
  private readonly keys = new Set<string>();
  private readonly waiters = new Set<() => void>();

  async acquire(key: string, signal: AbortSignal): Promise<() => void> {
    while (this.total >= 4 || this.keys.has(key)) {
      signal.throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        const finish = () => {
          this.waiters.delete(finish);
          signal.removeEventListener("abort", cancel);
          resolve();
        };
        const cancel = () => {
          this.waiters.delete(finish);
          signal.removeEventListener("abort", cancel);
          reject(signal.reason);
        };
        this.waiters.add(finish);
        signal.addEventListener("abort", cancel, { once: true });
      });
    }
    signal.throwIfAborted();
    this.total++;
    this.keys.add(key);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.total--;
      this.keys.delete(key);
      for (const notify of this.waiters) notify();
    };
  }
}
