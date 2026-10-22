// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// workspace Hook 信任协调者（B11 的 7 条规格）。
//
// 依据：`specs/contracts/core-hooks/behavior.md` B11。
//
// 职责：维护「安全版本」——让 UI 知道「信任状态是否已变化」。
//
// 为什么需要它：
//   用户批准一个 Hook 后，UI 上「待审批」列表必须刷新。
//   而刷新依据不能是「轮询」或「时间戳」，必须是**单调递增的安全版本号**——
//   否则并发下会漏刷新或重复刷新。
//
// 设计要点：
//   ① `coordinatorEpoch` 区分「不同的协调者实例代」——
//      epoch 不同意味着「跨代」，旧 revision 一律失效（B11.4）
//   ② `counter` 单调递增，**只增不减**（不因 revoke 而回退）
//   ③ 默认策略变更要 bump **所有已知 identity**（B11.3）——
//      因为它们都可能受影响
import type { WorkspaceIdentity } from "./workspace-policy.js";

/** 安全版本（B11.2）。 */
export interface WorkspaceHookSecurityRevision {
  readonly coordinatorEpoch: string;
  readonly counter: number;
}

/** 一条持久信任记录（B11.5 的索引对象）。 */
export interface PersistentTrustRecord {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly hookDeclarationDigest: string;
}

/** 持久记录集合的存储状态（B11.5）。 */
export interface PersistentTrustState {
  readonly status: "ok" | "corrupt";
}

/** `replacePersistentTrustRecords` 的入参。 */
export interface ReplacePersistentTrustRecordsRequest {
  readonly records: readonly PersistentTrustRecord[];
  readonly state: PersistentTrustState;
}

/** `revoke` 的入参（B11.6）。 */
export interface RevokeRequest {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly hookDeclarationDigests: readonly string[];
}

/**
 * 索引 key 的分隔符（B11.5）。
 *
 * 用 `\u0000` 而不是 `:` —— 因为 identity 与 digest 都可能含 `:`，
 * 而 NUL 不会出现在正常字符串里，能保证 key 唯一。
 */
const INDEX_SEPARATOR = "\u0000";

/** 拼索引 key。 */
function indexKey(identity: WorkspaceIdentity, digest: string): string {
  return `${identity}${INDEX_SEPARATOR}${digest}`;
}

/**
 * 信任协调者。
 *
 * 状态所有者是实例（无全局单例）—— 与 B10 的策略提供者一致。
 */
export class WorkspaceHookTrustCoordinator {
  readonly #epoch: string;
  /** identity → counter。首次访问时取当前全局 counter 的初值 0。 */
  readonly #counters = new Map<WorkspaceIdentity, number>();
  /** 已持久化的记录（key = identity + NUL + digest）。 */
  readonly #records = new Map<string, PersistentTrustRecord>();
  /** 撤销集合（key 同上）。 */
  readonly #revoked = new Set<string>();
  /** 最近一次 `replacePersistentTrustRecords` 保存的 state（B11.5）。 */
  #state: PersistentTrustState | undefined;

  /**
   * @param coordinatorEpoch 协调者实例代；**空白字符串视为配置错误**（B11.1）。
   */
  constructor(coordinatorEpoch: string) {
    if (coordinatorEpoch.trim().length === 0) {
      throw new Error("Workspace hook trust coordinator requires a non-empty coordinatorEpoch");
    }
    this.#epoch = coordinatorEpoch;
  }

