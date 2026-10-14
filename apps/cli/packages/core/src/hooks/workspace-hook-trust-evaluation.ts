// SPDX-License-Identifier: Apache-2.0
// 单条声明的信任折算：输入是"策略 + 记录视图 + 撤销视图 + store 状态"，输出是合同里的
// 有效状态。判定写成有序规则表，命中即返回，避免可读性差的嵌套分支。
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
import type {
  WorkspaceHookEntryEvaluationInput,
  WorkspaceHookTrustStoreStatus,
} from "./workspace-hook-trust-types.js";

/** 复合键用 NUL 连接，避免 workspace 文本与摘要拼接歧义。 */
export function trustKey(workspaceIdentity: string, hookDeclarationDigest: string): string {
  return [workspaceIdentity, hookDeclarationDigest].join(KEY_SEPARATOR);
}

const KEY_SEPARATOR = "\u0000";

interface EntryContext {
  entry: CanonicalWorkspaceHookEntry;
  snapshot: WorkspaceHookBundleSnapshot;
  policy: WorkspaceHookPolicy;
  persistent?: WorkspaceHookTrustRecord;
  revoked: boolean;
  storeStatus: WorkspaceHookTrustStoreStatus;
  records: Iterable<WorkspaceHookTrustRecord>;
}

/** 槽位签名：同一位置/事件/matcher 视为同一把"椅子"，摘要不同即为内容已改。 */
function slotSignature(source: string, entry: CanonicalWorkspaceHookEntry): string {
  return [source, entry.event, entry.matcherIndex, entry.hookIndex, entry.matcher ?? ""].join(
    "\u0001",
  );
}

function recordSignature(record: WorkspaceHookTrustRecord): string | undefined {
  const slot = [
    record.sourceDiscoveryOrderAtGrant,
    record.matcherIndexAtGrant,
    record.hookIndexAtGrant,
  ];
  if (slot.some((value) => value === undefined)) return undefined;
  return [
    record.sourceDiscoveryOrderAtGrant,
    record.eventAtGrant,
    record.matcherIndexAtGrant,
    record.hookIndexAtGrant,
    record.matcherAtGrant ?? "",
  ].join("\u0001");
}

/** 是否存在"同一槽位、不同摘要"的历史记录（内容被改过）。 */
function sharesSlotWithOtherVersion(context: EntryContext): boolean {
  const source = context.snapshot.sourceFiles[context.entry.sourceFileIndex];
  if (!source || context.persistent || context.revoked) return false;

  const mine = slotSignature(String(source.discoveryOrder), context.entry);
  for (const record of context.records) {
    if (record.workspaceIdentity !== context.snapshot.workspaceIdentity) continue;
    if (record.hookDeclarationDigest === context.entry.hookDeclarationDigest) continue;
    const theirs = recordSignature(record);
    if (theirs !== undefined && theirs === mine) return true;
  }
  return false;
}

type Rule = { state: WorkspaceHookTrustState; when: (context: EntryContext) => boolean };

/**
 * 规则顺序即优先级：策略拒绝 > store 损坏 > 白名单缺记录 > 已授权 > 已撤销 > 内容已改 > 待授权。
 * 表里只描述"命中条件"，具体字段映射交给契约的准入表。
 */
const RULES: readonly Rule[] = [
  { state: "blocked_policy", when: (context) => context.policy.mode === "deny" },
  { state: "blocked_untrusted", when: (context) => context.storeStatus === "corrupt" },
  {
    state: "blocked_policy",
    when: (context) => context.policy.mode === "allow_trusted_only" && !context.persistent,
  },
  { state: "trusted_persistent", when: (context) => context.persistent !== undefined },
  { state: "revoked", when: (context) => context.revoked },
  { state: "stale_digest", when: (context) => sharesSlotWithOtherVersion(context) },
  { state: "pending_trust", when: () => true },
];

function classify(context: EntryContext): WorkspaceHookTrustState {
  const hit = RULES.find((rule) => rule.when(context));
  return hit ? hit.state : "pending_trust";
}

/**
 * 求值一条声明。返回对象必须通过契约 schema：准入分类、reasonCode 与可运行性
 * 都要与契约判定表一致，任何不一致会在这里暴露成错误而不是静默放行。
 */
export function evaluateWorkspaceHookEntry(
  input: WorkspaceHookEntryEvaluationInput,
): WorkspaceHookEffectiveState {
  const { entry, snapshot, policy } = input;
  const key = trustKey(snapshot.workspaceIdentity, entry.hookDeclarationDigest);
  const persistent = input.persistentRecords.get(key);
  const revoked = input.revokedKeys.has(key);

  const trustState = classify({
    entry,
    persistent,
    policy,
    records: input.persistentRecords.values(),
    revoked,
    snapshot,
    storeStatus: input.storeStatus,
  });
  const admission = WORKSPACE_HOOK_STATE_ADMISSION_MAP[trustState];
  const runnable =
    admission.admissionClass === "admitted" && entry.configuredEnabled && policy.mode !== "deny";
  const origin =
    snapshot.sourceFiles[entry.sourceFileIndex]?.canonicalPath ?? entry.sourceRelativePath;
  const pairs: readonly (readonly [string, unknown])[] = [
    ["admissionClass", admission.admissionClass],
    ["bundleDigest", snapshot.bundleDigest],
    ["configuredEnabled", entry.configuredEnabled],
    ["declarationEnabled", entry.declarationEnabled],
    ["editable", entry.editable],
    ["effectiveRunnable", runnable],
    ["hookDeclarationDigest", entry.hookDeclarationDigest],
    ["reasonCode", admission.reasonCode],
    ["reviewItemId", entry.reviewItemId],
    ["runtimeHooksEnabled", entry.runtimeHooksEnabled],
    ["sourcePaths", [origin]],
    ["sourceRootEnabled", entry.sourceRootEnabled],
    ["trustState", trustState],
    ["workspaceIdentity", snapshot.workspaceIdentity],
  ];

  return workspaceHookEffectiveStateSchema.parse(Object.fromEntries(pairs));
}
