import type {
  IStudioRuntimeService,
  StudioCommand,
  StudioOverview,
  StudioTimeline,
} from "@knorvia/services";
import { mergeStudioTimelinePage } from "./studioTimelinePagination.js";

export type CommandInput = StudioCommand extends infer C
  ? C extends StudioCommand
    ? Omit<C, "commandId">
    : never
  : never;
interface Snapshot {
  overview?: StudioOverview;
  timelines: ReadonlyMap<string, StudioTimeline>;
  timelineErrors: ReadonlyMap<string, string>;
  error?: string;
}
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
let nextConnection = 0;

/** One cache per service connection. Watched chats are pinned; inactive histories are bounded. */
export class StudioClient {
  readonly connectionKey = ++nextConnection;
  snapshot: Snapshot = { timelines: new Map(), timelineErrors: new Map() };
  private listeners = new Set<() => void>();
  private targets = new Map<string, number>();
  private recent = new Map<string, number>();
  private clock = 0;
  private unsubscribe?: { dispose(): void };
  private timer?: ReturnType<typeof setTimeout>;
  private watchdog?: ReturnType<typeof setInterval>;
  private refreshing?: Promise<void>;
  private rerun = false;
  private older = new Map<string, Promise<void>>();
  private attempts = new Map<string, { command: StudioCommand; pending?: Promise<unknown> }>();
  constructor(readonly service?: IStudioRuntimeService) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1 && this.service) {
      this.unsubscribe = this.service.onDidChange(this.schedule);
      this.watchdog = setInterval(this.schedule, 5000);
      this.schedule();
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.unsubscribe?.dispose();
        this.unsubscribe = undefined;
        clearTimeout(this.timer);
        clearInterval(this.watchdog);
        this.timer = undefined;
        this.watchdog = undefined;
        this.rerun = false;
      }
    };
  };
  getSnapshot = () => this.snapshot;
  isReady(target?: string): boolean {
    return Boolean(
      this.service &&
      this.snapshot.overview &&
      !this.snapshot.error &&
      (!target ||
        (this.snapshot.timelines.has(target) && !this.snapshot.timelineErrors.has(target))),
    );
  }
  private notify() {
    for (const listener of this.listeners) listener();
  }
  private prune() {
    const inactive = [
      ...new Set([...this.snapshot.timelines.keys(), ...this.snapshot.timelineErrors.keys()]),
    ]
      .filter((id) => !this.targets.has(id))
      .sort((a, b) => (this.recent.get(b) ?? 0) - (this.recent.get(a) ?? 0));
    if (inactive.length <= 12) return;
    const timelines = new Map(this.snapshot.timelines);
    const timelineErrors = new Map(this.snapshot.timelineErrors);
    for (const id of inactive.slice(12)) {
      timelines.delete(id);
      timelineErrors.delete(id);
      this.recent.delete(id);
    }
    this.snapshot = { ...this.snapshot, timelines, timelineErrors };
  }
  watch(target?: string) {
    if (!target) return () => {};
    this.targets.set(target, (this.targets.get(target) ?? 0) + 1);
    this.recent.set(target, ++this.clock);
    this.schedule();
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      const count = (this.targets.get(target) ?? 1) - 1;
      if (count) this.targets.set(target, count);
      else {
        this.targets.delete(target);
        if (this.snapshot.timelines.has(target) || this.snapshot.timelineErrors.has(target))
          this.recent.set(target, ++this.clock);
        else this.recent.delete(target);
        this.prune();
        this.notify();
      }
    };
  }
  schedule = () => {
    if (!this.listeners.size || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.refresh();
    }, 100);
  };
  refresh = (): Promise<void> => {
    if (!this.service) return Promise.resolve();
    if (this.refreshing) {
      this.rerun = true;
      return this.refreshing;
    }
    const service = this.service;
    const ids = [...this.targets.keys()];
    this.refreshing = (async () => {
      const [overview, ...pages] = await Promise.allSettled([
        service.overview(),
        ...ids.map((id) => service.timeline(id)),
      ]);
      const timelines = new Map(this.snapshot.timelines);
      const timelineErrors = new Map(this.snapshot.timelineErrors);
      pages.forEach((result, index) => {
        const id = ids[index]!;
        // An evicted/unmounted target must not be resurrected by a late response.
        if (!this.targets.has(id) && !timelines.has(id) && !timelineErrors.has(id)) return;
        if (result.status === "fulfilled") {
          timelines.set(
            id,
            mergeStudioTimelinePage(timelines.get(id), result.value as StudioTimeline),
          );
          timelineErrors.delete(id);
        } else timelineErrors.set(id, errorMessage(result.reason));
      });
      const nextOverview =
        overview?.status === "fulfilled" ? (overview.value as StudioOverview) : undefined;
      this.snapshot = {
        overview:
          nextOverview &&
          (!this.snapshot.overview || nextOverview.revision >= this.snapshot.overview.revision)
            ? nextOverview
            : this.snapshot.overview,
        timelines,
        timelineErrors,
        error: overview?.status === "rejected" ? errorMessage(overview.reason) : undefined,
      };
      this.prune();
    })().finally(() => {
      this.refreshing = undefined;
      this.notify();
      if (this.rerun) {
        this.rerun = false;
        this.schedule();
      }
    });
    return this.refreshing;
  };
  loadOlder(target: string): Promise<void> {
    const pending = this.older.get(target);
    if (pending) return pending;
    const old = this.snapshot.timelines.get(target);
    if (!this.service || old?.nextBefore === undefined) return Promise.resolve();
    const before = old.nextBefore;
    const request = this.service
      .timeline(target, before)
      .then((page) => {
        if (!this.snapshot.timelines.has(target)) return;
        const timelines = new Map(this.snapshot.timelines);
        timelines.set(target, mergeStudioTimelinePage(timelines.get(target), page, before));
        const timelineErrors = new Map(this.snapshot.timelineErrors);
        timelineErrors.delete(target);
        this.snapshot = { ...this.snapshot, timelines, timelineErrors };
      })
      .catch((error: unknown) => {
        if (!this.snapshot.timelines.has(target)) return;
        const timelineErrors = new Map(this.snapshot.timelineErrors);
        timelineErrors.set(target, errorMessage(error));
        this.snapshot = { ...this.snapshot, timelineErrors };
      })
      .finally(() => {
        this.older.delete(target);
        this.notify();
      });
    this.older.set(target, request);
    return request;
  }
  async execute(input: CommandInput) {
    if (!this.service) throw new Error("此连接不支持 Studio 运行服务");
    const key = JSON.stringify(input);
    const attempt = this.attempts.get(key) ?? {
      command: { ...input, commandId: crypto.randomUUID() } as StudioCommand,
    };
    if (attempt.pending) return attempt.pending;
    this.attempts.set(key, attempt);
    attempt.pending = this.service.command(attempt.command);
    try {
      const result = await attempt.pending;
      this.attempts.delete(key);
      this.schedule();
      return result;
    } catch (error) {
      attempt.pending = undefined;
      throw error;
    }
  }
}
