// SPDX-License-Identifier: Apache-2.0
// core-hooks 合同 v1 的最小桩（对应 workspace-hook-policy.ts）。仅签名，无实现。
import type { WorkspaceHookPolicy } from "@knorvia/contracts";
export interface WorkspaceHookPolicyChange {
  workspaceIdentity?: string;
  policy: WorkspaceHookPolicy;
}
export interface WorkspaceHookPolicyProvider {
  getPolicy(workspaceIdentity: string): WorkspaceHookPolicy;
  subscribe(listener: (change: WorkspaceHookPolicyChange) => void): () => void;
}
export class InMemoryWorkspaceHookPolicyProvider implements WorkspaceHookPolicyProvider {
  constructor(defaultPolicy?: WorkspaceHookPolicy) {
    void defaultPolicy;
    throw new Error("not implemented: core-hooks");
  }
  getPolicy(workspaceIdentity: string): WorkspaceHookPolicy {
    void workspaceIdentity;
    throw new Error("not implemented: core-hooks");
  }
  subscribe(listener: (change: WorkspaceHookPolicyChange) => void): () => void {
    void listener;
    throw new Error("not implemented: core-hooks");
  }
  setWorkspacePolicy(workspaceIdentity: string, policy: WorkspaceHookPolicy): void {
    void workspaceIdentity;
    void policy;
    throw new Error("not implemented: core-hooks");
  }
  clearWorkspacePolicy(workspaceIdentity: string): void {
    void workspaceIdentity;
    throw new Error("not implemented: core-hooks");
  }
  setDefaultPolicy(policy: WorkspaceHookPolicy): void {
    void policy;
    throw new Error("not implemented: core-hooks");
  }
}
