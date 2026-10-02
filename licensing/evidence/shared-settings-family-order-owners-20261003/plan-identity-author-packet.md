You are a fresh internal author. Read ONLY this designated packet and exact /workspace/knorvia-studio/AGENTS.md plus /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. Do not read source bodies, tests, dependencies, history, config, environment, other outputs or repository files beyond these two instructions. User explicitly narrows validation: do not run architecture/runtime/tests/typechecks/formatting or repository writes; curator handles them. No network/native/account/security operations. Author an ENTIRE compatible TypeScript file into the designated tmp output using a whole literal heredoc or apply_patch. Do not inspect/re-read authored output (sha256sum permitted). Report exact reads/writes/patches/hash and limits. No novelty requirement; preserve contracts exactly. Retained public declarations/imports/static tables below are uncounted, not independently rewritten. Curator is source-exposed; you have no inherited conversation; shared filesystem is not OS isolation. Whole file will be frozen/hash-bound before curator review.

Target: packages/shared/src/plan-identity.ts. Output: /tmp/knorvia-settings-plan-identity-authored.ts

Complete caller-clock cached entitlement-to-plan identity owner. Public function parameter types/imports retained as shown; no auth/account calls. Input {providerFamilyDomain, codingPlanEntitlement,startPlanEntitlement,now,entitlementCacheTtlMs}. Each return fresh object EXACT {generatedAt,planStatus,planProductId} keys. Default unknown = now,unknown,emptystring. If !providerFamilyDomain immediately unknown; no normalization/validation of truthy family input. Classify coding first; active =>coding_plan with its generatedAt/product; coding unknown=>defaultunknown WITHOUT reading/classifying start; coding none=>only then start; startactive=>start_plan with its generatedAt/product, startnone=>no_plan with now/empty; startunknown=>defaultunknown. Snapshot classification ordered: absent truthy =>unknown; if now-generatedAt > TTL =>unknown (equality valid; future valid; no finiteness/range clamp); if !authenticated OR unavailableReason===unavailable =>unknown; reason not_authenticated OR not_configured =>unknown; reason no_plan=>none even quota/subscription/remaining present; else any truthy quota OR subscription OR remaining=>active. Active product = subscription?.details[0]?.productId??emptystring; no search of later entries, falsy-but-not-nullish product retained, malformed required details errors propagate, no extra validation. No merely existing null fields active, no other state accepted. Snapshotport type generatedAt:number,authenticated:boolean,unavailableReason?:not_authenticated|not_configured|no_plan|unavailable,provider:object|null,remaining:object|null,subscription:{details:[{productId:string,...}],...}|null,quota:object|null withother optionalmeta. PlanIdentityStatus union coding_plan|start_plan|no_plan|unknown; PlanIdentitySnapshot {generatedAt:number,planStatus,planProductId:string}. Preserve short-circuit reads/priority/error identity, no user data/account/security action. Fixed predicates/status vocabulary/priority patterns may recur; no novelty or licence claim.

Retained API/declarations/static data (no inherited behavior bodies):
```ts
import type { ProviderFamilyDomain } from "./model-provider-family.js";

import type { PlanIdentitySnapshot, PlanIdentityStatus, UsageEntitlementSnapshot, } from "./usage-stats.js";

export function resolvePlanIdentitySnapshot(input: {
    providerFamilyDomain: ProviderFamilyDomain | null | undefined;
    codingPlanEntitlement: UsageEntitlementSnapshot | null | undefined;
    startPlanEntitlement: UsageEntitlementSnapshot | null | undefined;
    now: number;
    entitlementCacheTtlMs: number;
}): PlanIdentitySnapshot;
```
