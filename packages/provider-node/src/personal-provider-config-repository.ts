// SPDX-License-Identifier: Apache-2.0
// Personal provider 配置仓储：文件是唯一事实来源，本类负责订阅、轮询与生命周期。
//
// 分层（各层的职责边界很清楚，改一层不会牵动其它层）：
//   · personal-config-disk-store.ts       —— 锁内读改写、规范化、revision 派生
//   · personal-config-polling.ts          —— 轮询调度（单飞、写代次、错误节流）
//   · personal-config-canonicalization.ts —— 「规范化」的定义
//   · personal-config-repository-contract.ts —— 冻结的构造参数与事件形状
// 本类只持有「订阅者集合 + 关闭标记 + 上次观察到的 revision」，并把三类事件
// （read 失败恢复、外部变更、轮询故障）翻译成对订阅者的广播。
import type { ProviderConfigLayerSnapshot, ProviderConfigLayerUpdate } from "@knorvia/provider";
import type { PersonalProviderConfigRepository } from "@knorvia/provider";
import { createDiskStore } from "./personal-config-disk-store.js";
import { emptyLayer, snapshotOf } from "./personal-config-disk-store.js";
import { createPollingController, type PollingController } from "./personal-config-polling.js";
import { runRead, runUpdate, type RepositoryExecutionHooks } from "./personal-config-execution.js";

// 构造参数与恢复事件形状集中在 personal-config-repository-contract.ts
// （interface.md 冻结的纯类型面），这里再导出以保持模块路径可达。
export type {
  NodePersonalProviderConfigRepositoryOptions,
  PersonalProviderConfigRecoveryEvent,
} from "./personal-config-repository-contract.js";
import type {
  NodePersonalProviderConfigRepositoryOptions,
  PersonalProviderConfigRecoveryEvent,
} from "./personal-config-repository-contract.js";

/** 构造期校验的固定文案（对外可观察，逐字固定）。 */
const FILE_PATH_REQUIRED = "Personal Provider Config filePath 不能为空";
const POLL_INTERVAL_POSITIVE = "Personal Provider Config pollingIntervalMs 必须大于 0";
const REPOSITORY_DISPOSED = "NodePersonalProviderConfigRepository 已 dispose";

/** 未显式配置轮询间隔时的默认值。 */
const DEFAULT_POLL_INTERVAL_MS = 1000;

export class NodePersonalProviderConfigRepository implements PersonalProviderConfigRepository {
  readonly #store: ReturnType<typeof createDiskStore>;
  readonly #polling: PollingController;
  readonly #subscribers = new Set<(reason: string) => void>();
  readonly #recoveryHandler: NodePersonalProviderConfigRepositoryOptions["onRecovery"];
  readonly #pollingFailureHandler: NodePersonalProviderConfigRepositoryOptions["onPollingError"];
  /** 每次成功写盘后自增；轮询用它丢弃「跨越了本进程写入」的结果。 */
  #writeGeneration = 0;
  #observedRevision: string | undefined;
  #disposed = false;

  constructor(options: NodePersonalProviderConfigRepositoryOptions) {
    if (!options.filePath.trim()) {
      throw new Error(FILE_PATH_REQUIRED);
    }
    const interval = options.pollingIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    if (interval !== false && interval <= 0) {
      throw new Error(POLL_INTERVAL_POSITIVE);
    }
    this.#recoveryHandler = options.onRecovery;
    this.#pollingFailureHandler = options.onPollingError;

    this.#store = createDiskStore({
      filePath: options.filePath,
      importLegacy: options.importLegacy,
      // 写盘后推进代次，让「写入前发起的检查」作废。
      onWritten: () => {
        this.#writeGeneration += 1;
      },
    });

    // 轮询控制器只关心「检查结果」：读文件与广播仍由本类负责。
    this.#polling = createPollingController({
      intervalMs: interval,
      inspect: async () => ({
        layer: await this.#store.inspectSnapshot(),
        writeGeneration: this.#writeGeneration,
      }),
      currentWriteGeneration: () => this.#writeGeneration,
      onChanged: (revision) => {
        this.#observedRevision = revision;
        this.#broadcast("poll-changed");
      },
      onFailure: (error) => {
        try {
          this.#pollingFailureHandler?.(error);
        } catch {
          /* 错误回调只是观察者，不能影响轮询循环。 */
        }
        this.#broadcast("poll-error");
      },
      isClosed: () => this.#disposed,
    });
  }

  /**
   * 读快照。
   *
   * 读取失败不退化为异常：先通知恢复回调，再返回空层快照。调用方永远拿得到一个
   * 可用快照，损坏文件由后续写入自愈——这是「配置读不到时仍要能启动」的要求。
   * 横切规则（恢复、武装轮询）在 personal-config-execution.ts。
   *
   * 必须是 `async`：dispose 后的调用要给出**被拒绝的 promise**而不是同步抛错，
   * 否则 `assert.rejects(repository.read())` 这类调用会因同步异常而失效。
   */
  async read(): Promise<ProviderConfigLayerSnapshot> {
    this.#refuseWhenDisposed();
    return runRead(this.#hooks());
  }

  /** 在锁内读 → 变换 → 规范化写盘；成功后广播 `updated`。`async` 的理由同 `read`。 */
  async update(
    transform: (current: ProviderConfigLayerSnapshot) => ProviderConfigLayerUpdate,
  ): Promise<ProviderConfigLayerSnapshot> {
    this.#refuseWhenDisposed();
    return runUpdate(this.#hooks(), transform);
  }

  /**
   * 把本类的私有状态包装成执行钩子。
   *
   * 每次调用新建一份：钩子对象里持有的是闭包而非快照值，
   * 因此 #writeGeneration / #disposed 的变化仍然实时可见。
   */
  #hooks(): RepositoryExecutionHooks {
    return {
      armPolling: () => this.#polling.arm(),
      reportRecovery: (event) => {
        this.#recoveryHandler?.(event);
      },
      remember: (revision) => {
        this.#remember(revision);
      },
      read: () => this.#store.readSnapshot(),
      update: (transform) => this.#store.updateSnapshot(transform),
      notifyUpdated: () => {
        this.#broadcast("updated");
      },
      observe: (revision) => {
        this.#observedRevision = revision;
      },
    };
  }

  onDidChange(listener: (reason: string) => void): () => void {
    this.#refuseWhenDisposed();
    this.#subscribers.add(listener);
    return () => {
      this.#subscribers.delete(listener);
    };
  }

  /** 关闭：停轮询、清订阅。幂等。 */
  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#polling.stop();
    this.#subscribers.clear();
  }

  /** 只在首次读取时记录 revision：它代表「本类最后一次看到的文件内容」。 */
  #remember(revision: string): void {
    this.#observedRevision ??= revision;
  }

  /** 广播一个变更原因；已关闭时静默。 */
  #broadcast(reason: string): void {
    if (this.#disposed) {
      return;
    }
    for (const listener of this.#subscribers) {
      listener(reason);
    }
  }

  #refuseWhenDisposed(): void {
    if (this.#disposed) {
      throw new Error(REPOSITORY_DISPOSED);
    }
  }
}

/** 工厂入口：与类同签名，供只想要实例的调用方使用。 */
export const createNodePersonalProviderConfigRepository = (
  options: NodePersonalProviderConfigRepositoryOptions,
): NodePersonalProviderConfigRepository => new NodePersonalProviderConfigRepository(options);
