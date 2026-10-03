import type { ModelId, ProviderId } from "./config/index.js";
import {
  ProviderRegistry,
  type ModelSelection,
  type ModelSelectionValidation,
  type ProviderRegistryView,
} from "./registry.js";
import {
  ProviderConfigResolver,
  type ProviderConfigResolution,
  type Provider,
  type ProviderModel,
} from "./resolver.js";
import type {
  AccountProviderConfigSnapshot,
  ProviderConfigSnapshot,
  ProviderSource,
} from "./sources.js";

export interface ProviderRegistryServiceSnapshot {
  readonly sourceRevisions: {
    readonly config: string;
    readonly account: string;
  };
  readonly config: ProviderConfigSnapshot;
  readonly account: AccountProviderConfigSnapshot;
  readonly resolution: ProviderConfigResolution;
  readonly registry: ProviderRegistryView;
}

export interface ProviderRegistryServiceChangedEvent {
  readonly snapshot: ProviderRegistryServiceSnapshot;
  readonly reasons: readonly string[];
}

export interface ProviderRegistryServiceRefreshErrorEvent {
  readonly error: unknown;
  readonly reasons: readonly string[];
}

export interface ProviderRegistryServiceDependencies {
  readonly configSource: ProviderSource<ProviderConfigSnapshot>;
  readonly accountSource: ProviderSource<AccountProviderConfigSnapshot>;
  readonly resolver?: ProviderConfigResolver;
}

interface RefreshWaiter {
  readonly generation: number;
  readonly resolve: (snapshot: ProviderRegistryServiceSnapshot) => void;
  readonly reject: (error: unknown) => void;
}

export class ProviderRegistryService {
  readonly #registry = new ProviderRegistry();
  readonly #configSource: ProviderSource<ProviderConfigSnapshot>;
  readonly #accountSource: ProviderSource<AccountProviderConfigSnapshot>;
  readonly #resolver: ProviderConfigResolver;
  #snapshot: ProviderRegistryServiceSnapshot | null = null;
  #requestedGeneration = 0;
  #completedGeneration = 0;
  #activeRefresh: Promise<void> | null = null;
  #started = false;
  #disposed = false;
  readonly #pendingReasons = new Set<string>();
  #pendingWaiters: RefreshWaiter[] = [];
  readonly #sourceDisposers: Array<() => void> = [];
  readonly #changeListeners = new Set<(event: ProviderRegistryServiceChangedEvent) => void>();
  readonly #errorListeners = new Set<(event: ProviderRegistryServiceRefreshErrorEvent) => void>();

  constructor(dependencies: ProviderRegistryServiceDependencies) {
    this.#configSource = dependencies.configSource;
    this.#accountSource = dependencies.accountSource;
    this.#resolver = dependencies.resolver ?? new ProviderConfigResolver();
  }

