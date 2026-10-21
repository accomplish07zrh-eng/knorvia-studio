// SPDX-License-Identifier: Apache-2.0
// 默认模型选择的仓储视图。
//
// 关键事实：默认选择**不是**独立存储，它只是 Personal provider 配置文件里的一个字段。
// 所以本类不拥有 IO、锁与失效通知——那些都归共享的 Personal Repository；
// 本视图只持有一份「自己登记过的退订动作」清单，用来在 dispose 时干净退出。
//
// 这样设计避免第二份可写副本：任何写入都经 Personal Repository 的单一通道。
import type { ModelSelection, PersonalProviderConfigRepository } from "@knorvia/provider";

export interface NodeModelSelectionConfigRepositoryOptions {
  readonly personalRepository: PersonalProviderConfigRepository;
}

export class NodeModelSelectionConfigRepository {
  readonly #delegate: PersonalProviderConfigRepository;
  readonly #releases: Array<() => void> = [];
  #closed = false;

  constructor(options: NodeModelSelectionConfigRepositoryOptions) {
    this.#delegate = options.personalRepository;
  }

  /** 当前默认选择；文件里没配就是 `undefined`。 */
  async read(): Promise<ModelSelection | undefined> {
    this.#requireLive();
    const { defaultModelSelection } = await this.#delegate.read();
    return defaultModelSelection;
  }

  /**
   * 写回默认选择，并以**落盘后的快照**为返回值。
   *
   * 不回显入参：文件可能被规范化（键序、未知字段剔除），以文件为准才不会让调用方
   * 看到与磁盘不一致的值。
   */
  async saveConfiguredDefault(
    selection: ModelSelection | undefined,
  ): Promise<ModelSelection | undefined> {
    this.#requireLive();
    const next = await this.#delegate.update((draft) => ({
      ...draft,
      defaultModelSelection: selection,
    }));
    return next.defaultModelSelection;
  }

  /**
   * 订阅变更。
   *
   * 返回本视图自己的退订句柄（而不是底层句柄）：dispose 需要一次性摘掉全部订阅，
   * 因此必须自己留一份登记。
   */
  onDidChange(listener: (reason: string) => void): () => void {
    this.#requireLive();
    const releaseDelegate = this.#delegate.onDidChange(listener);
    const release = () => {
      const index = this.#releases.indexOf(release);
      if (index >= 0) this.#releases.splice(index, 1);
      releaseDelegate();
    };
    this.#releases.push(release);
    return release;
  }

  /**
   * 关闭本视图：只摘自己的订阅，**不**销毁共享的 Personal Repository
   * （它的生命周期属于 Config Runtime）。幂等。
   */
  dispose(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    // 倒序释放：后登记的先摘，与栈展开语义一致。
    while (this.#releases.length > 0) {
      this.#releases.pop()?.();
    }
  }

  #requireLive(): void {
    if (this.#closed) {
      throw new Error("NodeModelSelectionConfigRepository 已 dispose");
    }
  }
}
