import type { ProviderSource } from "../src/sources.js";
import type {
  PersonalProviderConfigRepository,
  ProviderConfigLayerSnapshot,
  ProviderConfigLayerUpdate,
} from "../src/config-service.js";

export class FakeSource<T> implements ProviderSource<T> {
  readonly listeners = new Set<(reason: string) => void>();
  readCount = 0;
  subscribeCount = 0;
  disposeCount = 0;
  readAction: (() => Promise<T>) | undefined;
  disposeFailure: Error | undefined;
  constructor(public snapshot: T) {}
  read(): Promise<T> {
    this.readCount++;
    return this.readAction?.() ?? Promise.resolve(this.snapshot);
  }
  onDidChange(listener: (reason: string) => void): () => void {
    this.subscribeCount++;
    this.listeners.add(listener);
    return () => {
      this.disposeCount++;
      if (this.disposeFailure) throw this.disposeFailure;
      this.listeners.delete(listener);
    };
  }
  emit(reason: string): void {
    for (const listener of this.listeners) listener(reason);
  }
}

export class FakePersonalRepository
  extends FakeSource<ProviderConfigLayerSnapshot>
  implements PersonalProviderConfigRepository
{
  updateCount = 0;
  readonly updates: ProviderConfigLayerUpdate[] = [];
  updateFailure: Error | undefined;
  async update(
    transform: (current: ProviderConfigLayerSnapshot) => ProviderConfigLayerUpdate,
  ): Promise<ProviderConfigLayerSnapshot> {
    this.updateCount++;
    if (this.updateFailure) throw this.updateFailure;
    const next = transform(this.snapshot);
    this.updates.push(next);
    this.snapshot = Object.freeze({
      ...next,
      revision: `synthetic-personal:${this.updates.length}`,
    });
    this.emit("write");
    return this.snapshot;
  }
}

export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export async function flush(): Promise<void> {
  for (let step = 0; step < 20; step++) await Promise.resolve();
}
