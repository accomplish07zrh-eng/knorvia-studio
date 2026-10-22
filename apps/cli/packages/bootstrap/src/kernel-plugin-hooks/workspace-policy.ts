// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// workspace Hook 策略提供者（B10 的 8 条规格）。
//
// 依据：`specs/contracts/core-hooks/behavior.md` B10。
//
// 职责：决定「某个 workspace 的 Hook 处于什么信任模式」。
// 三种模式（B10.1 + B12.1）：
//   · `user_decides`（默认）—— 用户决定；只有此模式允许修改持久信任记录（B10.9）
//   · `allow_trusted_only`   —— 只允许已持久信任的 Hook（B12.3）
//   · `deny`                 —— 全部拒绝（B12.1）
//
// 设计要点：
//   ① **状态所有者是实例**，无全局单例（B10.8）
//   ② **无变化不通知**（B10.3/B10.4/B10.5）—— 避免订阅者做无谓刷新
//   ③ **非法策略抛错且状态不变**（B10.7）—— 不留下半更新状态

/**
 * workspace 身份标识。
 *
 * 用裸 `string` 而不是单独的 brand 类型：本模块只把它当 Map 的键，
 * 而身份归一化（`workspaceIdentity?.trim() || workspacePath`）由调用方负责。
 */
export type WorkspaceIdentity = string;

/** 信任模式（B10.1 / B12）。 */
export type WorkspaceHookPolicyMode = "user_decides" | "allow_trusted_only" | "deny";

/** 一条策略。 */
export interface WorkspaceHookPolicy {
  readonly mode: WorkspaceHookPolicyMode;
  readonly policyRevision: string;
}

/** 默认策略的冻结对象（B10.1）。 */
export const DEFAULT_WORKSPACE_HOOK_POLICY: WorkspaceHookPolicy = Object.freeze({
  mode: "user_decides",
  policyRevision: "builtin:user-decides:v1",
});

/** 策略变更通知（B10.3 / B10.5）。 */
export interface WorkspaceHookPolicyChange {
  /** 有它表示「某个 workspace 的策略变了」；无它表示「默认策略变了」。 */
  readonly workspaceIdentity?: WorkspaceIdentity;
  readonly policy: WorkspaceHookPolicy;
}

export type WorkspaceHookPolicyListener = (change: WorkspaceHookPolicyChange) => void;

/**
 * 校验策略（B10.7 的「按 schema 校验」）。
 *
 * 只接受三种模式与一个非空 revision —— 因为「策略」是安全相关的，
 * 不接受任意字符串（避免拼错模式名后被当成「未知模式」而静默放行）。
 */
export function isValidWorkspaceHookPolicy(value: unknown): value is WorkspaceHookPolicy {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const mode = candidate.mode;
  const revision = candidate.policyRevision;
  return (
    (mode === "user_decides" || mode === "allow_trusted_only" || mode === "deny") &&
    typeof revision === "string" &&
    revision.length > 0
  );
}

/**
 * workspace Hook 策略提供者。
 *
 * 一个实例拥有自己的状态（B10.8）—— 没有模块级全局变量，
 * 这样测试之间互不污染，也让组合根能按需创建多个。
 */
export class WorkspaceHookPolicyProvider {
  /** workspace → 策略。用 Map 而不是对象：identity 可能含 `__proto__` 这类键。 */
  readonly #byIdentity = new Map<WorkspaceIdentity, WorkspaceHookPolicy>();
  #defaultPolicy: WorkspaceHookPolicy = DEFAULT_WORKSPACE_HOOK_POLICY;
  readonly #listeners = new Set<WorkspaceHookPolicyListener>();

  /** 读取某 workspace 的策略；未知 identity 返回当前默认策略（B10.2）。 */
  getPolicy(identity: WorkspaceIdentity): WorkspaceHookPolicy {
    return this.#byIdentity.get(identity) ?? this.#defaultPolicy;
  }

  /**
   * 设置某 workspace 的策略（B10.3）。
   *
   * 与现值 JSON 相等 → **不通知**（避免订阅者刷新无变化的状态）。
   * 非法策略 → 抛错且状态不变（B10.7）。
   */
  setWorkspacePolicy(identity: WorkspaceIdentity, policy: WorkspaceHookPolicy): void {
    if (!isValidWorkspaceHookPolicy(policy)) {
      throw new Error(`Invalid workspace hook policy: ${JSON.stringify(policy)}`);
    }
    const current = this.#byIdentity.get(identity);
    if (current !== undefined && JSON.stringify(current) === JSON.stringify(policy)) return;

    this.#byIdentity.set(identity, policy);
    this.#notify({ workspaceIdentity: identity, policy });
  }

  /**
   * 清除某 workspace 的策略（B10.4）。
   *
   * 本没有 → 不通知；有 → 删除并通知「回落到默认策略」。
   */
  clearWorkspacePolicy(identity: WorkspaceIdentity): void {
    if (!this.#byIdentity.has(identity)) return;
    this.#byIdentity.delete(identity);
    this.#notify({ workspaceIdentity: identity, policy: this.#defaultPolicy });
  }

  /**
   * 设置默认策略（B10.5）。
   *
   * 通知**不带** `workspaceIdentity` —— 因为它影响的是「没有专属策略的 workspace」。
   */
  setDefaultPolicy(policy: WorkspaceHookPolicy): void {
    if (!isValidWorkspaceHookPolicy(policy)) {
      throw new Error(`Invalid default workspace hook policy: ${JSON.stringify(policy)}`);
    }
    if (JSON.stringify(this.#defaultPolicy) === JSON.stringify(policy)) return;

    this.#defaultPolicy = policy;
    this.#notify({ policy });
  }

  /** 订阅变更；返回取消订阅函数（B10.6）。 */
  subscribe(listener: WorkspaceHookPolicyListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * 判断某 workspace 是否允许修改持久信任记录（B10.9）。
   *
   * 只有 `user_decides` 模式允许 —— 其他模式下「持久信任」这个概念本身不适用
   * （`deny` 全拒、`allow_trusted_only` 只读既有记录）。
   */
  canMutatePersistentTrust(identity: WorkspaceIdentity): boolean {
    return this.getPolicy(identity).mode === "user_decides";
  }

  /**
   * 断言允许修改持久信任；否则抛错（B10.9）。
   *
   * 错误信息含模式名 —— 让调用方能告诉用户「当前模式不允许」。
   */
  assertPersistentTrustMutationAllowed(identity: WorkspaceIdentity): void {
    const policy = this.getPolicy(identity);
    if (policy.mode !== "user_decides") {
      throw new Error(
        `Persistent trust mutation is not allowed under policy mode "${policy.mode}"`,
      );
    }
  }

  /** 广播变更；listener 抛错不影响其他 listener（订阅者之间互不阻塞）。 */
  #notify(change: WorkspaceHookPolicyChange): void {
    for (const listener of [...this.#listeners]) {
      try {
        listener(change);
      } catch {
        // 一个订阅者抛错不应阻断其他订阅者 —— 策略状态已经变更，通知是尽力而为。
      }
    }
  }
}
