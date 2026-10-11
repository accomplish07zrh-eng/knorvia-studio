// SPDX-License-Identifier: Apache-2.0
// 信任协调者：持久记录的内存镜像 + 安全修订计数。修订计数用于让准入层知道
// "外部改过信任状态"，从而重新求值并重发 admission 状态。
import {
  workspaceHookPolicySchema,
  workspaceHookTrustRecordSchema,
  type WorkspaceHookBundleSnapshot,
  type WorkspaceHookPolicy,
  type WorkspaceHookReasonCode,
  type WorkspaceHookSecurityRevision,
  type WorkspaceHookTrustRecord,
} from "@knorvia/contracts";
import { evaluateWorkspaceHookEntry, trustKey } from "./workspace-hook-trust-evaluation.js";
import {
  InMemoryWorkspaceHookPolicyProvider,
  type WorkspaceHookPolicyProvider,
} from "./workspace-hook-policy.js";
import type {
  WorkspaceHookSnapshotEvaluation,
  WorkspaceHookTrustStoreState,
} from "./workspace-hook-trust-types.js";

/** 策略提供者不可用或返回非法值时的兜底策略：一律拒绝，且标明失败原因。 */
const FAIL_CLOSED_POLICY: WorkspaceHookPolicy = {
  mode: "deny",
  policyRevision: "provider-error:fail-closed",
  reason: "Workspace Hook policy provider unavailable",
};

export interface WorkspaceHookTrustCoordinatorOptions {
  coordinatorEpoch: string;
  policyProvider?: WorkspaceHookPolicyProvider;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * 协调者不读文件、不做 IO：真实持久化由 adapters 的 Trust store 拥有，
 * 调用方把读到的记录与状态交给 `replacePersistentTrustRecords`。
 */
export class WorkspaceHookTrustCoordinator {
  private readonly coordinatorEpoch: string;
  private readonly policyProvider: WorkspaceHookPolicyProvider;
  private readonly revisions = new Map<string, number>();
  private readonly persistentRecords = new Map<string, WorkspaceHookTrustRecord>();
  private readonly revokedKeys = new Set<string>();
  private storeState: WorkspaceHookTrustStoreState = { status: "missing" };

  constructor(options: WorkspaceHookTrustCoordinatorOptions) {
    if (!options.coordinatorEpoch.trim()) throw new Error("coordinatorEpoch must not be empty");
    this.coordinatorEpoch = options.coordinatorEpoch;
    this.policyProvider = options.policyProvider ?? new InMemoryWorkspaceHookPolicyProvider();
    this.policyProvider.subscribe((change) => {
      if (change.workspaceIdentity) this.bumpRevision(change.workspaceIdentity);
      else for (const identity of this.listKnownWorkspaceIdentities()) this.bumpRevision(identity);
    });
  }

  getPolicy(workspaceIdentity: string): WorkspaceHookPolicy {
    return this.readPolicy(workspaceIdentity).policy;
  }

  /** 抛错版资格判定：applyDecision 的第二道防线。 */
  assertPersistentTrustMutationAllowed(workspaceIdentity: string): void {
    const policy = this.readPolicy(workspaceIdentity).policy;
    if (policy.mode !== "user_decides")
      throw new Error(`Policy ${policy.mode} does not allow persistent Trust mutation`);
  }

  /** 非抛错版：调用方需要在 mutation 前给出精确 reasonCode，不能把策略拒绝误报成 store 损坏。 */
  canMutatePersistentTrust(workspaceIdentity: string): boolean {
    return this.readPolicy(workspaceIdentity).policy.mode === "user_decides";
  }

