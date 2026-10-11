// SPDX-License-Identifier: Apache-2.0
// 信任协调者：持久记录的内存镜像与安全修订计数。修订用来让准入层发现"外部改过信任状态"。
// 组织方式：状态收在一个对象里，所有会改变判断依据的动作都走同一条"提交 + 打点"路径。
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

/** 策略不可用时的兜底：一律拒绝，并把失败原因写在策略自身上。 */
const FALLBACK_POLICY: WorkspaceHookPolicy = {
  mode: "deny",
  policyRevision: "provider-error:fail-closed",
  reason: "Workspace Hook policy provider unavailable",
};

export interface WorkspaceHookTrustCoordinatorOptions {
  coordinatorEpoch: string;
  policyProvider?: WorkspaceHookPolicyProvider;
}

interface CoordinatorState {
  records: Map<string, WorkspaceHookTrustRecord>;
  revoked: Set<string>;
  store: WorkspaceHookTrustStoreState;
  counters: Map<string, number>;
}

function freshState(): CoordinatorState {
  return { counters: new Map(), records: new Map(), revoked: new Set(), store: { status: "missing" } };
}

function distinct(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

/**
 * 协调者不做 IO：真实持久化归 adapters 的 Trust store，调用方把读到的记录与状态交进来。
 * 只保留"内存镜像 + 修订号 + 资格判定"三件事。
 */
export class WorkspaceHookTrustCoordinator {
  private readonly epoch: string;
  private readonly policies: WorkspaceHookPolicyProvider;
  private state: CoordinatorState = freshState();

  constructor(options: WorkspaceHookTrustCoordinatorOptions) {
    const epoch = options.coordinatorEpoch.trim();
    if (epoch.length === 0) throw new Error("coordinatorEpoch must not be empty");
    this.epoch = epoch;
    this.policies = options.policyProvider ?? new InMemoryWorkspaceHookPolicyProvider();
    this.policies.subscribe((change) => {
      const targets =
        change.workspaceIdentity === undefined
          ? Array.from(this.knownWorkspaces())
          : [change.workspaceIdentity];
      for (const workspace of targets) this.commit(workspace);
    });
  }

  getPolicy(identity: string): WorkspaceHookPolicy {
    return this.resolvePolicy(identity).policy;
  }

  /** 抛错版资格判定，用作写入路径的第二道防线。 */
  assertPersistentTrustMutationAllowed(identity: string): void {
    const { mode } = this.resolvePolicy(identity).policy;
    if (mode !== "user_decides")
      throw new Error(`Policy ${mode} does not allow persistent Trust mutation`);
  }

  /** 非抛错版：让调用方在写入前得到精确 reasonCode，而不是把策略拒绝误报成 store 损坏。 */
  canMutatePersistentTrust(identity: string): boolean {
    return this.resolvePolicy(identity).policy.mode === "user_decides";
  }

  replacePersistentTrustRecords(
    records: readonly WorkspaceHookTrustRecord[],
    store: WorkspaceHookTrustStoreState,
  ): void {
    const touched = new Set(
      Array.from(this.state.records.values(), (record) => record.workspaceIdentity),
    );
    const next = freshState();
    // 修订计数不属于被替换的数据：记录换代后仍要继续递增，否则准入层会误判"没变过"。
    next.counters = this.state.counters;
    next.store = { ...store };

    for (const value of records) {
      const record = workspaceHookTrustRecordSchema.parse(value);
      next.records.set(trustKey(record.workspaceIdentity, record.hookDeclarationDigest), record);
      touched.add(record.workspaceIdentity);
    }
    this.state = next;

    if (store.status === "corrupt")
      for (const workspace of this.knownWorkspaces()) touched.add(workspace);
    for (const workspace of touched) this.commit(workspace);
  }

  revoke(request: {
    workspaceIdentity: string;
    hookDeclarationDigests: readonly string[];
  }): WorkspaceHookSecurityRevision {
    for (const digest of distinct(request.hookDeclarationDigests)) {
      const key = trustKey(request.workspaceIdentity, digest);
      this.state.records.delete(key);
      this.state.revoked.add(key);
    }
    return this.commit(request.workspaceIdentity);
  }

  evaluateSnapshot(request: {
    snapshot: WorkspaceHookBundleSnapshot;
  }): WorkspaceHookSnapshotEvaluation {
    const workspaceIdentity = request.snapshot.workspaceIdentity;
    if (!this.state.counters.has(workspaceIdentity)) this.state.counters.set(workspaceIdentity, 0);
    const { policy, reasonCode } = this.resolvePolicy(workspaceIdentity);
    const items = request.snapshot.hooks.map((entry) =>
      evaluateWorkspaceHookEntry({
        entry,
        persistentRecords: this.state.records,
        policy,
        revokedKeys: this.state.revoked,
        snapshot: request.snapshot,
        storeStatus: this.state.store.status,
      }),
    );

    const pairs: (readonly [string, unknown])[] = [
      ["bundleDigest", request.snapshot.bundleDigest],
      ["items", items],
      ["policy", policy],
      ["securityRevision", this.getSecurityRevision(workspaceIdentity)],
      ["storeStatus", this.state.store.status],
      ["workspaceIdentity", workspaceIdentity],
    ];
    const failure =
      reasonCode ?? (this.state.store.status === "corrupt" ? "workspace_hooks_trust_store_corrupt" : undefined);
    if (failure) pairs.push(["reasonCode", failure]);
    return Object.fromEntries(pairs) as unknown as WorkspaceHookSnapshotEvaluation;
  }

  getSecurityRevision(identity: string): WorkspaceHookSecurityRevision {
    const counter = this.state.counters.get(identity) ?? 0;
    if (!this.state.counters.has(identity)) this.state.counters.set(identity, 0);
    return { coordinatorEpoch: this.epoch, counter };
  }

  validateSecurityRevision(
    identity: string,
    revision: WorkspaceHookSecurityRevision,
  ): boolean {
    const matches = [
      revision.coordinatorEpoch === this.epoch,
      revision.counter === this.getSecurityRevision(identity).counter,
    ];
    return matches.every(Boolean);
  }

  /** 修订 +1 的唯一入口；所有影响判断依据的动作最后都落到这里。 */
  private commit(identity: string): WorkspaceHookSecurityRevision {
    const next = (this.state.counters.get(identity) ?? 0) + 1;
    this.state.counters.set(identity, next);
    return { coordinatorEpoch: this.epoch, counter: next };
  }

  private resolvePolicy(identity: string): {
    policy: WorkspaceHookPolicy;
    reasonCode?: WorkspaceHookReasonCode;
  } {
    const provided = this.policies.getPolicy(identity);
    const parsed = workspaceHookPolicySchema.safeParse(provided);
    return parsed.success
      ? { policy: parsed.data }
      : { policy: FALLBACK_POLICY, reasonCode: "workspace_hooks_blocked_by_policy" };
  }

  private knownWorkspaces(): Set<string> {
    const workspaces = new Set(this.state.counters.keys());
    for (const record of this.state.records.values()) workspaces.add(record.workspaceIdentity);
    return workspaces;
  }
}
