// SPDX-License-Identifier: Apache-2.0
// Provider 配置运行时的内部实现：把 Built-in 配置来源、Personal 文件仓储与远端同步器
// 组装成一个生命周期单元，并驱动 60 秒一次的 Built-in 检查循环。
//
// 状态所有者（全部由本闭包独占，无第二写入路径）：
//   · configService        合并后的配置读取面
//   · personalRepository   Personal 文件的锁与失效通知
//   · builtinSource        Built-in 配置来源（文件监视 或 端点范围同步）
//   · remoteSynchronizer   仅普通文件来源下存在
//   · 检查循环             一个 interval + 一份进行中的 promise（重叠调用复用它）
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

/** Built-in 检查的固定周期。 */
const TICK_MS = 60_000;

export interface ConfigRuntimeOptions {
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

type AnyBuiltinSource = NodeKnorviaBuiltinProviderConfigSource | EndpointScopedKnorviaBuiltinSource;

/**
 * 来源是否是「普通文件来源」。
 *
 * 能力判别而非 `instanceof`：源码入口与 dist 入口各持一份类对象，跨入口实例认不出。
 * 普通文件来源同步暴露 `activeFilePath` 属性；端点范围来源只有异步 `resolveActiveFilePath`。
 */
function isFileBackedSource(
  source: AnyBuiltinSource,
): source is NodeKnorviaBuiltinProviderConfigSource {
  return "activeFilePath" in source;
}

export interface ConfigRuntimeCore {
  readonly configService: ProviderConfigService;
  readonly personalRepository: import("@knorvia/provider").PersonalProviderConfigRepository;
  resolveKnorviaBuiltinActiveFilePath(): Promise<string>;
  onDidCheckKnorviaBuiltin(listener: () => Promise<void>): () => boolean;
  start(): Promise<void>;
  refreshKnorviaBuiltin(options?: {
    readonly force?: boolean;
  }): Promise<KnorviaBuiltinRefreshResult>;
  dispose(): void;
}

export function createConfigRuntimeCore(options: ConfigRuntimeOptions): ConfigRuntimeCore {
  const builtinSource: AnyBuiltinSource = options.knorviaBuiltinEnvironment
    ? new EndpointScopedKnorviaBuiltinSource({
        bundledFilePath: options.knorviaBuiltinFilePath,
        ...options.knorviaBuiltinEnvironment,
      })
    : new NodeKnorviaBuiltinProviderConfigSource({
        bundledFilePath: options.knorviaBuiltinFilePath,
        activeFilePath: options.knorviaBuiltinActiveFilePath,
        watch: options.watch,
      });

  // 远端同步器只对普通文件来源有意义：端点范围来源自带同步器。
  const remoteSynchronizer =
    options.knorviaBuiltinRemote !== undefined && isFileBackedSource(builtinSource)
      ? new KnorviaBuiltinRemoteSynchronizer({
          source: builtinSource,
          ...options.knorviaBuiltinRemote,
        })
      : undefined;

  const personalRepository = new NodePersonalProviderConfigRepository({
    filePath: options.personalFilePath,
    onRecovery: options.onPersonalConfigRecovery,
    onPollingError: options.onPersonalConfigPollingError,
    pollingIntervalMs: options.personalPollingIntervalMs,
    // 旧配置导入要先读当前 Built-in 快照，因此延后到真正被调用时才读。
    ...(options.importLegacy === undefined
      ? {}
      : {
          importLegacy: async () => {
            const snapshot = await builtinSource.read();
            return options.importLegacy!(snapshot);
          },
        }),
  });

  // 装配顺序固定：配置服务最后构造，它同时依赖上面两个来源。
  const configService = new ProviderConfigService({
    knorviaBuiltinSource: builtinSource,
    personalRepository,
  });

  const checkListeners = new Set<() => Promise<void>>();
  let closed = false;
  let started: Promise<void> | null = null;
  let inFlightCheck: Promise<void> | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;

  function refresh(options_?: { readonly force?: boolean }): Promise<KnorviaBuiltinRefreshResult> {
    if (closed) {
      return Promise.resolve("disposed");
    }
    if (!isFileBackedSource(builtinSource)) {
      return builtinSource.refresh(options_);
    }
    return remoteSynchronizer?.refresh(options_) ?? Promise.resolve("skipped");
  }

  /**
   * 跑一轮检查：刷新 + 全部监听者并发执行。
   *
   * 重叠调用复用同一份 promise；单个参与方失败只上报，不影响其它参与方，
   * 因此用 `allSettled` 而非 `all`。
   */
  function runCheck(): Promise<void> {
    if (closed) {
      return Promise.resolve();
    }
    if (inFlightCheck !== null) {
      return inFlightCheck;
    }

    // 先取快照：执行期间新登记的监听者留到下一轮，避免「登记即参与本次」的重入。
    const snapshot = [...checkListeners];
    const work = Promise.allSettled([
      refresh(),
      ...snapshot.map((listener) => Promise.resolve().then(listener)),
    ])
      .then((outcomes) => {
        if (closed) {
          return;
        }
        for (const outcome of outcomes) {
          if (outcome.status === "rejected") {
            options.onKnorviaBuiltinRefreshError?.(outcome.reason);
          }
        }
      })
      .finally(() => {
        if (inFlightCheck === work) {
          inFlightCheck = null;
        }
      });

    inFlightCheck = work;
    return work;
  }

  return {
    configService,
    personalRepository,

    resolveKnorviaBuiltinActiveFilePath(): Promise<string> {
      if (isFileBackedSource(builtinSource)) {
        return Promise.resolve(builtinSource.activeFilePath);
      }
      return builtinSource.resolveActiveFilePath();
    },

    onDidCheckKnorviaBuiltin(listener: () => Promise<void>): () => boolean {
      checkListeners.add(listener);
      // 返回 `Set.delete` 的结果：契约把「是否真的摘掉了」作为可观察语义。
      return () => checkListeners.delete(listener);
    },

    /**
     * 启动：先读一遍配置（触发建目录与迁移），再开始周期检查。
     *
     * 重复调用返回同一 promise；首次失败时清掉引用以便重试。
     */
    start(): Promise<void> {
      if (closed) {
        throw new Error("NodeProviderConfigRuntime 已 dispose");
      }
      if (started !== null) {
        return started;
      }

      const boot = configService.read().then(() => {
        if (closed) {
          return;
        }
        // 首轮检查立即执行，不等第一个 interval 到期。
        void runCheck();
        // 只有存在远端同步、端点范围来源或外部监听者时才需要周期检查；
        // 否则空转的 interval 会让进程无法自然退出。
        const needsPeriodicCheck =
          remoteSynchronizer !== undefined ||
          !isFileBackedSource(builtinSource) ||
          checkListeners.size > 0;
        if (!needsPeriodicCheck) {
          return;
        }
        ticker = setInterval(() => {
          void runCheck();
        }, TICK_MS);
        ticker.unref?.();
      });

      started = boot;
      void boot.catch(() => {
        if (started === boot) {
          started = null;
        }
      });
      return boot;
    },

    refreshKnorviaBuiltin: refresh,

    /**
     * 关闭：释放顺序固定（契约 B27）——
     * 定时器 → 监听者 → 远端同步器 → configService → personalRepository → builtinSource。
     * 先停生产者再关消费者，收尾期间不会有人再读已关闭的来源。幂等。
     */
    dispose(): void {
      if (closed) {
        return;
      }
      closed = true;
      if (ticker !== null) {
        clearInterval(ticker);
        ticker = null;
      }
      checkListeners.clear();
      remoteSynchronizer?.dispose();
      configService.dispose();
      personalRepository.dispose();
      builtinSource.dispose();
    },
  };
}
