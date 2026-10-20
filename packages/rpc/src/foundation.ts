// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
/** 释放钩子。接口只约定一个无参方法，具体释放逻辑由各自实现给出。 */
export type IDisposable = { dispose(): void };

/**
 * 只执行一次的释放包装。
 *
 * 用类而不是闭包工厂：`dispose` 的身份稳定，便于调用方在调试时识别同一个句柄；
 * `#armed` 私有字段也比闭包变量更容易在堆快照里看出「还没释放」。
 */
class OnceDisposable implements IDisposable {
  #armed = true;
  readonly #callback: () => void;

  constructor(callback: () => void) {
    this.#callback = callback;
  }

  dispose(): void {
    if (!this.#armed) return;
    this.#armed = false;
    this.#callback();
  }
}

/** 把「一次性回调」包成幂等的 disposable：第二次调用不再是副作用。 */
export function toDisposable(callback: () => void): IDisposable {
  return new OnceDisposable(callback);
}

/** 一组 disposable 的集合，按加入顺序在 dispose 时统一释放。 */
export class DisposableStore implements IDisposable {
  readonly #entries = new Set<IDisposable>();
  #closed = false;

  add<T extends IDisposable>(entry: T): T {
    if (this.#closed) {
      console.warn("Adding to a disposed DisposableStore");
      entry.dispose();
    } else {
      this.#entries.add(entry);
    }
    return entry;
  }

