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
  startPlanProviderId:
    | typeof BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan
    | typeof BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan;
  individualCodingPlanProviderId:
    | typeof BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan
    | typeof BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan;
  teamCodingPlanProviderId:
    | typeof BUILTIN_MODEL_PROVIDER_IDS.zaiTeamCodingPlan
    | typeof BUILTIN_MODEL_PROVIDER_IDS.bigmodelTeamCodingPlan;
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

const familySpecsById = new Map<ModelProviderFamilyId, ModelProviderFamilySpec>();
const familyIdsByProviderId = new Map<string, ModelProviderFamilyId>();

for (const spec of MODEL_PROVIDER_FAMILY_SPECS) {
  familySpecsById.set(spec.id, spec);
  const providerIds: BuiltinModelProviderId[] = [
    spec.startPlanProviderId,
    spec.individualCodingPlanProviderId,
    spec.teamCodingPlanProviderId,
  ];
  for (const providerId of providerIds) {
    familyIdsByProviderId.set(providerId, spec.id);
  }
}

export function getModelProviderFamilySpec(
  familyId: ModelProviderFamilyId,
): ModelProviderFamilySpec {
  return familySpecsById.get(familyId) as ModelProviderFamilySpec;
}

export function resolveModelProviderFamilyIdByProviderId(
  providerId: string,
): ModelProviderFamilyId | null {
  return familyIdsByProviderId.get(providerId) ?? null;
}

export function resolveModelProviderFamilyIdByBaseURL(
  baseURL: string | null | undefined,
): ModelProviderFamilyId | null {
  const trimmedURL = baseURL?.trim();
  if (!trimmedURL) {
    return null;
  }
  let hostname: string;
  try {
    hostname = new URL(trimmedURL).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const spec of MODEL_PROVIDER_FAMILY_SPECS) {
    if (hostname === spec.rootDomain || hostname.endsWith(`.${spec.rootDomain}`)) {
      return spec.id;
    }
  }
  return null;
}

export function resolveModelProviderFamilySpecByProviderId(
  providerId: string,
): ModelProviderFamilySpec | null {
  const familyId = resolveModelProviderFamilyIdByProviderId(providerId);
  return familyId === null ? null : getModelProviderFamilySpec(familyId);
}

export function resolveModelProviderFamilyLabelByProviderId(providerId: string): string | null {
  return resolveModelProviderFamilySpecByProviderId(providerId)?.label ?? null;
}

export function normalizeProviderFamilyDomain(
  value: string | null | undefined,
): ProviderFamilyDomain | null {
  return value === "zai" || value === "bigmodel" ? value : null;
}

export function resolveProviderFamilyDomainFromOAuthProvider(
  provider: OAuthProviderId | string | null | undefined,
): ProviderFamilyDomain | null {
  if (provider === ZAI_PROVIDER_ID) {
    return "zai";
  }
  if (provider === BIGMODEL_PROVIDER_ID) {
    return "bigmodel";
  }
  return null;
}

export function shouldShowModelProviderFamilyForDomain(params: {
  familyId: ModelProviderFamilyId;
  providerFamilyDomain: ProviderFamilyDomain | null | undefined;
}): boolean {
  const domain = normalizeProviderFamilyDomain(params.providerFamilyDomain);
  return domain === null || params.familyId === domain;
}

export function shouldShowModelProviderFamilyForActiveOAuth(params: {
  familyId: ModelProviderFamilyId;
  activeOAuthProvider: OAuthProviderId | null | undefined;
}): boolean {
  return shouldShowModelProviderFamilyForDomain({
    familyId: params.familyId,
    providerFamilyDomain: resolveProviderFamilyDomainFromOAuthProvider(params.activeOAuthProvider),
  });
}

export function shouldShowBuiltinModelProviderForDomain(params: {
  providerId: string;
  providerFamilyDomain: ProviderFamilyDomain | null | undefined;
}): boolean {
  const familyId = resolveModelProviderFamilyIdByProviderId(params.providerId);
  return (
    familyId === null ||
    shouldShowModelProviderFamilyForDomain({
      familyId,
      providerFamilyDomain: params.providerFamilyDomain,
    })
  );
}

export function shouldShowBuiltinModelProviderForActiveOAuth(params: {
  providerId: string;
  activeOAuthProvider: OAuthProviderId | null | undefined;
}): boolean {
  return shouldShowBuiltinModelProviderForDomain({
    providerId: params.providerId,
    providerFamilyDomain: resolveProviderFamilyDomainFromOAuthProvider(params.activeOAuthProvider),
  });
}