  replacePersistentTrustRecords(
    records: readonly WorkspaceHookTrustRecord[],
    state: WorkspaceHookTrustStoreState,
  ): void {
    const touched = new Set(
      Array.from(this.persistentRecords.values(), (record) => record.workspaceIdentity),
    );
    this.persistentRecords.clear();

    for (const value of records) {
      const record = workspaceHookTrustRecordSchema.parse(value);
      const key = trustKey(record.workspaceIdentity, record.hookDeclarationDigest);
      this.persistentRecords.set(key, record);
      this.revokedKeys.delete(key);
      touched.add(record.workspaceIdentity);
    }

    this.storeState = { ...state };
    if (state.status === "corrupt")
      for (const identity of this.listKnownWorkspaceIdentities()) touched.add(identity);
    for (const identity of touched) this.bumpRevision(identity);
  }

  revoke(input: {
    workspaceIdentity: string;
    hookDeclarationDigests: readonly string[];
  }): WorkspaceHookSecurityRevision {
    for (const digest of unique(input.hookDeclarationDigests)) {
      const key = trustKey(input.workspaceIdentity, digest);
      this.persistentRecords.delete(key);
      this.revokedKeys.add(key);
    }
    return this.bumpRevision(input.workspaceIdentity);
  }

  evaluateSnapshot(input: {
    snapshot: WorkspaceHookBundleSnapshot;
  }): WorkspaceHookSnapshotEvaluation {
    const workspaceIdentity = input.snapshot.workspaceIdentity;
    this.ensureRevision(workspaceIdentity);
    const policyResult = this.readPolicy(workspaceIdentity);

    return {
      bundleDigest: input.snapshot.bundleDigest,
      items: input.snapshot.hooks.map((entry) =>
        evaluateWorkspaceHookEntry({
          entry,
          persistentRecords: this.persistentRecords,
          policy: policyResult.policy,
          revokedKeys: this.revokedKeys,
          snapshot: input.snapshot,
          storeStatus: this.storeState.status,
        }),
      ),
      policy: policyResult.policy,
      ...(policyResult.reasonCode
        ? { reasonCode: policyResult.reasonCode }
        : this.storeState.status === "corrupt"
          ? { reasonCode: "workspace_hooks_trust_store_corrupt" as const }
          : {}),
      securityRevision: this.getSecurityRevision(workspaceIdentity),
      storeStatus: this.storeState.status,
      workspaceIdentity,
    };
  }

  getSecurityRevision(workspaceIdentity: string): WorkspaceHookSecurityRevision {
    return { coordinatorEpoch: this.coordinatorEpoch, counter: this.ensureRevision(workspaceIdentity) };
  }

  validateSecurityRevision(
    workspaceIdentity: string,
    revision: WorkspaceHookSecurityRevision,
  ): boolean {
    return (
      revision.coordinatorEpoch === this.coordinatorEpoch &&
      revision.counter === this.ensureRevision(workspaceIdentity)
    );
  }

  private readPolicy(workspaceIdentity: string): {
    policy: WorkspaceHookPolicy;
    reasonCode?: WorkspaceHookReasonCode;
  } {
    try {
      return {
        policy: workspaceHookPolicySchema.parse(this.policyProvider.getPolicy(workspaceIdentity)),
      };
    } catch {
      return { policy: FAIL_CLOSED_POLICY, reasonCode: "workspace_hooks_blocked_by_policy" };
    }
  }

  private bumpRevision(workspaceIdentity: string): WorkspaceHookSecurityRevision {
    const counter = this.ensureRevision(workspaceIdentity) + 1;
    this.revisions.set(workspaceIdentity, counter);
    return { coordinatorEpoch: this.coordinatorEpoch, counter };
  }

  private ensureRevision(workspaceIdentity: string): number {
    const current = this.revisions.get(workspaceIdentity);
    if (current !== undefined) return current;
    this.revisions.set(workspaceIdentity, 0);
    return 0;
  }

  private listKnownWorkspaceIdentities(): Set<string> {
    const identities = new Set(this.revisions.keys());
    for (const record of this.persistentRecords.values()) identities.add(record.workspaceIdentity);
    return identities;
  }
}
