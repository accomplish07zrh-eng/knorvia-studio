/** Keeps a dialog's late async results from updating a different mounted conversation. */
export class UiAsyncActionGate {
  private generation = 0;
  private active = false;
  private running = false;

  get isRunning(): boolean {
    return this.running;
  }

  activate(): void {
    this.generation++;
    this.active = true;
    this.running = false;
  }

  deactivate(): void {
    this.generation++;
    this.active = false;
  }

  run<T>(
    work: () => Promise<T>,
    handlers: {
      onStart(): void;
      onSuccess(value: T): void;
      onError(error: unknown): void;
      onSettled(): void;
    },
  ): boolean {
    if (!this.active || this.running) return false;
    this.running = true;
    const generation = this.generation;
    handlers.onStart();
    void (async () => {
      try {
        const value = await work();
        if (this.active && this.generation === generation) handlers.onSuccess(value);
      } catch (error) {
        if (this.active && this.generation === generation) handlers.onError(error);
      } finally {
        if (this.active && this.generation === generation) {
          this.running = false;
          handlers.onSettled();
        }
      }
    })();
    return true;
  }
}
