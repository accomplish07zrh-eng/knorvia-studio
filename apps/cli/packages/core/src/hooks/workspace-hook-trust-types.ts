// SPDX-License-Identifier: Apache-2.0
// 信任域的对外形状：store 状态、快照求值结果。判定表与状态形状来自 @knorvia/contracts，不在此复制。
import type { WorkspaceHookPolicyProvider } from "./workspace-hook-policy.js";
import type {
  CanonicalWorkspaceHookEntry,
  WorkspaceHookBundleSnapshot,
  WorkspaceHookEffectiveState,
  WorkspaceHookPolicy,
  WorkspaceHookReasonCode,
  WorkspaceHookSecurityRevision,
  WorkspaceHookTrustRecord,
} from "@knorvia/contracts";

/** Trust store 的三态；损坏时上层必须按"不授权"处理。 */
export type WorkspaceHookTrustStoreStatus = "missing" | "ok" | "corrupt";

export interface WorkspaceHookTrustStoreState {
  status: WorkspaceHookTrustStoreStatus;
  recoveredCorruptPath?: string;
}

export interface WorkspaceHookSnapshotEvaluation {
  workspaceIdentity: string;
  bundleDigest: string;
  policy: WorkspaceHookPolicy;
  securityRevision: WorkspaceHookSecurityRevision;
  storeStatus: WorkspaceHookTrustStoreStatus;
  reasonCode?: WorkspaceHookReasonCode;
  items: WorkspaceHookEffectiveState[];
}

export interface WorkspaceHookTrustCoordinatorOptions {
  coordinatorEpoch: string;
  policyProvider?: WorkspaceHookPolicyProvider;
}

/** 单条声明求值的输入形状（兼容声明）：字段名即跨模块约定。 */
export interface WorkspaceHookEntryEvaluationInput {
  entry: CanonicalWorkspaceHookEntry;
  snapshot: WorkspaceHookBundleSnapshot;
  policy: WorkspaceHookPolicy;
  persistentRecords: ReadonlyMap<string, WorkspaceHookTrustRecord>;
  revokedKeys: ReadonlySet<string>;
  storeStatus: WorkspaceHookTrustStoreStatus;
}