  async start(): Promise<void> {
    this.#assertNotDisposed();
    if (!this.#started) {
      this.#started = true;
      const configDisposer = this.#configSource.onDidChange((reason) => {
        this.#sourceChanged("config", reason);
      });
      const accountDisposer = this.#accountSource.onDidChange((reason) => {
        this.#sourceChanged("account", reason);
      });
      this.#sourceDisposers.push(configDisposer, accountDisposer);
      await this.#requestRefresh("start");
    } else if (!this.#snapshot) {
      await this.#requestRefresh("start");
    }
  }

  refresh(reason = "explicit"): Promise<ProviderRegistryServiceSnapshot> {
    this.#assertNotDisposed();
    if (!this.#started) {
      throw new Error("ProviderRegistryService 必须先 start() 再 refresh()");
    }
    return this.#requestRefresh(reason);
  }

  getSnapshot(): ProviderRegistryServiceSnapshot | null {
    return this.#snapshot;
  }

  getView(): ProviderRegistryView {
    return this.#registry.getView();
  }

  listProviders(): readonly Provider[] {
    return this.#registry.listProviders();
  }

  getProvider(providerId: ProviderId): Provider | undefined {
    return this.#registry.getProvider(providerId);
  }

  getModel(providerId: ProviderId, modelId: ModelId): ProviderModel | undefined {
    return this.#registry.getModel(providerId, modelId);
  }

  validateSelection(selection: ModelSelection): ModelSelectionValidation {
    return this.#registry.validateSelection(selection);
  }

  onDidChange(listener: (event: ProviderRegistryServiceChangedEvent) => void): () => void {
    this.#changeListeners.add(listener);
    return () => this.#changeListeners.delete(listener);
  }

  onDidRefreshError(
    listener: (event: ProviderRegistryServiceRefreshErrorEvent) => void,
  ): () => void {
    this.#errorListeners.add(listener);
    return () => this.#errorListeners.delete(listener);
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    const disposers = this.#sourceDisposers.splice(0);
    for (const disposer of disposers) {
      disposer();
    }
    const error = new Error("ProviderRegistryService 已 dispose");
    const waiters = this.#pendingWaiters.splice(0);
    for (const waiter of waiters) {
      waiter.reject(error);
    }
    this.#changeListeners.clear();
    this.#errorListeners.clear();
  }

  #assertNotDisposed(): void {
    if (this.#disposed) {
      throw new Error("ProviderRegistryService 已 dispose");
    }
  }

  #sourceChanged(source: "config" | "account", reason: string): void {
    if (this.#disposed) {
      return;
    }
    void this.#requestRefresh(`${source}:${reason || "changed"}`).catch(() => {});
  }

  #requestRefresh(reason: string): Promise<ProviderRegistryServiceSnapshot> {
    this.#requestedGeneration += 1;
    this.#pendingReasons.add(reason);
    const generation = this.#requestedGeneration;
    const promise = new Promise<ProviderRegistryServiceSnapshot>((resolve, reject) => {
      this.#pendingWaiters.push({ generation, resolve, reject });
    });
    this.#ensureRefreshLoop();
    return promise;
  }

  #ensureRefreshLoop(): void {
    if (this.#activeRefresh || this.#disposed) {
      return;
    }
    const refresh = this.#runRefreshLoop();
    this.#activeRefresh = refresh;
    void refresh.then(
      () => this.#finishRefreshLoop(refresh),
      (error: unknown) => {
        this.#rejectWaiters(this.#requestedGeneration, error);
        this.#finishRefreshLoop(refresh);
      },
    );
  }

  #finishRefreshLoop(refresh: Promise<void>): void {
    if (this.#activeRefresh !== refresh) {
      return;
    }
    this.#activeRefresh = null;
    if (this.#completedGeneration < this.#requestedGeneration) {
      this.#ensureRefreshLoop();
    }
  }

  async #runRefreshLoop(): Promise<void> {
    const reasons = new Set<string>();
    while (this.#completedGeneration < this.#requestedGeneration) {
      const generation = this.#requestedGeneration;
      for (const reason of this.#pendingReasons) {
        reasons.add(reason);
      }
      this.#pendingReasons.clear();

      let config: ProviderConfigSnapshot;
      let account: AccountProviderConfigSnapshot;
      try {
        [config, account] = await Promise.all([
          this.#configSource.read(),
          this.#accountSource.read(),
        ]);
      } catch (error) {
        if (generation !== this.#requestedGeneration) {
          continue;
        }
        this.#completedGeneration = generation;
        this.#emitRefreshError(error, reasons);
        this.#rejectWaiters(generation, error);
        return;
      }

      if (generation !== this.#requestedGeneration) {
        continue;
      }
      this.#assertNotDisposed();

      if (account.basedOnKnorviaBuiltinRevision !== config.knorviaBuiltinRevision) {
        this.#completedGeneration = generation;
        if (this.#snapshot) {
          this.#resolveWaiters(generation, this.#snapshot);
        }
        reasons.clear();
        continue;
      }

      if (
        this.#snapshot &&
        this.#snapshot.sourceRevisions.config === config.revision &&
        this.#snapshot.sourceRevisions.account === account.revision
      ) {
        this.#completedGeneration = generation;
        this.#resolveWaiters(generation, this.#snapshot);
        reasons.clear();
        continue;
      }

      try {
        const resolution = this.#resolver.resolve({
          knorviaBuiltinProviders: config.knorviaBuiltinProviders,
          knorviaBuiltinProviderTemplates: config.knorviaBuiltinProviderTemplates,
          personalProviders: config.personalProviders,
          knorviaBuiltinModelRules: config.knorviaBuiltinModelRules,
          personalModels: config.personalModels,
          accountProviders: account.providers,
          accountStates: account.states,
          personalProviderOrder: config.personalProviderOrder,
        });
        this.#registry.replace(resolution.registryProviders, [...reasons].join(","));
        const snapshot: ProviderRegistryServiceSnapshot = Object.freeze({
          sourceRevisions: Object.freeze({
            config: config.revision,
            account: account.revision,
          }),
          config: Object.freeze({ ...config }),
          account: Object.freeze({
            revision: account.revision,
            basedOnKnorviaBuiltinRevision: account.basedOnKnorviaBuiltinRevision,
            providers: account.providers,
            ...(account.states ? { states: account.states } : {}),
          }),
          resolution,
          registry: this.#registry.getView(),
        });
        this.#snapshot = snapshot;
        this.#completedGeneration = generation;
        this.#resolveWaiters(generation, snapshot);
        const event: ProviderRegistryServiceChangedEvent = Object.freeze({
          snapshot,
          reasons: Object.freeze([...reasons]),
        });
        for (const listener of this.#changeListeners) {
          listener(event);
        }
        reasons.clear();
      } catch (error) {
        this.#completedGeneration = generation;
        this.#emitRefreshError(error, reasons);
        this.#rejectWaiters(generation, error);
        return;
      }
    }
  }

  #resolveWaiters(generation: number, snapshot: ProviderRegistryServiceSnapshot): void {
    const waiters = this.#pendingWaiters;
    this.#pendingWaiters = [];
    for (const waiter of waiters) {
      if (waiter.generation <= generation) {
        waiter.resolve(snapshot);
      } else {
        this.#pendingWaiters.push(waiter);
      }
    }
  }

  #rejectWaiters(generation: number, error: unknown): void {
    const waiters = this.#pendingWaiters;
    this.#pendingWaiters = [];
    for (const waiter of waiters) {
      if (waiter.generation <= generation) {
        waiter.reject(error);
      } else {
        this.#pendingWaiters.push(waiter);
      }
    }
  }

  #emitRefreshError(error: unknown, reasons: ReadonlySet<string>): void {
    const event: ProviderRegistryServiceRefreshErrorEvent = Object.freeze({
      error,
      reasons: Object.freeze([...reasons]),
    });
    for (const listener of this.#errorListeners) {
      listener(event);
    }
  }
}