  /** 读取某 workspace 的当前安全版本（B11.2）。 */
  getSecurityRevision(identity: WorkspaceIdentity): WorkspaceHookSecurityRevision {
    // ⚠️ 读取时**登记**这个 identity：B11.3 说「已知 = 已出现过的 revision key」——
    //    而「出现过」包含「被读过」。若不登记，`bumpAllKnown` 会漏掉
    //    「只读过、没 bump 过」的 workspace，导致它们的 UI 不刷新。
    if (!this.#counters.has(identity)) this.#counters.set(identity, 0);
    return { coordinatorEpoch: this.#epoch, counter: this.#counters.get(identity) ?? 0 };
  }

  /**
   * 校验客户端持有的 revision 是否仍有效（B11.4）。
   *
   * 只有 epoch 与 counter **都相等**才算有效 ——
   * epoch 不同意味着「跨代」（协调者重建过），counter 不同意味着「已变更」。
   */
  validateSecurityRevision(
    identity: WorkspaceIdentity,
    revision: WorkspaceHookSecurityRevision,
  ): boolean {
    if (revision.coordinatorEpoch !== this.#epoch) return false;
    return revision.counter === (this.#counters.get(identity) ?? 0);
  }

  /**
   * bump 某 workspace 的 counter（B11.3）。
   *
   * **只增不减** —— 即使 revoke 也不会回退，否则旧 revision 会「重新有效」。
   */
  bumpWorkspace(identity: WorkspaceIdentity): WorkspaceHookSecurityRevision {
    this.#counters.set(identity, (this.#counters.get(identity) ?? 0) + 1);
    return this.getSecurityRevision(identity);
  }

  /**
   * bump **所有已知 identity**（B11.3 的「默认策略级」）。
   *
   * 「已知」= 已出现过的 revision key ∪ 持久记录的 workspace。
   */
  bumpAllKnown(): void {
    const known = new Set<WorkspaceIdentity>(this.#counters.keys());
    for (const record of this.#records.values()) known.add(record.workspaceIdentity);
    for (const identity of known) this.bumpWorkspace(identity);
  }

  /**
   * 替换持久信任记录（B11.5）。
   *
   * 行为：
   *   · 写入新记录，同时**清除对应撤销标记**（「重新信任」应覆盖「曾经撤销」）
   *   · 被替换掉的记录所在 workspace 也要 bump
   *   · `state.status === "corrupt"` 时 bump **所有已知 identity**
   */
  replacePersistentTrustRecords(request: ReplacePersistentTrustRecordsRequest): void {
    const affected = new Set<WorkspaceIdentity>();

    // 旧记录里「将被移除」的 workspace 也要 bump（它们的状态变了）。
    for (const [key, record] of this.#records) {
      affected.add(record.workspaceIdentity);
      this.#revoked.delete(key);
    }

    this.#records.clear();
    for (const record of request.records) {
      const key = indexKey(record.workspaceIdentity, record.hookDeclarationDigest);
      this.#records.set(key, record);
      // 「重新信任」应覆盖「曾经撤销」（B11.5）。
      this.#revoked.delete(key);
      affected.add(record.workspaceIdentity);
    }

    this.#state = request.state;

    // corrupt 状态影响所有已知 identity（B11.5）。
    if (request.state.status === "corrupt") {
      this.bumpAllKnown();
      return;
    }

    for (const identity of affected) this.bumpWorkspace(identity);
  }

  /**
   * 撤销若干 Hook 的持久信任（B11.6）。
   *
   * digest **去重**；删除记录并记入撤销集合；bump 该 identity 并返回新 revision。
   */
  revoke(request: RevokeRequest): WorkspaceHookSecurityRevision {
    const digests = [...new Set(request.hookDeclarationDigests)];
    for (const digest of digests) {
      const key = indexKey(request.workspaceIdentity, digest);
      this.#records.delete(key);
      this.#revoked.add(key);
    }
    return this.bumpWorkspace(request.workspaceIdentity);
  }

  /** 判断某条记录是否被撤销（供 B12 判定使用）。 */
  isRevoked(identity: WorkspaceIdentity, digest: string): boolean {
    return this.#revoked.has(indexKey(identity, digest));
  }

  /** 取某条持久记录（供 B12 判定使用）；不存在返回 undefined。 */
  getPersistentRecord(
    identity: WorkspaceIdentity,
    digest: string,
  ): PersistentTrustRecord | undefined {
    return this.#records.get(indexKey(identity, digest));
  }

  /** 当前保存的存储状态（供 B12 的 `corrupt` 判定使用）。 */
  getStoreStatus(): "ok" | "corrupt" | undefined {
    return this.#state?.status;
  }
}
