// SPDX-License-Identifier: Apache-2.0
// Provider 配置运行时的内部实现。
//
// 组织方式：先「选取来源」，再「按清单装配」，最后「维护检查循环」。
// 装配用**透传键清单 + 具名默认值**而不是逐字段手抄 options：
// options 的字段名与下游构造参数同名，逐字段抄写既冗长，也容易在新增字段时漏掉一处。
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

/** 允许在构造期直接透传给 Personal 仓储的键（名字与仓储参数同名，可整体搬运）。 */
const PASS_THROUGH_KEYS = [
  "onPersonalConfigRecovery",
  "onPersonalConfigPollingError",
  "personalPollingIntervalMs",
] as const;

// 构造参数形状在 config-runtime-options.ts（interface.md §2.2 冻结的纯类型面）。
export type { ConfigRuntimeOptions } from "./config-runtime-options.js";
import type { ConfigRuntimeOptions } from "./config-runtime-options.js";

type AnyBuiltinSource = NodeKnorviaBuiltinProviderConfigSource | EndpointScopedKnorviaBuiltinSource;

/** 从 options 里挑出 `PASS_THROUGH_KEYS` 中确实给了值的项。 */
function passThrough(options: ConfigRuntimeOptions): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of PASS_THROUGH_KEYS) {
    const value = (options as unknown as Record<string, unknown>)[key];
    if (value !== undefined) {
      picked[key] = value;
    }
  }
  return picked;
}

/**
 * 来源是否是「普通文件来源」。
 *
 * 能力判别而非 `instanceof`：源码入口与 dist 入口各持一份类对象，跨入口实例认不出。
 */
function isFileBacked(source: AnyBuiltinSource): source is NodeKnorviaBuiltinProviderConfigSource {
  return "activeFilePath" in source;
}

/** 按 options 选出 Built-in 来源：给了环境描述就走端点范围来源，否则走普通文件来源。 */
function pickSource(options: ConfigRuntimeOptions): AnyBuiltinSource {
  if (options.knorviaBuiltinEnvironment !== undefined) {
    return new EndpointScopedKnorviaBuiltinSource({
      bundledFilePath: options.knorviaBuiltinFilePath,
      ...options.knorviaBuiltinEnvironment,
    });
  }
  // 普通来源的三个参数名字与 option 不同名（option 带 knorvia 前缀），必须显式映射，
  // 不能用通用透传：透传会把 `knorviaBuiltinActiveFilePath` 原样递过去而被忽略，
  // 导致 active 路径静默退化成 bundled 路径（契约 B27 明确要求两者可区分）。
  return new NodeKnorviaBuiltinProviderConfigSource({
    bundledFilePath: options.knorviaBuiltinFilePath,
    activeFilePath: options.knorviaBuiltinActiveFilePath,
    watch: options.watch,
  });
}

interface ConfigRuntimeCore {
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
  const source = pickSource(options);

  // 远端同步器只对普通文件来源有意义：端点范围来源自带同步器。
  const synchronizer =
    options.knorviaBuiltinRemote !== undefined && isFileBacked(source)
      ? new KnorviaBuiltinRemoteSynchronizer({
          source,
          ...options.knorviaBuiltinRemote,
        })
      : undefined;

  const personal = new NodePersonalProviderConfigRepository({
    filePath: options.personalFilePath,
    ...passThrough(options),
    // 旧配置导入要先读当前 Built-in 快照，因此延后到真正被调用时才读。
    ...(options.importLegacy === undefined
      ? {}
      : {
          importLegacy: async () => {
            const snapshot = await source.read();
            return options.importLegacy!(snapshot);
          },
        }),
  });

  // 装配顺序固定：配置服务最后构造，它同时依赖上面两个来源。
  const configService = new ProviderConfigService({
    knorviaBuiltinSource: source,
    personalRepository: personal,
  });

  const checkListeners = new Set<() => Promise<void>>();
  let closed = false;
  let started: Promise<void> | null = null;
  let inFlightCheck: Promise<void> | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;

  const refresh = (refreshOptions?: {
    readonly force?: boolean;
  }): Promise<KnorviaBuiltinRefreshResult> => {
    if (closed) {
      return Promise.resolve("disposed");
    }
    if (!isFileBacked(source)) {
      return source.refresh(refreshOptions);
    }
    return synchronizer?.refresh(refreshOptions) ?? Promise.resolve("skipped");
  };

  /**
   * 跑一轮检查：刷新 + 全部监听者并发执行。
   *
   * 重叠调用复用同一份 promise；单个参与方失败只上报、不影响其它参与方，
   * 因此用 `allSettled` 而非 `all`。
   */
  const runCheck = (): Promise<void> => {
    if (closed) {
      return Promise.resolve();
    }
    if (inFlightCheck !== null) {
      return inFlightCheck;
    }
    // 先取快照：执行期间新登记的监听者留到下一轮，避免「登记即参与本次」的重入。
    const participants = [...checkListeners];
    const work = Promise.allSettled([
      refresh(),
      ...participants.map((listener) => Promise.resolve().then(listener)),
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
  };

  /** 是否需要周期检查：有远端同步、端点范围来源，或存在外部监听者。 */
  const needsTicker = (): boolean =>
    synchronizer !== undefined || !isFileBacked(source) || checkListeners.size > 0;

  return {
    configService,
    personalRepository: personal,

    resolveKnorviaBuiltinActiveFilePath(): Promise<string> {
      return isFileBacked(source)
        ? Promise.resolve(source.activeFilePath)
        : source.resolveActiveFilePath();
    },

    onDidCheckKnorviaBuiltin(listener: () => Promise<void>): () => boolean {
      checkListeners.add(listener);
      // 返回 `Set.delete` 的结果：契约把「是否真的摘掉了」作为可观察语义。
      return () => checkListeners.delete(listener);
    },

    /**
     * 启动：先读一遍配置（触发建目录与迁移），再开始周期检查。
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
        if (!needsTicker()) {
          return;
        }
        ticker = setInterval(() => {
          void runCheck();
        }, TICK_MS);
        // 计时器不应阻止进程退出。
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
     * 定时器 → 监听者 → 远端同步器 → configService → personal → source。
     * 先停生产者再关消费者。幂等。
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
      synchronizer?.dispose();
      configService.dispose();
      personal.dispose();
      source.dispose();
    },
  };
}
