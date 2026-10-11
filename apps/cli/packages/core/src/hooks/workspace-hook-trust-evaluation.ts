// SPDX-License-Identifier: Apache-2.0
// 单条声明的信任求值（纯函数）：把策略、持久记录、撤销集合与 store 状态折算成一个 trustState，
// 再映射成契约里的准入分类与 reasonCode。
import {
  WORKSPACE_HOOK_STATE_ADMISSION_MAP,
  workspaceHookEffectiveStateSchema,
  type CanonicalWorkspaceHookEntry,
  type WorkspaceHookBundleSnapshot,
  type WorkspaceHookEffectiveState,
  type WorkspaceHookPolicy,
  type WorkspaceHookTrustRecord,
  type WorkspaceHookTrustState,
} from "@knorvia/contracts";
import type { WorkspaceHookTrustStoreStatus } from "./workspace-hook-trust-types.js";

/** 复合键：workspace 与声明摘要之间用 NUL 分隔，避免分隔歧义。 */
export function trustKey(workspaceIdentity: string, hookDeclarationDigest: string): string {
  return `${workspaceIdentity}\u0000${hookDeclarationDigest}`;
}

/**
 * 判断是否存在"同一槽位、不同摘要"的历史记录：声明内容变了但位置/事件/matcher 一致，
 * 说明是修改后的同一条 Hook（stale），而不是一条全新的 Hook（pending）。
 * 缺少槽位字段的旧记录不参与判断，避免把不完整数据误判成 stale。
 */
function hasStaleSlotRecord(
  snapshot: WorkspaceHookBundleSnapshot,
  entry: CanonicalWorkspaceHookEntry,
  records: Iterable<WorkspaceHookTrustRecord>,
): boolean {
  const source = snapshot.sourceFiles[entry.sourceFileIndex];
  if (!source) return false;

  for (const record of records) {
    if (record.workspaceIdentity !== snapshot.workspaceIdentity) continue;
    if (record.hookDeclarationDigest === entry.hookDeclarationDigest) continue;
    if (
      record.sourceDiscoveryOrderAtGrant === undefined ||
      record.matcherIndexAtGrant === undefined ||
      record.hookIndexAtGrant === undefined
    )
      continue;

    const sameSlot =
      record.eventAtGrant === entry.event &&
      record.sourcePathAtGrant === entry.sourceRelativePath &&
      record.sourceDiscoveryOrderAtGrant === source.discoveryOrder &&
      record.matcherAtGrant === entry.matcher &&
      record.matcherIndexAtGrant === entry.matcherIndex &&
      record.hookIndexAtGrant === entry.hookIndex;
    if (sameSlot) return true;
  }
  return false;
}

function resolveTrustState(input: {
  entry: CanonicalWorkspaceHookEntry;
  snapshot: WorkspaceHookBundleSnapshot;
  policy: WorkspaceHookPolicy;
  persistent: WorkspaceHookTrustRecord | undefined;
  revoked: boolean;
  storeStatus: WorkspaceHookTrustStoreStatus;
  hasStaleSlot: boolean;
}): WorkspaceHookTrustState {
  if (input.policy.mode === "deny") return "blocked_policy";
  if (input.storeStatus === "corrupt") return "blocked_untrusted";
  if (input.policy.mode === "allow_trusted_only")
    return input.persistent ? "trusted_persistent" : "blocked_policy";
  if (input.persistent) return "trusted_persistent";
  if (input.revoked) return "revoked";
  if (input.hasStaleSlot) return "stale_digest";
  return "pending_trust";
}

/**
 * 求值一条声明。返回值经过契约 schema 校验：admissionClass / reasonCode / effectiveRunnable
 * 必须与 private 判定表一致，任何不一致都会在这里暴露为错误而不是静默放行。
 */
export function evaluateWorkspaceHookEntry(input: {
  entry: CanonicalWorkspaceHookEntry;
  snapshot: WorkspaceHookBundleSnapshot;
  policy: WorkspaceHookPolicy;
  persistentRecords: ReadonlyMap<string, WorkspaceHookTrustRecord>;
  revokedKeys: ReadonlySet<string>;
  storeStatus: WorkspaceHookTrustStoreStatus;
}): WorkspaceHookEffectiveState {
  const { entry, snapshot, policy } = input;
  const key = trustKey(snapshot.workspaceIdentity, entry.hookDeclarationDigest);
  const persistent = input.persistentRecords.get(key);

  const trustState = resolveTrustState({
    entry,
    hasStaleSlot:
      !persistent &&
      !input.revokedKeys.has(key) &&
      hasStaleSlotRecord(snapshot, entry, input.persistentRecords.values()),
    persistent,
    policy,
    revoked: input.revokedKeys.has(key),
    snapshot,
    storeStatus: input.storeStatus,
  });

  const mapped = WORKSPACE_HOOK_STATE_ADMISSION_MAP[trustState];
  return workspaceHookEffectiveStateSchema.parse({
    admissionClass: mapped.admissionClass,
    bundleDigest: snapshot.bundleDigest,
    configuredEnabled: entry.configuredEnabled,
    declarationEnabled: entry.declarationEnabled,
    editable: entry.editable,
    effectiveRunnable:
      mapped.admissionClass === "admitted" && entry.configuredEnabled && policy.mode !== "deny",
    hookDeclarationDigest: entry.hookDeclarationDigest,
    reasonCode: mapped.reasonCode,
    reviewItemId: entry.reviewItemId,
    runtimeHooksEnabled: entry.runtimeHooksEnabled,
    sourcePaths: [
      snapshot.sourceFiles[entry.sourceFileIndex]?.canonicalPath ?? entry.sourceRelativePath,
    ],
    sourceRootEnabled: entry.sourceRootEnabled,
    trustState,
    workspaceIdentity: snapshot.workspaceIdentity,
  });
}
