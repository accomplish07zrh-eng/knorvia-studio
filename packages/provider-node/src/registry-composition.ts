// SPDX-License-Identifier: Apache-2.0
// Registry 运行时的内部装配逻辑。
//
// 对外壳（provider-registry-runtime.ts）只暴露一个句柄；这里承担全部有状态行为：
// 选账号来源、决定启动顺序、维护 dispose 闸门。
//
// 状态所有者：本闭包独占 `closed` 标记与三个子对象引用，不再有其它写入路径。
import {
  MutableAccountProviderConfigSource,
  ProviderRegistryService,
  createFailClosedAccountProviderConfigSnapshot,
  type AccountProviderConfigSnapshot,
  type ProviderSource,
} from "@knorvia/provider";
import {
  NodeProviderConfigRuntime,
  type NodeProviderConfigRuntimeOptions,
} from "./provider-config-runtime.js";

/** 账号来源的三种来源方式，按优先级取第一个可用的。 */
function pickAccountSource(
  options: NodeProviderConfigRuntimeOptions & {
    readonly accountSource?: ProviderSource<AccountProviderConfigSnapshot>;
    readonly createAccountSource?: (
      configService: NodeProviderConfigRuntime["configService"],
    ) => ProviderSource<AccountProviderConfigSnapshot>;
  },
  configService: NodeProviderConfigRuntime["configService"],
): ProviderSource<AccountProviderConfigSnapshot> {
  const custom = options.createAccountSource?.(configService);
  if (custom !== undefined) {
    return custom;
  }
  return options.accountSource ?? new MutableAccountProviderConfigSource();
}

/**
 * 判断账号来源是否支持就地替换快照。
 *
 * 用结构性能力判别（存在 `replace` 函数）而不是 `instanceof`：
 * 源码入口与 dist 入口各持一份类对象，跨入口实例互相认不出。
 */
function supportsSnapshotReplace(
  source: ProviderSource<AccountProviderConfigSnapshot>,
): source is MutableAccountProviderConfigSource {
  return typeof (source as { replace?: unknown }).replace === "function";
}

export interface RegistryRuntimeComposition {
  readonly configService: NodeProviderConfigRuntime["configService"];
  readonly registryService: ProviderRegistryService;
  readonly personalRepository: NodeProviderConfigRuntime["personalRepository"];
  start(): Promise<void>;
  onDidCheckKnorviaBuiltin(listener: () => Promise<void>): () => boolean;
  dispose(): void;
}

export function composeRegistryRuntime(
  options: NodeProviderConfigRuntimeOptions & {
    readonly accountSource?: ProviderSource<AccountProviderConfigSnapshot>;
    readonly createAccountSource?: (
      configService: NodeProviderConfigRuntime["configService"],
    ) => ProviderSource<AccountProviderConfigSnapshot>;
  },
): RegistryRuntimeComposition {
  const configRuntime = new NodeProviderConfigRuntime(options);
  const configService = configRuntime.configService;
  const accountSource = pickAccountSource(options, configService);
  const registryService = new ProviderRegistryService({
    configSource: configService,
    accountSource,
  });

  let closed = false;

  return {
    configService,
    registryService,
    personalRepository: configRuntime.personalRepository,

    async start(): Promise<void> {
      if (closed) {
        throw new Error("NodeProviderRegistryRuntime 已 dispose");
      }

      // 顺序：配置先就绪，fail-closed 初值才能以它当前的 revision 为基准；
      // 注册表服务最后启动，此时两个来源都已可用。
      await configRuntime.start();

      if (supportsSnapshotReplace(accountSource)) {
        const current = await accountSource.read();
        // 只在「从未初始化」时写入初值，避免覆盖真实账号数据。
        if (current.basedOnKnorviaBuiltinRevision === "uninitialized") {
          accountSource.replace(
            createFailClosedAccountProviderConfigSnapshot(await configService.read()),
            "initial-fail-closed",
          );
        }
      }

      return registryService.start();
    },

    onDidCheckKnorviaBuiltin(listener: () => Promise<void>): () => boolean {
      return configRuntime.onDidCheckKnorviaBuiltin(listener);
    },

    dispose(): void {
      if (closed) {
        return;
      }
      closed = true;
      // 先停消费者（注册表服务），再停生产者（配置运行时）。
      registryService.dispose();
      configRuntime.dispose();
    },
  };
}
