// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
/** 释放钩子。接口只约定一个无参方法，具体释放逻辑由各自实现给出。 */
export type IDisposable = { dispose(): void };

/** 把「一次性回调」包成幂等的 disposable：第二次调用不再是副作用。 */
export function toDisposable(callback: () => void): IDisposable {
  let armed = true;
  return {
    dispose: () => {
      if (!armed) return;
      armed = false;
      callback();
    },
  };
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

  readonly event: Event<T> = (listener) => {
    if (this.#retired) return toDisposable(() => {});
    const opening = this.#next.size === 0;
    this.#next.add(listener);
    if (opening) this.#hooks?.onWillAddFirstListener?.();
    return toDisposable(() => {
      this.#next.delete(listener);
      if (this.#next.size === 0) this.#hooks?.onDidRemoveLastListener?.();
    });
  };

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

/** 单输入单输出的转发器：换输入时先断开旧订阅。 */
export class Relay<T> implements IDisposable {
  readonly #hub = new Emitter<T>();
  readonly event: Event<T> = this.#hub.event;
  #upstream: IDisposable | undefined;

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

/** 多路合并：每个 add 返回的 disposable 同时负责断开与记账。 */
export class EventMultiplexer<T> implements IDisposable {
  readonly #hub = new Emitter<T>();
  readonly #feeds = new DisposableStore();
  readonly event: Event<T> = this.#hub.event;

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
