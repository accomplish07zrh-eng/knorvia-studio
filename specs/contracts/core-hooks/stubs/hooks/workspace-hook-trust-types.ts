// SPDX-License-Identifier: Apache-2.0
// core-hooks 合同 v1 的最小桩（对应 workspace-hook-trust-types.ts）。仅签名，无实现。
import type {
  WorkspaceHookEffectiveState,
  WorkspaceHookPolicy,
  WorkspaceHookReasonCode,
  WorkspaceHookSecurityRevision,
} from "@knorvia/contracts";
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
