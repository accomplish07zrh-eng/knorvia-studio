import { ProviderConfigMap } from "./config/index.js";
import type { AccountProviderStates } from "./account-provider-state.js";
import {
  createAccountProviderConfigSnapshot,
  createFailClosedAccountProviderConfigSnapshot,
  type AccountProviderConfigSnapshot,
  type ProviderConfigSnapshot,
  type ProviderSource,
} from "./sources.js";

export interface AccountProviderResolveInput {
  readonly configRevision: string;
  readonly configuredProviders: ProviderConfigMap;
  readonly previousProviders: ProviderConfigMap;
  readonly previousStates?: AccountProviderStates;
  readonly reasons?: readonly string[];
}

export type AccountProviderResolver = (input: AccountProviderResolveInput) => Promise<{
  readonly providers: ProviderConfigMap;
  readonly states: AccountProviderStates;
}>;

export interface AccountProviderServiceDependencies {
  readonly configSource: ProviderSource<ProviderConfigSnapshot>;
  readonly resolve: AccountProviderResolver;
}

export interface AccountProviderServiceRefreshErrorEvent {
  readonly error: unknown;
  readonly reasons: readonly string[];
}

interface RefreshWaiter {
  readonly generation: number;
  readonly resolve: (snapshot: AccountProviderConfigSnapshot) => void;
  readonly reject: (error: unknown) => void;
}

export class AccountProviderService implements ProviderSource<AccountProviderConfigSnapshot> {
  readonly #configSource: ProviderSource<ProviderConfigSnapshot>;
  readonly #resolve: AccountProviderResolver;
  readonly #pendingReasons = new Set<string>();
  readonly #changeListeners = new Set<(reason: string) => void>();
  readonly #errorListeners = new Set<(event: AccountProviderServiceRefreshErrorEvent) => void>();
  #started = false;
  #disposed = false;
  #sourceDisposer: (() => void) | null = null;
  #generation = 0;
  #waiters: RefreshWaiter[] = [];
  #snapshot: AccountProviderConfigSnapshot | undefined;
  #inFlight: Promise<AccountProviderConfigSnapshot> | undefined;

  constructor(dependencies: AccountProviderServiceDependencies) {
    this.#configSource = dependencies.configSource;
    this.#resolve = dependencies.resolve;
  }

  async read(): Promise<AccountProviderConfigSnapshot> {
    this.#assertActive();
    this.#ensureStarted();
    if (this.#snapshot !== undefined) {
      return this.#snapshot;
    }
    if (this.#inFlight !== undefined) {
      return this.#inFlight;
    }
    return this.#request("start");
  }

  refresh(reason = "explicit"): Promise<AccountProviderConfigSnapshot> {
    this.#assertActive();
    this.#ensureStarted();
    return this.#request(reason);
  }

  onDidChange(listener: (reason: string) => void): () => void {
    this.#changeListeners.add(listener);
    return () => this.#changeListeners.delete(listener);
  }

  onDidRefreshError(
    listener: (event: AccountProviderServiceRefreshErrorEvent) => void,
  ): () => void {
    this.#errorListeners.add(listener);
    return () => this.#errorListeners.delete(listener);
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    if (this.#sourceDisposer !== null) {
      this.#sourceDisposer();
    }
    this.#sourceDisposer = null;
    const error = new Error("AccountProviderService 已 dispose");
    for (const waiter of this.#waiters) {
      waiter.reject(error);
    }
    this.#waiters = [];
    this.#changeListeners.clear();
    this.#errorListeners.clear();
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error("AccountProviderService 已 dispose");
    }
  }

  #ensureStarted(): void {
    if (this.#started) {
      return;
    }
    this.#started = true;
    this.#sourceDisposer = this.#configSource.onDidChange((reason) => {
      this.#request(`config:${reason || "changed"}`).catch(() => {});
    });
  }

  #request(reason: string): Promise<AccountProviderConfigSnapshot> {
    const generation = ++this.#generation;
    this.#pendingReasons.add(reason);
    const result = new Promise<AccountProviderConfigSnapshot>((resolve, reject) => {
      this.#waiters.push({ generation, resolve, reject });
    });
    if (this.#inFlight === undefined) {
      this.#startWorker();
    }
    return result;
  }

  #startWorker(): Promise<AccountProviderConfigSnapshot> {
    const worker = this.#runWorker();
    this.#inFlight = worker;
    worker.then(
      () => this.#completeWorker(worker),
      () => this.#completeWorker(worker),
    );
    return worker;
  }

  #completeWorker(worker: Promise<AccountProviderConfigSnapshot>): void {
    if (this.#inFlight !== worker) {
      return;
    }
    this.#inFlight = undefined;
    if (this.#disposed || this.#pendingReasons.size === 0) {
      return;
    }
    this.#startWorker().catch(() => {});
  }

  async #runWorker(): Promise<AccountProviderConfigSnapshot> {
    let latest = this.#snapshot;
    while (this.#pendingReasons.size > 0) {
      const generation = this.#generation;
      const reasons = [...this.#pendingReasons];
      this.#pendingReasons.clear();
      let config: ProviderConfigSnapshot | undefined;
      try {
        config = await this.#configSource.read();
        const { providers, states } = await this.#resolve({
          configRevision: config.knorviaBuiltinRevision,
          configuredProviders: config.knorviaBuiltinProviders,
          previousProviders: latest?.providers ?? ProviderConfigMap.empty(),
          previousStates: latest?.states,
          reasons: Object.freeze(reasons),
        });
        this.#assertActive();
        const currentConfig = await this.#configSource.read();
        this.#assertActive();
        if (
          this.#pendingReasons.size > 0 ||
          currentConfig.knorviaBuiltinRevision !== config.knorviaBuiltinRevision
        ) {
          this.#pendingReasons.add("superseded-resolution");
          continue;
        }
        const next = createAccountProviderConfigSnapshot(
          config.knorviaBuiltinRevision,
          providers,
          states,
        );
        if (latest?.revision === next.revision) {
          this.#settle(generation, latest);
          continue;
        }
        const hadSnapshot = latest !== undefined;
        latest = next;
        this.#snapshot = next;
        this.#settle(generation, next);
        if (hadSnapshot) {
          const reason = reasons.join(",");
          for (const listener of this.#changeListeners) {
            listener(reason);
          }
        }
      } catch (error) {
        const event: AccountProviderServiceRefreshErrorEvent = Object.freeze({
          error,
          reasons: Object.freeze(reasons),
        });
        for (const listener of this.#errorListeners) {
          listener(event);
        }
        if (latest === undefined && config !== undefined) {
          latest = createFailClosedAccountProviderConfigSnapshot(config);
          this.#snapshot = latest;
          this.#settle(generation, latest);
          continue;
        }
        this.#reject(generation, error);
        throw error;
      }
    }
    if (latest === undefined) {
      throw new Error("Account Provider Service 尚未产生快照");
    }
    return latest;
  }

  #settle(generation: number, snapshot: AccountProviderConfigSnapshot): void {
    const remaining: RefreshWaiter[] = [];
    for (const waiter of this.#waiters) {
      if (waiter.generation <= generation) {
        waiter.resolve(snapshot);
      } else {
        remaining.push(waiter);
      }
    }
    this.#waiters = remaining;
  }

  #reject(generation: number, error: unknown): void {
    const remaining: RefreshWaiter[] = [];
    for (const waiter of this.#waiters) {
      if (waiter.generation <= generation) {
        waiter.reject(error);
      } else {
        remaining.push(waiter);
      }
    }
    this.#waiters = remaining;
  }
}
