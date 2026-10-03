import type { ProviderFamilyDomain } from "./model-provider-family.js";

import type {
  PlanIdentitySnapshot,
  PlanIdentityStatus,
  UsageEntitlementSnapshot,
} from "./usage-stats.js";

type EntitlementState =
  | { kind: "unknown" | "none" }
  | { kind: "active"; generatedAt: number; productId: string };

function classifyEntitlement(
  entitlement: UsageEntitlementSnapshot | null | undefined,
  now: number,
  entitlementCacheTtlMs: number,
): EntitlementState {
  if (!entitlement) {
    return { kind: "unknown" };
  }

  if (now - entitlement.generatedAt > entitlementCacheTtlMs) {
    return { kind: "unknown" };
  }

  if (!entitlement.authenticated || entitlement.unavailableReason === "unavailable") {
    return { kind: "unknown" };
  }

  if (
    entitlement.unavailableReason === "not_authenticated" ||
    entitlement.unavailableReason === "not_configured"
  ) {
    return { kind: "unknown" };
  }

  if (entitlement.unavailableReason === "no_plan") {
    return { kind: "none" };
  }

  if (entitlement.quota || entitlement.subscription || entitlement.remaining) {
    return {
      kind: "active",
      generatedAt: entitlement.generatedAt,
      productId: entitlement.subscription?.details[0]?.productId ?? "",
    };
  }

  return { kind: "unknown" };
}

function identitySnapshot(
  generatedAt: number,
  planStatus: PlanIdentityStatus,
  planProductId: string,
): PlanIdentitySnapshot {
  return { generatedAt, planStatus, planProductId };
}

export function resolvePlanIdentitySnapshot(input: {
  providerFamilyDomain: ProviderFamilyDomain | null | undefined;
  codingPlanEntitlement: UsageEntitlementSnapshot | null | undefined;
  startPlanEntitlement: UsageEntitlementSnapshot | null | undefined;
  now: number;
  entitlementCacheTtlMs: number;
}): PlanIdentitySnapshot {
  if (!input.providerFamilyDomain) {
    return identitySnapshot(input.now, "unknown", "");
  }

  const now = input.now;
  const entitlementCacheTtlMs = input.entitlementCacheTtlMs;
  const coding = classifyEntitlement(input.codingPlanEntitlement, now, entitlementCacheTtlMs);

  if (coding.kind === "active") {
    return identitySnapshot(coding.generatedAt, "coding_plan", coding.productId);
  }

  if (coding.kind === "unknown") {
    return identitySnapshot(now, "unknown", "");
  }

  const start = classifyEntitlement(input.startPlanEntitlement, now, entitlementCacheTtlMs);

  if (start.kind === "active") {
    return identitySnapshot(start.generatedAt, "start_plan", start.productId);
  }

  return identitySnapshot(now, start.kind === "none" ? "no_plan" : "unknown", "");
}
