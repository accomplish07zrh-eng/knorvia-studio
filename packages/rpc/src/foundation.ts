export interface IDisposable {
  dispose(): void;
}

export function toDisposable(fn: () => void): IDisposable {
  let disposed = false;
  return {
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      fn();
    },
  };
}

export class DisposableStore implements IDisposable {
  private readonly items = new Set<IDisposable>();
  private disposed = false;

  add<T extends IDisposable>(item: T): T {
    if (this.disposed) {
      console.warn("Adding to a disposed DisposableStore");
      item.dispose();
      return item;
    }
    this.items.add(item);
    return item;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const item of this.items) {
      item.dispose();
    }
    this.items.clear();
  }
}

export type Event<T> = (listener: (e: T) => void) => IDisposable;

export namespace Event {
  export const None: Event<any> = () => ({ dispose() {} });

  export function once<T>(event: Event<T>): Event<T> {
    return (listener) => {
      let fired = false;
      const disposable = event((value) => {
        if (!fired) {
          fired = true;
          disposable.dispose();
          listener(value);
        }
      });
      return disposable;
    };
  }

  export function toPromise<T>(event: Event<T>): Promise<T> {
    return new Promise((resolve) => once(event)(resolve));
  }

  export function filter<T>(event: Event<T>, fn: (value: T) => boolean): Event<T> {
    return (listener) =>
      event((value) => {
        if (fn(value)) {
          listener(value);
        }
      });
  }

  export function map<T, R>(event: Event<T>, fn: (value: T) => R): Event<R> {
    return (listener) => event((value) => listener(fn(value)));
  }
}

interface EmitterOptions {
  onWillAddFirstListener?: () => void;
  onDidRemoveLastListener?: () => void;
}

export class Emitter<T> implements IDisposable {
  private readonly listeners = new Set<(e: T) => void>();
  private disposed = false;

  constructor(private readonly options?: EmitterOptions) {}

  get event(): Event<T> {
    return (listener) => {
      if (this.disposed) {
        return { dispose() {} };
      }

      const isFirst = this.listeners.size === 0;
      this.listeners.add(listener);
      if (isFirst) {
        this.options?.onWillAddFirstListener?.();
      }

      return toDisposable(() => {
        this.listeners.delete(listener);
        if (this.listeners.size === 0) {
          this.options?.onDidRemoveLastListener?.();
        }
      });
    };
  }

  fire(event: T): void {
    if (this.disposed) {
      return;
    }
    const snapshot = Array.from(this.listeners);
    for (const listener of snapshot) {
      listener(event);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }
}

export class Relay<T> implements IDisposable {
  private readonly emitter = new Emitter<T>();
  private inputDisposable: IDisposable = { dispose() {} };
  readonly event: Event<T> = this.emitter.event;

  set input(event: Event<T>) {
    this.inputDisposable.dispose();
    this.inputDisposable = event((value) => this.emitter.fire(value));
  }

  dispose(): void {
    this.inputDisposable.dispose();
    this.emitter.dispose();
  }
}

export class EventMultiplexer<T> implements IDisposable {
  private readonly emitter = new Emitter<T>();
  private readonly disposables: IDisposable[] = [];
  readonly event: Event<T> = this.emitter.event;

  add(event: Event<T>): IDisposable {
    const disposable = event((value) => this.emitter.fire(value));
    this.disposables.push(disposable);
    return disposable;
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.emitter.dispose();
  }
}

export interface CancellationToken {
  readonly isCancellationRequested: boolean;
  readonly onCancellationRequested: Event<void>;
}

export namespace CancellationToken {
  export const None: CancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: Event.None,
  };
}

export class CancellationTokenSource implements IDisposable {
  private cachedToken?: CancellationToken;
  private readonly emitter = new Emitter<void>();
  private cancelled = false;

  get token(): CancellationToken {
    if (!this.cachedToken) {
      this.cachedToken = {
        isCancellationRequested: false,
        onCancellationRequested: this.emitter.event,
      };
    }
    return this.cachedToken;
  }

  cancel(): void {
    if (!this.cancelled) {
      this.cancelled = true;
      this.emitter.fire(undefined);
    }
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
