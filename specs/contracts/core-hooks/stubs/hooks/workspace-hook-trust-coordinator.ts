// SPDX-License-Identifier: Apache-2.0
// core-hooks 合同 v1 的最小桩（对应 workspace-hook-trust-coordinator.ts）。仅签名，无实现。
import type {
  WorkspaceHookBundleSnapshot,
  WorkspaceHookPolicy,
  WorkspaceHookSecurityRevision,
  WorkspaceHookTrustRecord,
} from "@knorvia/contracts";
import type { WorkspaceHookPolicyProvider } from "./workspace-hook-policy.js";
import type {
  WorkspaceHookSnapshotEvaluation,
  WorkspaceHookTrustStoreState,
} from "./workspace-hook-trust-types.js";
export interface WorkspaceHookTrustCoordinatorOptions {
  coordinatorEpoch: string;
  policyProvider?: WorkspaceHookPolicyProvider;
}
export class WorkspaceHookTrustCoordinator {
  constructor(options: WorkspaceHookTrustCoordinatorOptions) {
    void options;
    throw new Error("not implemented: core-hooks");
  }
  getPolicy(workspaceIdentity: string): WorkspaceHookPolicy {
    void workspaceIdentity;
    throw new Error("not implemented: core-hooks");
  }
  assertPersistentTrustMutationAllowed(workspaceIdentity: string): void {
    void workspaceIdentity;
    throw new Error("not implemented: core-hooks");
  }
  canMutatePersistentTrust(workspaceIdentity: string): boolean {
    void workspaceIdentity;
    throw new Error("not implemented: core-hooks");
  }
  replacePersistentTrustRecords(
    records: readonly WorkspaceHookTrustRecord[],
    state: WorkspaceHookTrustStoreState,
  ): void {
    void records;
    void state;
    throw new Error("not implemented: core-hooks");
  }
  revoke(input: {
    workspaceIdentity: string;
    hookDeclarationDigests: readonly string[];
  }): WorkspaceHookSecurityRevision {
    void input;
    throw new Error("not implemented: core-hooks");
  }
  evaluateSnapshot(input: {
    snapshot: WorkspaceHookBundleSnapshot;
  }): WorkspaceHookSnapshotEvaluation {
    void input;
    throw new Error("not implemented: core-hooks");
  }
  getSecurityRevision(workspaceIdentity: string): WorkspaceHookSecurityRevision {
    void workspaceIdentity;
    throw new Error("not implemented: core-hooks");
  }
  validateSecurityRevision(
    workspaceIdentity: string,
    revision: WorkspaceHookSecurityRevision,
  ): boolean {
    void workspaceIdentity;
    void revision;
    throw new Error("not implemented: core-hooks");
  }
}
