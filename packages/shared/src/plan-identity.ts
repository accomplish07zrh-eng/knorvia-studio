// SPDX-License-Identifier: Apache-2.0
import type { ProviderFamilyDomain } from "./model-provider-family.js";

import type {
  PlanIdentitySnapshot,
  PlanIdentityStatus,
  UsageEntitlementSnapshot,
} from "./usage-stats.js";

type Entitlement = UsageEntitlementSnapshot | null | undefined;

/** 权益快照的三种裁决：仍有效（带产品）、明确无套餐、无法判断。 */
type EntitlementVerdict =
  | { verdict: "unknown" }
  | { verdict: "none" }
  | { verdict: "active"; generatedAt: number; productId: string };

/** TTL 判定所需的两个时间参数；集中传递避免每个辅助函数都多两个位置参数。 */
type FreshnessClock = { now: number; entitlementCacheTtlMs: number };

type SnapshotInput = FreshnessClock & {
  providerFamilyDomain?: ProviderFamilyDomain | null;
  codingPlanEntitlement: Entitlement;
  startPlanEntitlement: Entitlement;
};

const UNKNOWN: EntitlementVerdict = { verdict: "unknown" };
const NONE: EntitlementVerdict = { verdict: "none" };

/** 可能表示「权益仍可用」的三个数据面；任一存在即可推断出套餐。 */
const ACTIVE_SIGNALS = ["quota", "subscription", "remaining"] as const;

/** 明确表示无法判断的原因：未登录、未配置、数据面不可用。 */
const INDETERMINATE_REASONS = new Set(["unavailable", "not_authenticated", "not_configured"]);

/**
 * 统一裁决权益快照。TTL 以本地生成时间为准；过期、未认证或数据面不可用都只能算
 * unknown——此时不能下结论说不存在套餐，否则会把临时故障显示成降级。
 */
function judgeEntitlement(entitlement: Entitlement, clock: FreshnessClock): EntitlementVerdict {
  if (!entitlement) return UNKNOWN;
  if (clock.now - entitlement.generatedAt > clock.entitlementCacheTtlMs) return UNKNOWN;
  if (!entitlement.authenticated) return UNKNOWN;

  const reason = entitlement.unavailableReason;
  if (reason !== undefined && INDETERMINATE_REASONS.has(reason)) return UNKNOWN;
  if (reason === "no_plan") return NONE;

  const hasSignal = ACTIVE_SIGNALS.some((key) => Boolean(entitlement[key]));
  if (!hasSignal) return UNKNOWN;

  const details = entitlement.subscription?.details ?? [];
  const productId = details[0]?.productId ?? "";
  return { verdict: "active", generatedAt: entitlement.generatedAt, productId };
}

function snapshotOf(input: {
  generatedAt: number;
  planStatus: PlanIdentityStatus;
  planProductId: string;
}): PlanIdentitySnapshot {
  return {
    generatedAt: input.generatedAt,
    planStatus: input.planStatus,
    planProductId: input.planProductId,
  };
}

function unknownSnapshot(now: number): PlanIdentitySnapshot {
  return snapshotOf({ generatedAt: now, planStatus: "unknown", planProductId: "" });
}

/**
 * 决定「当前身份应展示哪种套餐」。coding plan 可用时优先；coding plan 无法判断时
 * 直接短路为 unknown，避免用 start plan 掩盖编码套餐的临时故障；只有 coding plan
 * 明确无套餐时才继续看 start plan。
 */
export function resolvePlanIdentitySnapshot(input: SnapshotInput): PlanIdentitySnapshot {
  if (!input.providerFamilyDomain) return unknownSnapshot(input.now);

  const clock: FreshnessClock = {
    now: input.now,
    entitlementCacheTtlMs: input.entitlementCacheTtlMs,
  };
  const coding = judgeEntitlement(input.codingPlanEntitlement, clock);

  if (coding.verdict === "active") {
    return snapshotOf({
      generatedAt: coding.generatedAt,
      planStatus: "coding_plan",
      planProductId: coding.productId,
    });
  }
  if (coding.verdict === "unknown") return unknownSnapshot(clock.now);

  const start = judgeEntitlement(input.startPlanEntitlement, clock);
  if (start.verdict === "active") {
    return snapshotOf({
      generatedAt: start.generatedAt,
      planStatus: "start_plan",
      planProductId: start.productId,
    });
  }

  const planStatus: PlanIdentityStatus = start.verdict === "none" ? "no_plan" : "unknown";
  return snapshotOf({ generatedAt: clock.now, planStatus, planProductId: "" });
}
