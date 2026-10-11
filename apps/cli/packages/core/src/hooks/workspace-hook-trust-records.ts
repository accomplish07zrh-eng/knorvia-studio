// SPDX-License-Identifier: Apache-2.0
// 记录构造：把"用户同意这些声明"折算成持久记录。每条记录保存授权当时的槽位与展示命令，
// 供之后判断内容是否被改过；未知 item 或缺失 source 是调用方错误，直接抛。
import {
  workspaceHookTrustRecordSchema,
  type WorkspaceHookBundleSnapshot,
  type WorkspaceHookTrustRecord,
} from "@knorvia/contracts";

type SnapshotEntry = WorkspaceHookBundleSnapshot["hooks"][number];

/** 展示命令：进程类拼参数，命令类就是命令本身。 */
function displayCommand(entry: SnapshotEntry): string {
  const args = entry.type === "process" ? (entry.args ?? []) : [];
  return [entry.command, ...args].join(" ");
}

function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    kept.push(value);
  }
  return kept;
}

export function createWorkspaceHookTrustRecords(input: {
  snapshot: WorkspaceHookBundleSnapshot;
  reviewItemIds: readonly string[];
  grantedAt: string;
  appVersion?: string;
}): WorkspaceHookTrustRecord[] {
  const declared = new Map<string, SnapshotEntry>(
    input.snapshot.hooks.map((entry) => [entry.reviewItemId, entry]),
  );

  return dedupe(input.reviewItemIds).map((reviewItemId) => {
    const entry = declared.get(reviewItemId);
    if (entry === undefined) throw new Error(`Unknown Workspace Hook review item: ${reviewItemId}`);
    const source = input.snapshot.sourceFiles[entry.sourceFileIndex];
    if (source === undefined)
      throw new Error(`Workspace Hook source is missing for ${reviewItemId}`);

    const pairs: (readonly [string, unknown])[] = [
      ["bundleDigestAtGrant", input.snapshot.bundleDigest],
      ["decision", "trusted"],
      ["digestAlgorithm", "sha256"],
      ["displayCommandAtGrant", displayCommand(entry)],
      ["eventAtGrant", entry.event],
      ["grantedAt", input.grantedAt],
      ["hookDeclarationDigest", entry.hookDeclarationDigest],
      ["hookIndexAtGrant", entry.hookIndex],
      ["matcherAtGrant", entry.matcher],
      ["matcherIndexAtGrant", entry.matcherIndex],
      ["sourceDiscoveryOrderAtGrant", source.discoveryOrder],
      ["sourcePathAtGrant", entry.sourceRelativePath],
      ["workspaceIdentity", input.snapshot.workspaceIdentity],
    ];
    if (input.appVersion) pairs.push(["appVersionAtGrant", input.appVersion]);
    return workspaceHookTrustRecordSchema.parse(Object.fromEntries(pairs));
  });
}
