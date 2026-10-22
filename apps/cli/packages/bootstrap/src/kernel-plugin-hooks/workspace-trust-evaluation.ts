// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 单条 Hook 信任求值（B12 的 4 条规格）。
//
// 依据：`specs/contracts/core-hooks/behavior.md` B12。
//
// ⚠️ 这是**安全判定**：它决定「一个 workspace 里的 Hook 到底允不允许运行」。
// 所以判定顺序**不能错** —— 因为「第一条命中即用」，
// 顺序错会让「本该被拒绝的」落到「待审批」甚至「已信任」。
//
// 判定顺序（B12 表格，7 条）：
//   1. 策略 deny                        → blocked_policy
//   2. store corrupt                    → blocked_untrusted
//   3. allow_trusted_only 且无匹配记录   → blocked_policy
//   4. 有匹配持久记录                    → trusted_persistent
//   5. key 在撤销集合                    → revoked
//   6. 存在「同槽位」旧记录              → stale_digest
//   7. 其他                             → pending_trust
import type { WorkspaceHookPolicy, WorkspaceHookPolicyMode } from "./workspace-policy.js";

/** 信任状态（B12 表格的右列）。 */
export type WorkspaceHookTrustState =
  | "blocked_policy"
  | "blocked_untrusted"
  | "trusted_persistent"
  | "revoked"
  | "stale_digest"
  | "pending_trust";

/** 准入分类（B12.2 的 `admissionClass`）。 */
export type WorkspaceHookAdmissionClass = "admitted" | "blocked";

/**
 * 信任状态 → 准入分类的映射（B12.2 的 `WORKSPACE_HOOK_STATE_ADMISSION_MAP`）。
 *
 * 只有 `trusted_persistent` 是「准入」—— 其余都阻止运行。
 * 为什么 `pending_trust` 也阻止：未审批的 Hook 不应先跑再说。
 */
const ADMISSION_MAP: Readonly<Record<WorkspaceHookTrustState, WorkspaceHookAdmissionClass>> =
  Object.freeze({
    blocked_policy: "blocked",
    blocked_untrusted: "blocked",
    trusted_persistent: "admitted",
    revoked: "blocked",
    stale_digest: "blocked",
    pending_trust: "blocked",
  });

/** 取某信任状态对应的准入分类。 */
export function admissionClassOf(state: WorkspaceHookTrustState): WorkspaceHookAdmissionClass {
  return ADMISSION_MAP[state];
}

/** 一条持久信任记录（B12.1 的「同槽位」判定需要这些字段）。 */
export interface PersistentRecordForEvaluation {
  readonly workspaceIdentity: string;
  readonly hookDeclarationDigest: string;
  /** 授予时的槽位字段（缺失的记录不参与「同槽位」判断）。 */
  readonly eventAtGrant?: string;
  readonly sourcePathAtGrant?: string;
  readonly sourceDiscoveryOrderAtGrant?: number;
  readonly matcherAtGrant?: string;
  readonly matcherIndexAtGrant?: number;
  readonly hookIndexAtGrant?: number;
}

/** 当前条目（用于与持久记录比对）。 */
export interface CurrentEntrySlot {
  readonly workspaceIdentity: string;
  readonly hookDeclarationDigest: string;
  readonly event: string;
  readonly sourcePath?: string;
  /** 当前 source 的 discoveryOrder（B12.1 明确要求与它比对）。 */
  readonly discoveryOrder?: number;
  readonly matcher?: string;
  readonly matcherIndex?: number;
  readonly hookIndex?: number;
}

/** 求值所需的全部输入。 */
export interface TrustEvaluationInput {
  readonly entry: CurrentEntrySlot;
  readonly policy: WorkspaceHookPolicy;
  readonly storeStatus: "ok" | "corrupt" | undefined;
  readonly records: readonly PersistentRecordForEvaluation[];
  readonly revokedKeys: ReadonlySet<string>;
  /** 是否已持久记录（由协调者提供，避免本函数自己拼 key）。 */
  readonly hasMatchingRecord: boolean;
  /** 当前条目是否被撤销（同上）。 */
  readonly isRevoked: boolean;
}

/**
 * 「同槽位」判定（B12.1）。
 *
 * 条件：同 workspace、**digest 不同**，且六个槽位字段与当前条目**全等**。
 * **缺字段的记录不参与判断** —— 因为「不知道它的槽位」就不能断言「同槽位」。
 */
export function isSameSlot(
  record: PersistentRecordForEvaluation,
  entry: CurrentEntrySlot,
): boolean {
  if (record.workspaceIdentity !== entry.workspaceIdentity) return false;
  if (record.hookDeclarationDigest === entry.hookDeclarationDigest) return false;

  // 任一槽位字段缺失 → 不参与判断（B12.1 末句）。
  if (
    record.eventAtGrant === undefined ||
    record.sourcePathAtGrant === undefined ||
    record.sourceDiscoveryOrderAtGrant === undefined ||
    record.matcherIndexAtGrant === undefined ||
    record.hookIndexAtGrant === undefined
  ) {
    return false;
  }

  return (
    record.eventAtGrant === entry.event &&
    record.sourcePathAtGrant === (entry.sourcePath ?? "") &&
    record.sourceDiscoveryOrderAtGrant === entry.discoveryOrder &&
    (record.matcherAtGrant ?? "") === (entry.matcher ?? "") &&
    record.matcherIndexAtGrant === entry.matcherIndex &&
    record.hookIndexAtGrant === entry.hookIndex
  );
}

