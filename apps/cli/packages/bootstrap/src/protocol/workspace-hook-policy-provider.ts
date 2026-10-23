// SPDX-License-Identifier: Apache-2.0
// Workspace hook 策略提供者（从 core 的 hooks/types.ts + hooks/workspace-hook-policy.ts 内联）。
//
// kernel-switch 前置：新引擎只在三处用到这两个符号 ——
//   · protocol/server-types.ts：只把 WorkspaceHookPolicyProvider 当依赖类型
//   · protocol/server.ts：`new InMemoryWorkspaceHookPolicyProvider()` 作为缺省实现
//   · protocol/workspace-hook-trust.ts：只当参数类型
// 所以只搬「接口 + 变更类型 + 实现类」，core 里 hooks/types.ts 的其余 20+ 个类型
// （HookEventName / HookInput / HookJSONOutput / runner 相关等）新引擎不用，不搬。
//
// 行为约定（逐字保留自原实现）：默认「用户自行决定」，可按 workspace 覆盖；
// 写入先经 schema 校验，值没变就不广播，这样上层的安全修订只反映真实变化。
import { workspaceHookPolicySchema, type WorkspaceHookPolicy } from "@knorvia/contracts";

/** 策略变更通知：只影响某个 workspace 时带 identity，改默认时省略。 */
export interface WorkspaceHookPolicyChange {
  workspaceIdentity?: string;
  policy: WorkspaceHookPolicy;
}

/** 策略提供者端口：按 workspace 取策略 + 订阅变更。 */
export interface WorkspaceHookPolicyProvider {
  getPolicy(workspaceIdentity: string): WorkspaceHookPolicy;
  subscribe(listener: (change: WorkspaceHookPolicyChange) => void): () => void;
}

/** 默认策略冻结，避免调用方通过返回值改写共享默认值。 */
const BUILTIN_DEFAULT: WorkspaceHookPolicy = Object.freeze({
  mode: "user_decides",
  policyRevision: "builtin:user-decides:v1",
});

/** 变更类型表：写明每种写入影响的是"某个 workspace"还是"所有 workspace"。 */
const CHANGE_SCOPE = { default: "all", workspace: "one" } as const;

/** 策略的规范化指纹：两个字段拼起来，用来判断「值有没有真的变」。 */
function canonical(policy: WorkspaceHookPolicy): string {
  return [policy.mode, policy.policyRevision].join("\u0000");
}

/**
 * 内存实现：覆盖表 + 订阅者集合 + 变更类型。
 *
 * `setWorkspacePolicy` 改某个 workspace，`setDefaultPolicy` 改兜底；
 * 两者都走 `commit` —— 先算"现在是什么"，相同就不广播。
 */
export class InMemoryWorkspaceHookPolicyProvider implements WorkspaceHookPolicyProvider {
  private readonly overrides = new Map<string, WorkspaceHookPolicy>();
  private readonly subscribers = new Set<(change: WorkspaceHookPolicyChange) => void>();
  private fallback: WorkspaceHookPolicy;

  constructor(initial: WorkspaceHookPolicy = BUILTIN_DEFAULT) {
    this.fallback = workspaceHookPolicySchema.parse(initial);
  }

  getPolicy(identity: string): WorkspaceHookPolicy {
    const found = this.overrides.get(identity);
    return found === undefined ? this.fallback : found;
  }

  subscribe(handler: (update: WorkspaceHookPolicyChange) => void): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  setWorkspacePolicy(identity: string, next: WorkspaceHookPolicy): void {
    this.commit(CHANGE_SCOPE.workspace, identity, workspaceHookPolicySchema.parse(next));
  }

  clearWorkspacePolicy(identity: string): void {
    if (!this.overrides.has(identity)) return;
    this.overrides.delete(identity);
    this.broadcast({ policy: this.fallback, workspaceIdentity: identity });
  }

  setDefaultPolicy(next: WorkspaceHookPolicy): void {
    this.commit(CHANGE_SCOPE.default, undefined, workspaceHookPolicySchema.parse(next));
  }

  /** 两类写入共用一条提交路径：先算"现在是什么"，相同就不广播。 */
  private commit(
    scope: (typeof CHANGE_SCOPE)[keyof typeof CHANGE_SCOPE],
    identity: string | undefined,
    next: WorkspaceHookPolicy,
  ): void {
    if (scope === CHANGE_SCOPE.workspace && identity !== undefined) {
      const current = this.overrides.get(identity);
      if (current && canonical(current) === canonical(next)) return;
      this.overrides.set(identity, next);
      this.broadcast({ policy: next, workspaceIdentity: identity });
      return;
    }
    if (canonical(this.fallback) === canonical(next)) return;
    this.fallback = next;
    this.broadcast({ policy: next });
  }

  private broadcast(change: WorkspaceHookPolicyChange): void {
    for (const subscriber of Array.from(this.subscribers)) subscriber(change);
  }
}
