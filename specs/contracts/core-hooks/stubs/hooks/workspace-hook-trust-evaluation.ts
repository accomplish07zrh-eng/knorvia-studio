// SPDX-License-Identifier: Apache-2.0
// core-hooks 合同 v1 的最小桩（对应 workspace-hook-trust-evaluation.ts）。仅签名，无实现。
import type {
  CanonicalWorkspaceHookEntry,
  WorkspaceHookBundleSnapshot,
  WorkspaceHookEffectiveState,
  WorkspaceHookPolicy,
  WorkspaceHookTrustRecord,
} from "@knorvia/contracts";
import type { WorkspaceHookTrustStoreStatus } from "./workspace-hook-trust-types.js";
export function evaluateWorkspaceHookEntry(input: {
  entry: CanonicalWorkspaceHookEntry;
  snapshot: WorkspaceHookBundleSnapshot;
  policy: WorkspaceHookPolicy;
  persistentRecords: ReadonlyMap<string, WorkspaceHookTrustRecord>;
  revokedKeys: ReadonlySet<string>;
  storeStatus: WorkspaceHookTrustStoreStatus;
}): WorkspaceHookEffectiveState {
  void input;
  throw new Error("not implemented: core-hooks");
}
export function trustKey(workspaceIdentity: string, hookDeclarationDigest: string): string {
  void workspaceIdentity;
  void hookDeclarationDigest;
  throw new Error("not implemented: core-hooks");
}