/**
 * 判定单条 Hook 的信任状态（B12 的 7 条顺序）。
 *
 * ⚠️ **顺序不能调换** —— 每一条都是「前一条不成立时才看」。
 */
export function evaluateTrustState(input: TrustEvaluationInput): WorkspaceHookTrustState {
  const { policy, storeStatus, entry, records, hasMatchingRecord, isRevoked } = input;

  // 1. 策略 deny → 一律阻止。
  if (policy.mode === "deny") return "blocked_policy";

  // 2. store corrupt → 一律按「不可信」阻止（不能信任来源不明的记录）。
  if (storeStatus === "corrupt") return "blocked_untrusted";

  // 3. allow_trusted_only 且无匹配记录 → 阻止。
  if (policy.mode === "allow_trusted_only" && !hasMatchingRecord) return "blocked_policy";

  // 4. 有匹配持久记录（identity 与 digest 都相同）→ 信任。
  if (hasMatchingRecord) return "trusted_persistent";

  // 5. 该 key 在撤销集合 → 已撤销。
  if (isRevoked) return "revoked";

  // 6. 存在「同槽位」的旧记录 → 摘要已过期。
  if (records.some((record) => isSameSlot(record, entry))) return "stale_digest";

  // 7. 其他 → 待审批。
  return "pending_trust";
}

/** 求值输出（B12.2 的字段集合）。 */
export interface WorkspaceHookEffectiveState {
  readonly reviewItemId: string;
  readonly sourceRootEnabled: boolean;
  readonly declarationEnabled: boolean;
  readonly runtimeHooksEnabled: boolean;
  readonly configuredEnabled: boolean;
  readonly editable: boolean;
  readonly trustState: WorkspaceHookTrustState;
  readonly admissionClass: WorkspaceHookAdmissionClass;
  readonly effectiveRunnable: boolean;
  readonly workspaceIdentity: string;
  readonly bundleDigest: string;
  readonly hookDeclarationDigest: string;
  readonly sourcePaths: readonly string[];
  readonly reasonCode?: string;
}

/** 求值的额外上下文（B12.2 的开关字段与路径）。 */
export interface EffectiveStateInput extends TrustEvaluationInput {
  readonly reviewItemId: string;
  readonly sourceRootEnabled: boolean;
  readonly declarationEnabled: boolean;
  readonly runtimeHooksEnabled: boolean;
  readonly configuredEnabled: boolean;
  readonly editable: boolean;
  readonly bundleDigest: string;
  readonly sourcePaths: readonly string[];
  readonly reasonCode?: string;
}

/**
 * 产出完整的「生效状态」（B12.2 / B12.3）。
 *
 * `effectiveRunnable` 的公式（B12.3）：
 *   `admissionClass === "admitted" && configuredEnabled && policy.mode !== "deny"`
 *
 * ⚠️ 这里重复检查 `policy.mode !== "deny"` 而不是只靠 `admissionClass` ——
 * 因为「策略变 deny」时 admission 已经是 blocked，但显式再查一次
 * 能让公式与合同原文逐字对应，审查时更容易核对。
 */
export function evaluateEffectiveState(input: EffectiveStateInput): WorkspaceHookEffectiveState {
  const trustState = evaluateTrustState(input);
  const admissionClass = admissionClassOf(trustState);

  const effectiveRunnable =
    admissionClass === "admitted" && input.configuredEnabled && input.policy.mode !== "deny";

  return {
    reviewItemId: input.reviewItemId,
    sourceRootEnabled: input.sourceRootEnabled,
    declarationEnabled: input.declarationEnabled,
    runtimeHooksEnabled: input.runtimeHooksEnabled,
    configuredEnabled: input.configuredEnabled,
    editable: input.editable,
    trustState,
    admissionClass,
    effectiveRunnable,
    workspaceIdentity: input.entry.workspaceIdentity,
    bundleDigest: input.bundleDigest,
    hookDeclarationDigest: input.entry.hookDeclarationDigest,
    sourcePaths: input.sourcePaths,
    ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
  };
}

/**
 * 策略提供者不可用时的 fail-closed 策略（B11.8）。
 *
 * 当策略提供者抛错或返回非法策略 → **一律 deny**，而不是「回退到默认」——
 * 因为「默认」是 `user_decides`（允许运行），那等于「出错就放行」。
 */
export const FAIL_CLOSED_POLICY: WorkspaceHookPolicy = Object.freeze({
  mode: "deny" as WorkspaceHookPolicyMode,
  policyRevision: "provider-error:fail-closed",
});

/** fail-closed 时的 reasonCode（B11.8）。 */
export const FAIL_CLOSED_REASON_CODE = "workspace_hooks_blocked_by_policy";
