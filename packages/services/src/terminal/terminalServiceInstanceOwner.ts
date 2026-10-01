// Source-exposed lifecycle reconstruction; corrective policy is specified separately from the frozen baseline.
import { Emitter, type Event, type IDisposable } from "@knorvia/rpc";
import type { IPty } from "node-pty";

type Phase = "creating" | "open" | "retiring" | "retry" | "closed";
type SubscriptionKind = "data" | "exit";
interface Reservation {
  readonly id: string;
  readonly generation: number;
  phase: Phase;
  published: boolean;
  exited: boolean;
  killing: boolean;
  cleaning: boolean;
  data?: Emitter<string>;
  exit?: Emitter<number>;
  pty?: IPty;
  readonly subscriptions: Map<IDisposable, SubscriptionKind>;
}

function throwCollected(errors: unknown[], message?: string): void {
  if (errors.length === 0) return;
  if (errors.length === 1) throw errors[0];
  const primary = errors[0];
  throw new AggregateError(
    errors,
    message ?? (primary instanceof Error ? primary.message : String(primary)),
    { cause: primary },
  );
}

/** Owns pending leases, native resources, public admission and the diagnostic registration. */
export class TerminalServiceInstanceOwner {
  private sequence = 0;
  private generation = 0;
  private readonly owned = new Map<string, Reservation>();
  private diagnostics?: IDisposable;
  private retireDiagnosticsWhenIdle = false;

  constructor(private readonly registerDiagnostics: (read: () => { open: number }) => IDisposable) {
    this.refreshDiagnostics();
  }

  get count(): number {
    let live = 0;
    for (const entry of this.owned.values()) if (entry.pty && !entry.exited) live++;
    return live;
  }

  reserve(): Reservation {
    const entry: Reservation = {
      id: String(this.sequence++),
      generation: this.generation,
      phase: "creating",
      published: false,
      exited: false,
      killing: false,
      cleaning: false,
      subscriptions: new Map(),
    };
    this.owned.set(entry.id, entry);
    this.retireDiagnosticsWhenIdle = false;
    this.refreshDiagnostics();
    return entry;
  }

  assertCreating(entry: Reservation): void {
    if (entry.generation !== this.generation) {
      throw new Error(`Terminal creation cancelled: ${entry.id}`);
    }
    if (entry.exited) throw new Error(`Terminal exited during startup: ${entry.id}`);
    if (entry.phase !== "creating") {
      throw new Error(`Terminal creation cancelled: ${entry.id}`);
    }
  }

  prepare(entry: Reservation): void {
    this.assertCreating(entry);
    entry.data = new Emitter<string>();
    entry.exit = new Emitter<number>();
  }

  attach(entry: Reservation, pty: IPty): void {
    // spawn 期间可重入 disposeAll；返回的活 PTY 必须先收归所有者，不能因旧 lease 失效而丢失。
    entry.pty = pty;
    this.owned.set(entry.id, entry);
    this.refreshDiagnostics();
    this.assertCreating(entry);
    this.retain(
      entry,
      "data",
      pty.onData((data) => {
        if (!entry.exited && entry.phase !== "closed") entry.data?.fire(data);
      }),
    );
    this.assertCreating(entry);
    this.retain(
      entry,
      "exit",
      pty.onExit(({ exitCode }) => this.nativeExit(entry, exitCode)),
    );
    this.assertCreating(entry);
  }

  publish(entry: Reservation): void {
    this.assertCreating(entry);
    entry.phase = "open";
    entry.published = true;
    // 一个 Map 同时保留旧的完成/发布顺序，不能让 reservation 顺序改变正常 bulk 清理次序。
    this.owned.delete(entry.id);
    this.owned.set(entry.id, entry);
  }

  fail(entry: Reservation, primary: unknown): never {
    throwCollected([primary, ...this.stop(entry, entry.phase !== "retry")]);
    throw primary;
  }

  write(params: { id: string; data: string }): void {
    this.lookup(params.id).pty!.write(params.data);
  }

  resize(params: { id: string; cols: number; rows: number }): void {
    this.lookup(params.id).pty!.resize(params.cols, params.rows);
  }

  dataEvent(id: string): Event<string> {
    return this.lookup(id).data!.event;
  }

  exitEvent(id: string): Event<number> {
    return this.lookup(id).exit!.event;
  }

  dispose(id: string): void {
    const entry = this.owned.get(id);
    if (entry) throwCollected(this.stop(entry));
  }

