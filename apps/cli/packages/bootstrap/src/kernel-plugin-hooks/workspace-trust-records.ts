// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 信任记录创建（B16 的 4 条规格）。
//
// 依据：`specs/contracts/core-hooks/behavior.md` B16。
//
// 职责：用户批准后，把「这一条声明在**此刻**长什么样」固化成持久记录。
//
// ⚠️ 为什么要固化「此刻的样子」：
//   记录里的 `*AtGrant` 字段是「同槽位」判定（B12.1）的依据。
//   若记录只存 digest，就无法回答「用户批准的是**哪一行**」——
//   而用户批准的是「这一行」，不是「这个摘要」。

/** 快照里的一条源文件（B16.3 的 sourcePath / discoveryOrder 来源）。 */
export interface TrustSourceFile {
  readonly canonicalPath?: string;
  readonly sourceRelativePath?: string;
  readonly discoveryOrder?: number;
}

/** 快照里的一条声明（用于生成记录）。 */
export interface TrustDeclarationEntry {
  readonly reviewItemId: string;
  readonly hookDeclarationDigest: string;
  readonly event: string;
  readonly hook:
    | { readonly type: "command"; readonly command: string }
    | { readonly type: "process"; readonly command: string; readonly args?: readonly string[] };
  readonly sourceFileIndex?: number;
  readonly matcher?: string;
  readonly matcherIndex?: number;
  readonly hookIndex?: number;
}

/** 生成记录所需的快照（只取本模块用到的字段）。 */
export interface TrustRecordSnapshot {
  readonly workspaceIdentity: string;
  readonly bundleDigest: string;
  readonly entries: readonly TrustDeclarationEntry[];
  readonly sourceFiles?: readonly TrustSourceFile[];
  readonly appVersion?: string;
}

/** 一条持久信任记录（B16.3 的字段集合）。 */
export interface WorkspaceHookTrustRecord {
  readonly workspaceIdentity: string;
  readonly hookDeclarationDigest: string;
  readonly digestAlgorithm: "sha256";
  readonly decision: "trusted";
  readonly grantedAt: string;
  readonly bundleDigestAtGrant: string;
  readonly eventAtGrant: string;
  readonly displayCommandAtGrant: string;
  readonly sourcePathAtGrant: string;
  readonly sourceDiscoveryOrderAtGrant: number;
  readonly matcherAtGrant?: string;
  readonly matcherIndexAtGrant: number;
  readonly hookIndexAtGrant: number;
  readonly appVersionAtGrant?: string;
}

/**
 * 计算「授予时的展示命令」（B16.3）。
 *
 * `process` 类型 = `command + " " + args.join(" ")`；
 * `command` 类型 = `command`。
 *
 * ⚠️ 这是**原样保存**（不脱敏）—— 因为它存在本地信任库，用于「同槽位」比对；
 * 而展示时由 B3/B4 脱敏。
 */
export function displayCommandAtGrant(hook: TrustDeclarationEntry["hook"]): string {
  if (hook.type === "process") {
    const args = hook.args ?? [];
    return args.length === 0 ? hook.command : `${hook.command} ${args.join(" ")}`;
  }
  return hook.command;
}

/**
 * 创建信任记录（B16）。
 *
 * @param snapshot 当前快照
 * @param reviewItemIds 用户批准的条目（会**先去重并保持首次出现顺序**，B16.1）
 * @param grantedAt 授予时间（ISO 字符串；由调用方提供，便于测试）
 */
export function createTrustRecords(
  snapshot: TrustRecordSnapshot,
  reviewItemIds: readonly string[],
  grantedAt: string,
): readonly WorkspaceHookTrustRecord[] {
  // B16.1：先去重并保持首次出现顺序。
  const uniqueIds = [...new Set(reviewItemIds)];

  const byId = new Map(snapshot.entries.map((entry) => [entry.reviewItemId, entry]));

  return uniqueIds.map((reviewItemId) => {
    const entry = byId.get(reviewItemId);
    // B16.2：未知 item → 抛错。
    if (entry === undefined) {
      throw new Error(`Unknown Workspace Hook review item: ${reviewItemId}`);
    }

    // B16.2：条目存在但缺 source file → 抛错。
    const sourceFile =
      entry.sourceFileIndex === undefined
        ? undefined
        : snapshot.sourceFiles?.[entry.sourceFileIndex];
    if (sourceFile === undefined) {
      throw new Error(`Workspace Hook source is missing for ${reviewItemId}`);
    }
    const sourcePath = sourceFile.canonicalPath ?? sourceFile.sourceRelativePath;
    if (sourcePath === undefined) {
      throw new Error(`Workspace Hook source is missing for ${reviewItemId}`);
    }

    return {
      workspaceIdentity: snapshot.workspaceIdentity,
      hookDeclarationDigest: entry.hookDeclarationDigest,
      digestAlgorithm: "sha256" as const,
      decision: "trusted" as const,
      grantedAt,
      bundleDigestAtGrant: snapshot.bundleDigest,
      eventAtGrant: entry.event,
      displayCommandAtGrant: displayCommandAtGrant(entry.hook),
      sourcePathAtGrant: sourcePath,
      sourceDiscoveryOrderAtGrant: sourceFile.discoveryOrder ?? 0,
      ...(entry.matcher === undefined ? {} : { matcherAtGrant: entry.matcher }),
      matcherIndexAtGrant: entry.matcherIndex ?? 0,
      hookIndexAtGrant: entry.hookIndex ?? 0,
      ...(snapshot.appVersion === undefined ? {} : { appVersionAtGrant: snapshot.appVersion }),
    };
  });
}
