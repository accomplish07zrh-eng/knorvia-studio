// SPDX-License-Identifier: Apache-2.0
// 策略提供者：默认"用户自行决定"，可按 workspace 覆盖。写入先校验，值没变就不广播，
// 这样上层的安全修订只反映真实变化。内部用"覆盖表 + 订阅者集合 + 变更类型"表达。
import { workspaceHookPolicySchema, type WorkspaceHookPolicy } from "@knorvia/contracts";

/** 默认策略冻结，避免调用方通过返回值改写共享默认值。 */
const BUILTIN_DEFAULT: WorkspaceHookPolicy = Object.freeze({
  mode: "user_decides",
  policyRevision: "builtin:user-decides:v1",
});

export interface WorkspaceHookPolicyChange {
  workspaceIdentity?: string;
  policy: WorkspaceHookPolicy;
}

export interface WorkspaceHookPolicyProvider {
  getPolicy(workspaceIdentity: string): WorkspaceHookPolicy;
  subscribe(listener: (change: WorkspaceHookPolicyChange) => void): () => void;
}

/** 变更类型表：写明每种写入影响的是"某个 workspace"还是"所有 workspace"。 */
const CHANGE_SCOPE = { default: "all", workspace: "one" } as const;

function canonical(policy: WorkspaceHookPolicy): string {
  return [policy.mode, policy.policyRevision].join("\u0000");
}

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
