// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors

/** Owns admission and a shared completion barrier, not application session state. */
export class RuntimeLifetime {
  readonly #cancellation = new AbortController();
  readonly #handlers = new Set<Promise<unknown>>();
  #closing?: Promise<void>;

  get signal(): AbortSignal {
    return this.#cancellation.signal;
  }

  accept<T>(operation: () => Promise<T>): Promise<T> {
    if (this.signal.aborted) return Promise.reject(this.signal.reason);
    // Register before invoking user code so a reentrant close also waits for this handler.
    const handler = Promise.resolve().then(() => {
      this.signal.throwIfAborted();
      return operation();
    });
    this.#handlers.add(handler);
    const release = () => {
      this.#handlers.delete(handler);
    };
    void handler.then(release, release);
    return handler;
  }

  close(cleanups: ReadonlyArray<() => unknown>): Promise<void> {
    if (this.#closing) return this.#closing;
    const completion = Promise.withResolvers<void>();
    this.#closing = completion.promise;
    // 取消只是关闭开始；重复 dispose 必须等同一完成屏障，不能提前报告释放成功。
    this.#cancellation.abort(new Error("node_repl runtime is disposed"));
    const releases = cleanups.map((cleanup) => Promise.resolve().then(cleanup));
    // Native disposal may unblock a handler, so start cleanup before awaiting handlers.
    void Promise.allSettled([...this.#handlers, ...releases]).then(() => completion.resolve());
    return this.#closing;
  }
}