  disposeAll(): void {
    // 在任何外部 kill/dispose 前切断旧 create 的发布资格；之后的新 reserve 属于合法复用。
    this.generation++;
    this.retireDiagnosticsWhenIdle = true;
    const snapshot = [...this.owned.values()];
    const errors: unknown[] = [];
    for (const entry of snapshot) errors.push(...this.stop(entry));
    this.refreshDiagnostics();
    throwCollected(errors, "Failed to dispose all terminals");
  }

  private lookup(id: string): Reservation {
    const entry = this.owned.get(id);
    // root 的合成重入复现证明 published 在 exit/kill 通知期间仍为 true；必须先按 phase/exit 拒绝 IO。
    if (!entry?.published || entry.phase !== "open" || entry.exited) {
      throw new Error(`Terminal not found: ${id}`);
    }
    return entry;
  }

  private nativeExit(entry: Reservation, code: number): void {
    if (entry.exited || entry.phase === "closed") return;
    // 先记终止再通知，阻止重入 exit/dispose 再杀进程；listener 异常不能中断资源清理。
    entry.exited = true;
    entry.phase = "retiring";
    const errors: unknown[] = [];
    try {
      entry.exit?.fire(code);
    } catch (error) {
      errors.push(error);
    } finally {
      entry.published = false;
      errors.push(...this.clean(entry));
      this.settle(entry);
    }
    throwCollected(errors);
  }

  private stop(entry: Reservation, retryKill = true): unknown[] {
    if (entry.killing || entry.cleaning) return [];
    const errors: unknown[] = [];
    entry.phase = "retiring";
    if (entry.pty && !entry.exited && retryKill) {
      entry.killing = true;
      try {
        entry.pty.kill();
        entry.exited = true;
      } catch (error) {
        errors.push(error);
      } finally {
        entry.killing = false;
      }
    }
    entry.published = false;
    errors.push(...this.clean(entry));
    this.settle(entry);
    return errors;
  }

  private retain(
    entry: Reservation,
    kind: SubscriptionKind,
    subscription: IDisposable | undefined,
  ): void {
    // 部分旧 fake ports 不返回 handle；真实 node-pty 返回的每个 handle 都归同一所有者。
    if (!subscription) return;
    entry.subscriptions.set(subscription, kind);
    if (entry.exited || entry.phase === "closed" || entry.phase === "retiring") {
      const errors = this.clean(entry);
      this.settle(entry);
      throwCollected(errors);
    }
  }

  private clean(entry: Reservation): unknown[] {
    if (entry.cleaning) return [];
    entry.cleaning = true;
    const errors: unknown[] = [];
    try {
      this.cleanEmitter(
        entry.data,
        (value) => {
          entry.data = value;
        },
        errors,
      );
      this.cleanEmitter(
        entry.exit,
        (value) => {
          entry.exit = value;
        },
        errors,
      );
      // 固定快照：失败 handle 放回等待显式重试，直接迭代会再次访问它而形成死循环。
      const subscriptions = [...entry.subscriptions];
      for (const [subscription, kind] of subscriptions) {
        // root 用实际 WinPTY JS 证明 kill 可在原生 teardown 后抛错；未确认 exit 时必须保留内部监视。
        // 每次重查 exited：前一个 disposer 可重入 exit；公共 emitter/data 仍按旧顺序退役。
        if (kind === "exit" && entry.pty && !entry.exited) continue;
        entry.subscriptions.delete(subscription);
        try {
          subscription.dispose();
        } catch (error) {
          entry.subscriptions.set(subscription, kind);
          errors.push(error);
        }
      }
    } finally {
      entry.cleaning = false;
    }
    return errors;
  }

  private cleanEmitter<T>(
    emitter: Emitter<T> | undefined,
    replace: (value: Emitter<T> | undefined) => void,
    errors: unknown[],
  ): void {
    if (!emitter) return;
    replace(undefined);
    try {
      emitter.dispose();
    } catch (error) {
      replace(emitter);
      errors.push(error);
    }
  }

  private settle(entry: Reservation): void {
    if (entry.killing || entry.cleaning) return;
    const live = Boolean(entry.pty && !entry.exited);
    if (live || entry.data || entry.exit || entry.subscriptions.size) {
      entry.phase = "retry";
      this.owned.set(entry.id, entry);
    } else {
      entry.phase = "closed";
      if (this.owned.get(entry.id) === entry) this.owned.delete(entry.id);
    }
    this.refreshDiagnostics();
  }

  private refreshDiagnostics(): void {
    if (this.retireDiagnosticsWhenIdle && this.owned.size === 0) {
      this.diagnostics?.dispose();
      this.diagnostics = undefined;
    } else if (!this.diagnostics) {
      this.diagnostics = this.registerDiagnostics(() => ({ open: this.count }));
    }
  }
}
