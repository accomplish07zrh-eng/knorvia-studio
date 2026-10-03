import {
  ProviderConfigService,
  type ProviderConfigLayerSnapshot,
  type ProviderConfigLayerUpdate,
} from "@knorvia/provider";
import { NodeKnorviaBuiltinProviderConfigSource } from "./builtin-provider-config-source.js";
import {
  KnorviaBuiltinRemoteSynchronizer,
  type KnorviaBuiltinRemoteSynchronizerOptions,
  type KnorviaBuiltinRefreshResult,
} from "./builtin-remote-synchronizer.js";
import {
  EndpointScopedKnorviaBuiltinSource,
  type EndpointScopedKnorviaBuiltinSourceOptions,
} from "./endpoint-scoped-builtin-source.js";
import {
  NodePersonalProviderConfigRepository,
  type PersonalProviderConfigRecoveryEvent,
} from "./personal-provider-config-repository.js";

export interface NodeProviderConfigRuntimeOptions {
  readonly knorviaBuiltinFilePath: string;
  readonly knorviaBuiltinActiveFilePath?: string;
  readonly knorviaBuiltinRemote?: Omit<KnorviaBuiltinRemoteSynchronizerOptions, "source">;
  readonly knorviaBuiltinEnvironment?: Omit<
    EndpointScopedKnorviaBuiltinSourceOptions,
    "bundledFilePath"
  >;
  readonly onKnorviaBuiltinRefreshError?: (error: unknown) => void;
  readonly onPersonalConfigRecovery?: (event: PersonalProviderConfigRecoveryEvent) => void;
  readonly onPersonalConfigPollingError?: (error: unknown) => void;
  readonly personalFilePath: string;
  readonly personalPollingIntervalMs?: number | false;
  readonly importLegacy?: (
    knorviaBuiltin: ProviderConfigLayerSnapshot,
  ) => Promise<ProviderConfigLayerUpdate | null>;
  readonly watch?: boolean;
}

export class NodeProviderConfigRuntime {
  readonly configService: ProviderConfigService;

  readonly #builtinSource:
    | NodeKnorviaBuiltinProviderConfigSource
    | EndpointScopedKnorviaBuiltinSource;
  readonly #personalRepository: NodePersonalProviderConfigRepository;
  readonly #remoteSynchronizer?: KnorviaBuiltinRemoteSynchronizer;
  readonly #onKnorviaBuiltinRefreshError?: (error: unknown) => void;
  readonly #checkListeners = new Set<() => Promise<void>>();
  #disposed = false;
  #startPromise: Promise<void> | null = null;
  #checkPromise: Promise<void> | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: NodeProviderConfigRuntimeOptions) {
    this.#builtinSource = options.knorviaBuiltinEnvironment
      ? new EndpointScopedKnorviaBuiltinSource({
          bundledFilePath: options.knorviaBuiltinFilePath,
          ...options.knorviaBuiltinEnvironment,
        })
      : new NodeKnorviaBuiltinProviderConfigSource({
          bundledFilePath: options.knorviaBuiltinFilePath,
          activeFilePath: options.knorviaBuiltinActiveFilePath,
          watch: options.watch,
        });

    if (
      options.knorviaBuiltinRemote &&
      this.#builtinSource instanceof NodeKnorviaBuiltinProviderConfigSource
    ) {
      this.#remoteSynchronizer = new KnorviaBuiltinRemoteSynchronizer({
        source: this.#builtinSource,
        ...options.knorviaBuiltinRemote,
      });
    }
    this.#onKnorviaBuiltinRefreshError = options.onKnorviaBuiltinRefreshError;

    this.#personalRepository = new NodePersonalProviderConfigRepository({
      filePath: options.personalFilePath,
      onRecovery: options.onPersonalConfigRecovery,
      onPollingError: options.onPersonalConfigPollingError,
      pollingIntervalMs: options.personalPollingIntervalMs,
      ...(options.importLegacy
        ? {
            importLegacy: async () => {
              const snapshot = await this.#builtinSource.read();
              return options.importLegacy!(snapshot);
            },
          }
        : {}),
    });
    this.configService = new ProviderConfigService({
      knorviaBuiltinSource: this.#builtinSource,
      personalRepository: this.#personalRepository,
    });
  }

  resolveKnorviaBuiltinActiveFilePath(): Promise<string> {
    if (this.#builtinSource instanceof NodeKnorviaBuiltinProviderConfigSource) {
      return Promise.resolve(this.#builtinSource.activeFilePath);
    }
    return this.#builtinSource.resolveActiveFilePath();
  }

  get personalRepository(): import("@knorvia/provider").PersonalProviderConfigRepository {
    return this.#personalRepository;
  }

  onDidCheckKnorviaBuiltin(listener: () => Promise<void>): () => void {
    this.#checkListeners.add(listener);
    return () => this.#checkListeners.delete(listener);
  }

  start(): Promise<void> {
    if (this.#disposed) {
      throw new Error("NodeProviderConfigRuntime 已 dispose");
    }
    if (this.#startPromise) {
      return this.#startPromise;
    }

    const started = this.configService.read().then(() => {
      if (this.#disposed) {
        return;
      }
      void this.#checkKnorviaBuiltin();
      if (
        this.#remoteSynchronizer ||
        this.#builtinSource instanceof EndpointScopedKnorviaBuiltinSource ||
        this.#checkListeners.size > 0
      ) {
        this.#timer = setInterval(() => {
          void this.#checkKnorviaBuiltin();
        }, 60_000);
        this.#timer.unref?.();
      }
    });
    this.#startPromise = started;
    void started.catch(() => {
      if (this.#startPromise === started) {
        this.#startPromise = null;
      }
    });
    return started;
  }

  refreshKnorviaBuiltin(options?: {
    readonly force?: boolean;
  }): Promise<KnorviaBuiltinRefreshResult> {
    if (this.#disposed) {
      return Promise.resolve("disposed");
    }
    if (this.#builtinSource instanceof EndpointScopedKnorviaBuiltinSource) {
      return this.#builtinSource.refresh(options);
    }
    return this.#remoteSynchronizer?.refresh(options) ?? Promise.resolve("skipped");
  }

  #checkKnorviaBuiltin(): Promise<void> {
    if (this.#disposed) {
      return Promise.resolve();
    }
    if (this.#checkPromise) {
      return this.#checkPromise;
    }

    const refresh = this.refreshKnorviaBuiltin();
    const listeners = [...this.#checkListeners];
    const check = Promise.allSettled([
      refresh,
      ...listeners.map((listener) => Promise.resolve().then(listener)),
    ])
      .then((results) => {
        if (this.#disposed) {
          return;
        }
        for (const result of results) {
          if (result.status === "rejected") {
            this.#onKnorviaBuiltinRefreshError?.(result.reason);
          }
        }
      })
      .finally(() => {
        if (this.#checkPromise === check) {
          this.#checkPromise = null;
        }
      });
    this.#checkPromise = check;
    return check;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    if (this.#timer) {
      clearInterval(this.#timer);
    }
    this.#timer = null;
    this.#checkListeners.clear();
    this.#remoteSynchronizer?.dispose();
    this.configService.dispose();
    this.#personalRepository.dispose();
    this.#builtinSource.dispose();
  }
}

export function createNodeProviderConfigRuntime(
  options: NodeProviderConfigRuntimeOptions,
): NodeProviderConfigRuntime {
  return new NodeProviderConfigRuntime(options);
}
