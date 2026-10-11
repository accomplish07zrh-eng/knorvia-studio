// SPDX-License-Identifier: Apache-2.0
// workspace Hook 策略：默认"用户自行决定"，可按 workspace 覆盖；变更通过订阅通知信任协调者。
import { workspaceHookPolicySchema, type WorkspaceHookPolicy } from "@knorvia/contracts";

/** 默认策略对象冻结：调用方不得通过返回值改写共享默认值。 */
const DEFAULT_POLICY: WorkspaceHookPolicy = Object.freeze({
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

function equalPolicy(left: WorkspaceHookPolicy, right: WorkspaceHookPolicy): boolean {
  return left.mode === right.mode && left.policyRevision === right.policyRevision;
}

/**
 * 内存策略提供者。所有写入先过 schema；写入相同值不发通知，
 * 这样上层 revision 计数只反映真实变化。
 */
export class InMemoryWorkspaceHookPolicyProvider implements WorkspaceHookPolicyProvider {
  private readonly listeners = new Set<(change: WorkspaceHookPolicyChange) => void>();
  private readonly policies = new Map<string, WorkspaceHookPolicy>();
  private defaultPolicy: WorkspaceHookPolicy;

  constructor(defaultPolicy: WorkspaceHookPolicy = DEFAULT_POLICY) {
    this.defaultPolicy = workspaceHookPolicySchema.parse(defaultPolicy);
  }

  getPolicy(workspaceIdentity: string): WorkspaceHookPolicy {
    return this.policies.get(workspaceIdentity) ?? this.defaultPolicy;
  }

  subscribe(listener: (change: WorkspaceHookPolicyChange) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setWorkspacePolicy(workspaceIdentity: string, policy: WorkspaceHookPolicy): void {
    const next = workspaceHookPolicySchema.parse(policy);
    const current = this.policies.get(workspaceIdentity);
    if (current && equalPolicy(current, next)) return;
    this.policies.set(workspaceIdentity, next);
    this.emit({ policy: next, workspaceIdentity });
  }

  clearWorkspacePolicy(workspaceIdentity: string): void {
    if (!this.policies.delete(workspaceIdentity)) return;
    this.emit({ policy: this.defaultPolicy, workspaceIdentity });
  }

  setDefaultPolicy(policy: WorkspaceHookPolicy): void {
    const next = workspaceHookPolicySchema.parse(policy);
    if (equalPolicy(this.defaultPolicy, next)) return;
    this.defaultPolicy = next;
    this.emit({ policy: next });
  }

  private emit(change: WorkspaceHookPolicyChange): void {
    for (const listener of [...this.listeners]) listener(change);
  }
}
