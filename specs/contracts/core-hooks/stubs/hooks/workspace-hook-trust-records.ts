// SPDX-License-Identifier: Apache-2.0
// core-hooks 合同 v1 的最小桩（对应 workspace-hook-trust-records.ts）。仅签名，无实现。
import type { WorkspaceHookBundleSnapshot, WorkspaceHookTrustRecord } from "@knorvia/contracts";
export function createWorkspaceHookTrustRecords(input: {
  snapshot: WorkspaceHookBundleSnapshot;
  reviewItemIds: readonly string[];
  grantedAt: string;
  appVersion?: string;
}): WorkspaceHookTrustRecord[] {
  void input;
  throw new Error("not implemented: core-hooks");
}
