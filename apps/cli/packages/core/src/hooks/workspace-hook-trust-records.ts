// SPDX-License-Identifier: Apache-2.0
// 信任记录构造：把"用户同意这批声明"的决策变成持久记录所需的字段快照。
import {
  workspaceHookTrustRecordSchema,
  type WorkspaceHookBundleSnapshot,
  type WorkspaceHookTrustRecord,
} from "@knorvia/contracts";

function displayCommand(entry: WorkspaceHookBundleSnapshot["hooks"][number]): string {
  return entry.type === "process" ? [entry.command, ...(entry.args ?? [])].join(" ") : entry.command;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * 每条声明一条记录。记录保存"授权当时"的槽位与命令展示，供后续判断是否 stale
 * （声明内容变了仍是同一槽位）。未知 item 或缺失 source 属调用方编程错误，直接抛错。
 */
export function createWorkspaceHookTrustRecords(input: {
  snapshot: WorkspaceHookBundleSnapshot;
  reviewItemIds: readonly string[];
  grantedAt: string;
  appVersion?: string;
}): WorkspaceHookTrustRecord[] {
  const byReviewItemId = new Map(input.snapshot.hooks.map((entry) => [entry.reviewItemId, entry]));

  return unique(input.reviewItemIds).map((reviewItemId) => {
    const entry = byReviewItemId.get(reviewItemId);
    if (!entry) throw new Error(`Unknown Workspace Hook review item: ${reviewItemId}`);
    const source = input.snapshot.sourceFiles[entry.sourceFileIndex];
    if (!source) throw new Error(`Workspace Hook source is missing for ${reviewItemId}`);

    return workspaceHookTrustRecordSchema.parse({
      bundleDigestAtGrant: input.snapshot.bundleDigest,
      decision: "trusted",
      digestAlgorithm: "sha256",
      displayCommandAtGrant: displayCommand(entry),
      eventAtGrant: entry.event,
      grantedAt: input.grantedAt,
      hookDeclarationDigest: entry.hookDeclarationDigest,
      hookIndexAtGrant: entry.hookIndex,
      matcherAtGrant: entry.matcher,
      matcherIndexAtGrant: entry.matcherIndex,
      sourceDiscoveryOrderAtGrant: source.discoveryOrder,
      sourcePathAtGrant: entry.sourceRelativePath,
      workspaceIdentity: input.snapshot.workspaceIdentity,
      ...(input.appVersion ? { appVersionAtGrant: input.appVersion } : {}),
    });
  });
}
