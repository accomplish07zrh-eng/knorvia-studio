import type { StudioRun, StudioWorkspaceChange } from "@knorvia/services";
import { studioReviewApplicablePaths, studioReviewSelection } from "./studioWorkspaceDiff.js";

export interface StudioHistoryReview {
  run: StudioRun;
  stepId: string;
  changes?: StudioWorkspaceChange[];
  loading: boolean;
  applying?: string;
  /** 批量应用进行中的哨兵值；单文件应用时是具体路径。 */
  selected: string[];
  error: string;
  readAfterApplyFailed?: boolean;
}
interface HistorySnapshot {
  busy: ReadonlySet<string>;
  error: string;
  review: StudioHistoryReview | null;
}
/** 批量应用正在进行的显示标记；不是文件路径。 */
export const STUDIO_BATCH_APPLY = "*";
const empty = (): HistorySnapshot => ({ busy: new Set(), error: "", review: null });
const diagnostic = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** 是否正在应用该卡片（单文件或批量都会禁用卡片）。 */
export function studioReviewApplying(review: StudioHistoryReview, path: string): boolean {
  return review.applying === path || review.applying === STUDIO_BATCH_APPLY;
}

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
    // 选择集随复核一起销毁：关闭弹窗不会把旧选择带进下一次提交。
    this.update({ review: null });
  }
  async openReview(run: StudioRun, stepId: string, load: () => Promise<StudioWorkspaceChange[]>) {
    if (!this.active || this.snapshot.review?.loading || this.snapshot.review?.applying) return;
    this.reviewGeneration++;
    this.update({ review: { run, stepId, error: "", loading: false, selected: [] } });
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
          review: {
            ...review,
            changes,
            selected: studioReviewSelection(changes, review.selected),
            loading: false,
            error: "",
            readAfterApplyFailed: false,
          },
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
  /** 勾选/取消一张卡片；不可应用的卡片不进入选择集。 */
  toggleReviewSelection(path: string) {
    const review = this.snapshot.review;
    if (!this.active || !review || review.loading || review.applying) return;
    if (!studioReviewApplicablePaths(review.changes ?? []).includes(path)) return;
    const selected = review.selected.includes(path)
      ? review.selected.filter((item) => item !== path)
      : [...review.selected, path];
    this.update({ review: { ...review, selected } });
  }
  /** 全选/清空：只接受当前可应用的路径。 */
  setReviewSelection(paths: readonly string[]) {
    const review = this.snapshot.review;
    if (!this.active || !review || review.loading || review.applying) return;
    const applicable = new Set(studioReviewApplicablePaths(review.changes ?? []));
    this.update({
      review: {
        ...review,
        selected: [...new Set(paths)].filter((path) => applicable.has(path)),
      },
    });
  }
  async applyReview(
    path: string,
    apply: () => Promise<void>,
    load: () => Promise<StudioWorkspaceChange[]>,
  ) {
    await this.applyPaths([path], () => apply(), load);
  }
  /** 多选批量应用：一次提交一个 `paths[]`。 */
  async applyReviewSelection(
    apply: (paths: string[]) => Promise<void>,
    load: () => Promise<StudioWorkspaceChange[]>,
  ) {
    const review = this.snapshot.review;
    if (!this.active || !review || review.loading || review.applying) return;
    const applicable = new Set(studioReviewApplicablePaths(review.changes ?? []));
    const paths = review.selected.filter((path) => applicable.has(path));
    if (!paths.length) return;
    await this.applyPaths(paths, apply, load);
  }
  private async applyPaths(
    paths: string[],
    apply: (paths: string[]) => Promise<void>,
    load: () => Promise<StudioWorkspaceChange[]>,
  ) {
    const review = this.snapshot.review;
    if (!this.active || !review || review.loading || review.applying) return;
    const generation = this.reviewGeneration;
    let applied = false;
    this.update({
      review: {
        ...review,
        applying: paths.length === 1 ? paths[0] : STUDIO_BATCH_APPLY,
        error: "",
        readAfterApplyFailed: false,
      },
    });
    try {
      await apply(paths);
      applied = true;
      // 已受理的应用仍会完成；关闭或重开弹窗后不再读取并回填旧检查结果。
      if (!this.currentReview(generation)) return;
      const changes = await load();
      if (this.currentReview(generation))
        this.update({
          review: {
            ...review,
            changes,
            selected: studioReviewSelection(changes, review.selected),
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
