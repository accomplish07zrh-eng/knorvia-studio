import {
  ProviderConfigService,
  type ProviderConfigLayerSnapshot,
  type ProviderConfigLayerUpdate,
} from "@knorvia/provider";
import { NodeKnorviaBuiltinProviderConfigSource } from "./builtin-provider-config-source.js";
import {
  EndpointScopedKnorviaBuiltinSource,
  type EndpointScopedKnorviaBuiltinSourceOptions,
} from "./endpoint-scoped-builtin-source.js";
import {
  KnorviaBuiltinRemoteSynchronizer,
  type KnorviaBuiltinRemoteSynchronizerOptions,
  type KnorviaBuiltinRefreshResult,
} from "./builtin-remote-synchronizer.js";
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

/** 组装一个 Node.js 进程内共享的 Knorvia Built-in/Personal Config 运行边界。 */
export class NodeProviderConfigRuntime {
  readonly configService: ProviderConfigService;
  readonly #knorviaBuiltinSource:
    | NodeKnorviaBuiltinProviderConfigSource
    | EndpointScopedKnorviaBuiltinSource;
  readonly #personalRepository: NodePersonalProviderConfigRepository;
  readonly #remoteSynchronizer?: KnorviaBuiltinRemoteSynchronizer;
  readonly #onRemoteRefreshError?: (error: unknown) => void;
  #startPromise: Promise<void> | null = null;
  #disposed = false;
  readonly #checkListeners = new Set<() => Promise<void>>();
  #checkTimer: ReturnType<typeof setInterval> | null = null;
  #checkInFlight: Promise<void> | null = null;

  constructor(options: NodeProviderConfigRuntimeOptions) {
    this.#knorviaBuiltinSource = options.knorviaBuiltinEnvironment
      ? new EndpointScopedKnorviaBuiltinSource({
          bundledFilePath: options.knorviaBuiltinFilePath,
          ...options.knorviaBuiltinEnvironment,
        })
      : new NodeKnorviaBuiltinProviderConfigSource({
          bundledFilePath: options.knorviaBuiltinFilePath,
          activeFilePath: options.knorviaBuiltinActiveFilePath,
          watch: options.watch,
        });
    this.#remoteSynchronizer =
      options.knorviaBuiltinRemote &&
      this.#knorviaBuiltinSource instanceof NodeKnorviaBuiltinProviderConfigSource
        ? new KnorviaBuiltinRemoteSynchronizer({
            source: this.#knorviaBuiltinSource,
            ...options.knorviaBuiltinRemote,
          })
        : undefined;
    this.#onRemoteRefreshError = options.onKnorviaBuiltinRefreshError;
    this.#personalRepository = new NodePersonalProviderConfigRepository({
      filePath: options.personalFilePath,
      onRecovery: options.onPersonalConfigRecovery,
      onPollingError: options.onPersonalConfigPollingError,
      pollingIntervalMs: options.personalPollingIntervalMs,
      ...(options.importLegacy
        ? {
            importLegacy: async () =>
              options.importLegacy!(await this.#knorviaBuiltinSource.read()),
          }
        : {}),
    });
    this.configService = new ProviderConfigService({
      knorviaBuiltinSource: this.#knorviaBuiltinSource,
      personalRepository: this.#personalRepository,
    });
  }

  resolveKnorviaBuiltinActiveFilePath(): Promise<string> {
    return this.#knorviaBuiltinSource instanceof NodeKnorviaBuiltinProviderConfigSource
      ? Promise.resolve(this.#knorviaBuiltinSource.activeFilePath)
      : this.#knorviaBuiltinSource.resolveActiveFilePath();
  }

  get personalRepository(): import("@knorvia/provider").PersonalProviderConfigRepository {
    return this.#personalRepository;
  }

  /** Environment 同一周期检查中恢复未对齐依赖，不被下载 TTL 或失败挡住。 */
  onDidCheckKnorviaBuiltin(listener: () => Promise<void>): () => void {
    this.#checkListeners.add(listener);
    return () => this.#checkListeners.delete(listener);
  }

  start(): Promise<void> {
    if (this.#disposed) throw new Error("NodeProviderConfigRuntime 已 dispose");
    if (this.#startPromise) return this.#startPromise;
    const startPromise = this.configService.read().then(() => {
      if (this.#disposed) return;
      void this.#checkBackground();
      // Managed Worker 无下载配置也无恢复 owner，不建立周期任务。
      if (
        this.#remoteSynchronizer ||
        this.#knorviaBuiltinSource instanceof EndpointScopedKnorviaBuiltinSource ||
        this.#checkListeners.size > 0
      ) {
        this.#checkTimer = setInterval(() => {
          void this.#checkBackground();
        }, 60_000);
        this.#checkTimer.unref?.();
      }
    });
    this.#startPromise = startPromise;
    void startPromise.catch(() => {
      if (this.#startPromise === startPromise) this.#startPromise = null;
    });
    return startPromise;
  }

  refreshKnorviaBuiltin(options?: {
    readonly force?: boolean;
  }): Promise<KnorviaBuiltinRefreshResult> {
    if (this.#disposed) return Promise.resolve("disposed");
    if (this.#knorviaBuiltinSource instanceof EndpointScopedKnorviaBuiltinSource) {
      return this.#knorviaBuiltinSource.refresh(options);
    }
    return this.#remoteSynchronizer?.refresh(options) ?? Promise.resolve("skipped");
  }

  #checkBackground(): Promise<void> {
    if (this.#disposed) return Promise.resolve();
    if (this.#checkInFlight) return this.#checkInFlight;
    const check = Promise.allSettled([
      this.refreshKnorviaBuiltin(),
      ...[...this.#checkListeners].map((listener) => Promise.resolve().then(listener)),
    ])
      .then((results) => {
        if (this.#disposed) return;
        for (const result of results)
          if (result.status === "rejected") this.#onRemoteRefreshError?.(result.reason);
      })
      .finally(() => {
        if (this.#checkInFlight === check) this.#checkInFlight = null;
      });
    this.#checkInFlight = check;
    return check;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#checkTimer) clearInterval(this.#checkTimer);
    this.#checkTimer = null;
    this.#checkListeners.clear();
    this.#remoteSynchronizer?.dispose();
    this.configService.dispose();
    this.#personalRepository.dispose();
    this.#knorviaBuiltinSource.dispose();
  }
}

export function createNodeProviderConfigRuntime(
  options: NodeProviderConfigRuntimeOptions,
): NodeProviderConfigRuntime {
  return new NodeProviderConfigRuntime(options);
}
