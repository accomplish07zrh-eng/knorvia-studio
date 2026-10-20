// SPDX-License-Identifier: Apache-2.0
// 一个 Node 进程内共享的 Config + Registry 生命周期单元。
//
// 职责边界：Config 运行时负责「配置从哪来、怎么刷新」，Registry 服务负责
// 「把配置与账号来源合成可解析的 provider 视图」。本类只做两者的**装配与关停顺序**，
// 不介入任何解析逻辑。
//
// 装配与关停逻辑直接写在本文件（而不是拆到内部模块）：这些逻辑只有这一处使用者，
// 拆出去只会让「声明」与「实现」隔着文件互相引用，读的时候要跳两次。
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

export interface NodeProviderRegistryRuntimeOptions extends NodeProviderConfigRuntimeOptions {
  readonly accountSource?: ProviderSource<AccountProviderConfigSnapshot>;
  readonly createAccountSource?: (
    configService: NodeProviderConfigRuntime["configService"],
  ) => ProviderSource<AccountProviderConfigSnapshot>;
}

/**
 * 判断账号来源是否支持就地替换快照。
 *
 * 结构性能力判别（存在 `replace` 函数）而非 `instanceof`：源码入口与 dist 入口
 * 各持一份类对象，跨入口实例互相认不出。可变占位是唯一带 `replace` 的来源。
 */
function supportsSnapshotReplace(
  source: ProviderSource<AccountProviderConfigSnapshot>,
): source is MutableAccountProviderConfigSource {
  return typeof (source as { replace?: unknown }).replace === "function";
}

/** 选账号来源：调用方自建 > 调用方直接给 > 进程内可变占位。 */
function pickAccountSource(
  options: NodeProviderRegistryRuntimeOptions,
  configService: NodeProviderConfigRuntime["configService"],
): ProviderSource<AccountProviderConfigSnapshot> {
  const custom = options.createAccountSource?.(configService);
  if (custom !== undefined) {
    return custom;
  }
  return options.accountSource ?? new MutableAccountProviderConfigSource();
}

export class NodeProviderRegistryRuntime {
  readonly #configRuntime: NodeProviderConfigRuntime;
  readonly #account: ProviderSource<AccountProviderConfigSnapshot>;
  #closed = false;

  readonly configService: NodeProviderConfigRuntime["configService"];
  readonly registryService: ProviderRegistryService;

  constructor(options: NodeProviderRegistryRuntimeOptions) {
    this.#configRuntime = new NodeProviderConfigRuntime(options);
    this.configService = this.#configRuntime.configService;
    this.#account = pickAccountSource(options, this.configService);
    this.registryService = new ProviderRegistryService({
      configSource: this.configService,
      accountSource: this.#account,
    });
  }

  /**
   * 启动：先起配置，再决定账号来源的初始状态，最后起注册表服务。
   *
   * 「初始状态」这一步只对可变占位来源有意义：它必须在配置就绪后才能算出
   * fail-closed 快照（该快照以当前 Built-in revision 为基准）。外部提供的来源
   * 自己管理状态，这里不替它初始化。
   */
  async start(): Promise<void> {
    if (this.#closed) {
      throw new Error("NodeProviderRegistryRuntime 已 dispose");
    }

    await this.#configRuntime.start();

    if (supportsSnapshotReplace(this.#account)) {
      const current = await this.#account.read();
      // 只在「从未初始化」时写初值，避免覆盖真实账号数据。
      if (current.basedOnKnorviaBuiltinRevision === "uninitialized") {
        this.#account.replace(
          createFailClosedAccountProviderConfigSnapshot(await this.configService.read()),
          "initial-fail-closed",
        );
      }
    }

    return this.registryService.start();
  }

  get personalRepository(): NodeProviderConfigRuntime["personalRepository"] {
    return this.#configRuntime.personalRepository;
  }

  /** 透传配置运行时的检查登记；返回值语义一致（`Set.delete` 的结果）。 */
  onDidCheckKnorviaBuiltin(listener: () => Promise<void>): () => boolean {
    return this.#configRuntime.onDidCheckKnorviaBuiltin(listener);
  }

  /**
   * 关闭：先注册表服务，再配置运行时（契约 B28 的固定顺序）。
   *
   * 顺序理由：注册表服务读配置，必须先停；配置运行时内部再按它自己的顺序收尾。幂等。
   */
  dispose(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.registryService.dispose();
    this.#configRuntime.dispose();
  }
}

export function createNodeProviderRegistryRuntime(
  options: NodeProviderRegistryRuntimeOptions,
): NodeProviderRegistryRuntime {
  return new NodeProviderRegistryRuntime(options);
}
