You are a fresh internal author. Read ONLY this designated packet and exact /workspace/knorvia-studio/AGENTS.md plus /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. Do not read source bodies, tests, dependencies, history, config, environment, other outputs or repository files beyond these two instructions. User explicitly narrows validation: do not run architecture/runtime/tests/typechecks/formatting or repository writes; curator handles them. No network/native/account/security operations. Author an ENTIRE compatible TypeScript file into the designated tmp output using a whole literal heredoc or apply_patch. Do not inspect/re-read authored output (sha256sum permitted). Report exact reads/writes/patches/hash and limits. No novelty requirement; preserve contracts exactly. Retained public declarations/imports/static tables below are uncounted, not independently rewritten. Curator is source-exposed; you have no inherited conversation; shared filesystem is not OS isolation. Whole file will be frozen/hash-bound before curator review.

Target: packages/shared/src/model-provider-family.ts. Output: /tmp/knorvia-settings-model-provider-family-authored.ts

Complete provider-family resolution/filter owner with supplied public types and EXACT exported catalogue retained uncounted. Catalogue contains zai and bigmodel with supplied constants/URLs; BigModel URL built by existing port from {KNORVIA_ENV} at module init, no env access by this file except retained imported value. oauth constants string literal zai/bigmodel; six builtin IDs account:{zai|bigmodel}-{start-plan|individual-coding-plan|team-coding-plan}. getModelProviderFamilySpec returns same shared exported catalogue spec reference from module-init familyId lookup; invalid runtime id yields undefined despite annotated nonnullable, no throw/new fallback. ProviderId lookup built at module init for each catalogue spec start/individual/team, exact case-sensitive key; unknown returns null. resolve...ByBaseURL trim via optional chaining, blank/null undefined=>null; parse new URL inside catch (invalid=>null), hostname lowercased, visit catalogue current order, match hostname exact rootDomain or endsWith dot+rootDomain; no contains/substr/domain-spoof acceptance, no added protocol validation (URL-supported schemes retain semantics), no trailing-dot normalization. Normalization accepts exactly zai/bigmodel (no trim/case). OAuth maps exact constants to family else null. shouldShow...ForDomain normalizes input domain; unknown/null =>true; valid domain compares familyId exactly. ActiveOAuth helpers delegate via exact oauth mapping (unknown=>show). Builtin show helpers classify provider; unknown provider always true even constrained domain; known compares family/domain. SpecByProvider null unknown else existing shared spec; label returns spec.label??null. Preserve function APIs/no auth/security operations/no change provider settings. Recurrent literal domain boundary and filter expressions accepted; no provenance claim.

Retained API/declarations/static data (no inherited behavior bodies):
```ts
import { BIGMODEL_PROVIDER_ID, type OAuthProviderId, ZAI_PROVIDER_ID } from "./oauth.js";

import { BUILTIN_MODEL_PROVIDER_IDS, type BuiltinModelProviderId } from "./model-provider-types.js";

import { KNORVIA_ENV } from "./env.js";

import { buildBigModelCodingPlanTeamManageUrl } from "./endpoint.js";

export type ModelProviderFamilyId = "zai" | "bigmodel";

export type ProviderFamilyDomain = ModelProviderFamilyId;

export interface ModelProviderFamilySpec {
    id: ModelProviderFamilyId;
    label: string;
    rootDomain: string;
    oauthProviderId: typeof ZAI_PROVIDER_ID | typeof BIGMODEL_PROVIDER_ID;
    startPlanProviderId: typeof BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan | typeof BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan;
    individualCodingPlanProviderId: typeof BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan | typeof BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan;
    teamCodingPlanProviderId: typeof BUILTIN_MODEL_PROVIDER_IDS.zaiTeamCodingPlan | typeof BUILTIN_MODEL_PROVIDER_IDS.bigmodelTeamCodingPlan;
    teamCodingPlanManageUrl: string;
}

export const MODEL_PROVIDER_FAMILY_SPECS = [
    {
        id: "zai",
        label: "Z.ai",
        rootDomain: "z.ai",
        oauthProviderId: ZAI_PROVIDER_ID,
        startPlanProviderId: BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan,
        individualCodingPlanProviderId: BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan,
        teamCodingPlanProviderId: BUILTIN_MODEL_PROVIDER_IDS.zaiTeamCodingPlan,
        teamCodingPlanManageUrl: "https://z.ai/manage-apikey/subscription",
    },
    {
        id: "bigmodel",
        label: "BigModel",
        rootDomain: "bigmodel.cn",
        oauthProviderId: BIGMODEL_PROVIDER_ID,
        startPlanProviderId: BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan,
        individualCodingPlanProviderId: BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan,
        teamCodingPlanProviderId: BUILTIN_MODEL_PROVIDER_IDS.bigmodelTeamCodingPlan,
        teamCodingPlanManageUrl: buildBigModelCodingPlanTeamManageUrl({ KNORVIA_ENV }),
    },
] as const satisfies readonly ModelProviderFamilySpec[];

export function getModelProviderFamilySpec(familyId: ModelProviderFamilyId): ModelProviderFamilySpec;

export function resolveModelProviderFamilyIdByProviderId(providerId: string): ModelProviderFamilyId | null;

export function resolveModelProviderFamilyIdByBaseURL(baseURL: string | null | undefined): ModelProviderFamilyId | null;

export function resolveModelProviderFamilySpecByProviderId(providerId: string): ModelProviderFamilySpec | null;

export function resolveModelProviderFamilyLabelByProviderId(providerId: string): string | null;

export function normalizeProviderFamilyDomain(value: string | null | undefined): ProviderFamilyDomain | null;

export function resolveProviderFamilyDomainFromOAuthProvider(provider: OAuthProviderId | string | null | undefined): ProviderFamilyDomain | null;

export function shouldShowModelProviderFamilyForDomain(params: {
    familyId: ModelProviderFamilyId;
    providerFamilyDomain: ProviderFamilyDomain | null | undefined;
}): boolean;

export function shouldShowModelProviderFamilyForActiveOAuth(params: {
    familyId: ModelProviderFamilyId;
    activeOAuthProvider: OAuthProviderId | null | undefined;
}): boolean;

export function shouldShowBuiltinModelProviderForDomain(params: {
    providerId: string;
    providerFamilyDomain: ProviderFamilyDomain | null | undefined;
}): boolean;

export function shouldShowBuiltinModelProviderForActiveOAuth(params: {
    providerId: string;
    activeOAuthProvider: OAuthProviderId | null | undefined;
}): boolean;
```
