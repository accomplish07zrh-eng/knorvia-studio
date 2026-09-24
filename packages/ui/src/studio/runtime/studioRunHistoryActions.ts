import type { StudioRun, StudioWorkspaceChange } from "@knorvia/services";

export interface StudioHistoryReview {
  run: StudioRun;
  stepId: string;
  changes?: StudioWorkspaceChange[];
  loading: boolean;
  applying?: string;
  error: string;
  readAfterApplyFailed?: boolean;
}
interface HistorySnapshot {
  busy: ReadonlySet<string>;
  error: string;
  review: StudioHistoryReview | null;
}
const empty = (): HistorySnapshot => ({ busy: new Set(), error: "", review: null });
const diagnostic = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Owns only this target/service's transient UI; accepted work remains owned by the backend. */
export class StudioRunHistoryActions {
  private snapshot = empty();
  private listeners = new Set<() => void>();
  private scope = 0;
  private reviewGeneration = 0;
  private active = true;
  subscribe = (listener: () => void) => {
    this.active = true;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.active = false;
        this.scope++;
        this.reviewGeneration++;
        this.snapshot = empty();
      }
    };
  };
  getSnapshot = () => this.snapshot;
  observeRuns(runs: StudioRun[]) {
    const keys = new Set(
      runs.flatMap((run) => [`stop:${run.id}:${run.attempt}`, `retry:${run.id}:${run.attempt}`]),
    );
    const busy = new Set([...this.snapshot.busy].filter((key) => keys.has(key)));
    if (busy.size !== this.snapshot.busy.size) this.update({ busy });
  }
  private update(next: Partial<HistorySnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }
  async action(
    key: string,
    operation: (isCurrent: () => boolean) => Promise<unknown>,
    retainBusy = false,
  ) {
    if (!this.active || this.snapshot.busy.has(key)) return;
    const scope = this.scope;
    const isCurrent = () => this.active && this.scope === scope;
    this.update({ busy: new Set([...this.snapshot.busy, key]), error: "" });
    let succeeded = false;
    try {
      await operation(isCurrent);
      succeeded = true;
    } catch (error) {
      if (isCurrent()) this.update({ error: diagnostic(error) });
    } finally {
      if (isCurrent() && (!retainBusy || !succeeded)) {
        const busy = new Set(this.snapshot.busy);
        busy.delete(key);
        this.update({ busy });
      }
    }
  }
  closeReview() {
    this.reviewGeneration++;
    this.update({ review: null });
  }
  async openReview(run: StudioRun, stepId: string, load: () => Promise<StudioWorkspaceChange[]>) {
    if (!this.active || this.snapshot.review?.loading || this.snapshot.review?.applying) return;
    this.reviewGeneration++;
    this.update({ review: { run, stepId, error: "", loading: false } });
    await this.reloadReview(load);
  }
  async reloadReview(load: () => Promise<StudioWorkspaceChange[]>) {
    const review = this.snapshot.review;
    if (!this.active || !review || review.loading || review.applying) return;
    const generation = this.reviewGeneration;
    this.update({ review: { ...review, loading: true, error: "", readAfterApplyFailed: false } });
    try {
      const changes = await load();
      if (this.currentReview(generation))
        this.update({
          review: { ...review, changes, loading: false, error: "", readAfterApplyFailed: false },
        });
    } catch (error) {
      if (this.currentReview(generation))
        this.update({
          review: {
            ...review,
            loading: false,
            error: diagnostic(error),
            readAfterApplyFailed: false,
          },
        });
    }
  }
  async applyReview(
    path: string,
    apply: () => Promise<void>,
    load: () => Promise<StudioWorkspaceChange[]>,
  ) {
    const review = this.snapshot.review;
    if (!this.active || !review || review.loading || review.applying) return;
    const generation = this.reviewGeneration;
    let applied = false;
    this.update({ review: { ...review, applying: path, error: "", readAfterApplyFailed: false } });
    try {
      await apply();
      applied = true;
      // 已受理的应用仍会完成；关闭或重开弹窗后不再读取并回填旧检查结果。
      if (!this.currentReview(generation)) return;
      const changes = await load();
      if (this.currentReview(generation))
        this.update({
          review: {
            ...review,
            changes,
            applying: undefined,
            error: "",
            readAfterApplyFailed: false,
          },
        });
    } catch (error) {
      if (this.currentReview(generation))
        this.update({
          review: {
            ...review,
            applying: undefined,
            error: diagnostic(error),
            readAfterApplyFailed: applied,
          },
        });
    }
  }
  private currentReview(generation: number) {
    return this.active && this.reviewGeneration === generation && this.snapshot.review !== null;
  }
}