  dispose(): void {
    if (this.#closed) return;
    this.#closed = true;
    const drained = Array.from(this.#entries);
    this.#entries.clear();
    for (const entry of drained) entry.dispose();
  }
}

/** 监听器函数类型：收到值后由订阅方决定是否继续转发。 */
export type Event<T> = (listener: (payload: T) => void) => IDisposable;

type EmitterHooks = { onWillAddFirstListener?(): void; onDidRemoveLastListener?(): void };

export class Emitter<T> implements IDisposable {
  readonly #next = new Set<(payload: T) => void>();
  readonly #hooks: EmitterHooks | undefined;
  #retired = false;

  constructor(hooks?: EmitterHooks) {
    this.#hooks = hooks;
  }

  /**
   * 订阅入口。
   *
   * **必须是 getter，不能写成实例字段**：旧实现的 `get event()` 每次访问都返回一个新的
   * 闭包，因此 `emitter.event !== emitter.event`。有调用方依赖这个身份语义——services 的
   * `onDynamicData(id)` 每次返回不同的函数引用，其契约测试用 `notStrictEqual` 锁定。
   * 改成实例字段会让两次访问拿到同一个函数，属于对外可观察的行为变更（已在集成测试中抓到）。
   */
  get event(): Event<T> {
    return (listener) => this.#subscribe(listener);
  }

  /**
   * 注册一个监听器并返回退订句柄。
   *
   * 独立成私有方法而不是就地内联：`get event` 只负责「每次给一个新闭包」这一身份语义，
   * 注册/退订与首末监听器钩子的时序留在这里，两者职责分开后也便于在阅读时定位行为。
   */
  #subscribe(listener: (payload: T) => void): IDisposable {
    if (this.#retired) return toDisposable(() => {});
    const opening = this.#next.size === 0;
    this.#next.add(listener);
    if (opening) this.#hooks?.onWillAddFirstListener?.();
    return toDisposable(() => {
      this.#next.delete(listener);
      if (this.#next.size === 0) this.#hooks?.onDidRemoveLastListener?.();
    });
  }

  /** 对监听器快照迭代：本轮新增的监听器不会收到本次值。 */
  fire(payload: T): void {
    if (this.#retired) return;
    for (const listener of [...this.#next]) listener(payload);
  }

  dispose(): void {
    this.#retired = true;
    this.#next.clear();
  }
}

/**
 * 单输入单输出的转发器。
 *
 * 换输入时先断开旧订阅再挂新订阅，因此任意时刻最多只有一条上游连接。
 * `event` 与 `Emitter.event` 同语义（每次访问给新闭包）——**不能**把它写成
 * `readonly event = this.#hub.event`，那样会在构造时把第一个闭包固化下来，
 * 后续每次访问返回同一函数，破坏下游依赖的身份语义。
 */
export class Relay<T> implements IDisposable {
  readonly #hub = new Emitter<T>();
  #upstream: IDisposable | undefined;

  get event(): Event<T> {
    return this.#hub.event;
  }

  set input(source: Event<T>) {
    this.#detach();
    this.#upstream = source((payload) => this.#hub.fire(payload));
  }

  #detach(): void {
    const link = this.#upstream;
    this.#upstream = undefined;
    link?.dispose();
  }

  dispose(): void {
    this.#detach();
    this.#hub.dispose();
  }
}

/**
 * 多路合并器：把多个来源 Event 汇入同一出口。
 *
 * 每条 `add` 返回的 disposable 只负责断开该来源并把句柄记账到 `#feeds`；
 * 出口由内部 `#hub` 提供，因此「谁加入、谁退出」与「怎么转发」互不干扰。
 */
export class EventMultiplexer<T> implements IDisposable {
  readonly #hub = new Emitter<T>();
  readonly #feeds = new DisposableStore();

  /** 与 `Emitter.event` 同语义：每次访问给出新的订阅闭包（身份语义由下游依赖）。 */
  get event(): Event<T> {
    return this.#hub.event;
  }

  /** 接入一个来源；返回值负责把这条来源从合并流里摘掉。 */
  add(source: Event<T>): IDisposable {
    return this.#feeds.add(source((payload) => this.#hub.fire(payload)));
  }

  dispose(): void {
    this.#feeds.dispose();
    this.#hub.dispose();
  }
}

export namespace Event {
  const never: Event<any> = () => toDisposable(() => {});

  export const None: Event<any> = never;

  /** 只转发第一个值，随后自己断开源头。 */
  export function once<E>(source: Event<E>): Event<E> {
    return (listener) => {
      let spent = false;
      let link: IDisposable | undefined;
      link = source((payload) => {
        if (spent) return;
        spent = true;
        link?.dispose();
        link = undefined;
        listener(payload);
      });
      return link;
    };
  }

  export function toPromise<E>(source: Event<E>): Promise<E> {
    return new Promise<E>((resolve) => once(source)(resolve));
  }

  export function filter<E>(source: Event<E>, predicate: (payload: E) => boolean): Event<E> {
    return (listener) => source((payload) => (predicate(payload) ? listener(payload) : undefined));
  }

  export function map<E, R>(source: Event<E>, transform: (payload: E) => R): Event<R> {
    return (listener) => source((payload) => listener(transform(payload)));
  }
}

export type CancellationToken = Readonly<{
  isCancellationRequested: boolean;
  onCancellationRequested: Event<void>;
}>;

const NEVER_CANCELLED: CancellationToken = {
  isCancellationRequested: false,
  onCancellationRequested: Event.None,
};

export namespace CancellationToken {
  export const None: CancellationToken = NEVER_CANCELLED;
}

/**
 * 取消源。token 的 `isCancellationRequested` 按合同恒为 false（旧行为，见
 * known-differences）；真正可观察的是 `onCancellationRequested` 事件。
 *
 * `#token` 缓存是刻意的：同一个 source 的 `token` 必须是稳定身份（调用方会把
 * `onCancellationRequested` 的退订句柄与 token 一起记账）。这里把事件也在首次
 * 取用时固定下来，与旧实现一致。
 */
export class CancellationTokenSource implements IDisposable {
  readonly #signal = new Emitter<void>();
  #cancelled = false;
  #token: CancellationToken | undefined;

  get token(): CancellationToken {
    if (this.#token === undefined) {
      this.#token = {
        isCancellationRequested: false,
        onCancellationRequested: this.#signal.event,
      };
    }
    return this.#token;
  }

  cancel(): void {
    if (this.#cancelled) return;
    this.#cancelled = true;
    this.#signal.fire(undefined);
  }

  dispose(): void {
    this.#signal.dispose();
  }
}
