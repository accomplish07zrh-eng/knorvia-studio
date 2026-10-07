/** Owns transient action feedback only; durable admission and read state remain on the Host. */
export class StudioAttentionActions {
  private state: { busy: ReadonlySet<string>; error: string } = { busy: new Set(), error: "" };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private navigation = 0;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.epoch++;
        this.navigation++;
        this.state = { busy: new Set(), error: "" };
      }
    };
  };
  getSnapshot = () => this.state;
  private update(state: typeof this.state) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  async perform(key: string, open: boolean, operation: (current: () => boolean) => Promise<void>) {
    if (!this.listeners.size || this.state.busy.has(key)) return;
    const epoch = this.epoch;
    const navigation = open ? ++this.navigation : this.navigation;
    const current = () =>
      this.listeners.size > 0 && epoch === this.epoch && (!open || navigation === this.navigation);
    this.update({ busy: new Set([...this.state.busy, key]), error: "" });
    try {
      await operation(current);
    } catch (error) {
      if (current())
        this.update({
          ...this.state,
          error: error instanceof Error ? error.message : String(error),
        });
    } finally {
      if (epoch === this.epoch && this.listeners.size) {
        const busy = new Set(this.state.busy);
        busy.delete(key);
        this.update({ ...this.state, busy });
      }
    }
  }
}
