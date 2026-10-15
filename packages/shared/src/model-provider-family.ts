// SPDX-License-Identifier: Apache-2.0
// 模型供应商家族规格与解析（B25）。
import { BIGMODEL_PROVIDER_ID, type OAuthProviderId, ZAI_PROVIDER_ID } from "./oauth.js";

import { BUILTIN_MODEL_PROVIDER_IDS, type BuiltinModelProviderId } from "./model-provider-types.js";

import { KNORVIA_ENV } from "./env.js";

import { buildBigModelCodingPlanTeamManageUrl } from "./endpoint.js";

const FAMILY_DOMAIN_TABLE = { zai: "zai", bigmodel: "bigmodel" } as const;
export type ModelProviderFamilyId = keyof typeof FAMILY_DOMAIN_TABLE;

export type ProviderFamilyDomain = (typeof FAMILY_DOMAIN_TABLE)[keyof typeof FAMILY_DOMAIN_TABLE];

export type ModelProviderFamilySpec = {
  id: /* 家族标识 */ ModelProviderFamilyId;
  label: /* 官方展示名 */ string;
  rootDomain: /* 官方根域名 */ string;
  oauthProviderId: /* OAuth 供应商 ID */ typeof ZAI_PROVIDER_ID | typeof BIGMODEL_PROVIDER_ID;
  startPlanProviderId: /* Start Plan 档绑定 */
    | typeof BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan // zai 档
    | typeof BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan; // bigmodel 档
  individualCodingPlanProviderId: /* 个人版 Coding Plan 档绑定 */
    | typeof BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan // zai 档
    | typeof BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan; // bigmodel 档
  teamCodingPlanProviderId: /* 团队版 Coding Plan 档绑定 */
    | typeof BUILTIN_MODEL_PROVIDER_IDS.zaiTeamCodingPlan // zai 档
    | typeof BUILTIN_MODEL_PROVIDER_IDS.bigmodelTeamCodingPlan; // bigmodel 档
  teamCodingPlanManageUrl: /* 团队版管理页 URL */ string;
};

// 三档 provider ID 的短名引用，保持字面量类型。
const ZAI_START = BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan;
const ZAI_INDIVIDUAL = BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan;
const ZAI_TEAM = BUILTIN_MODEL_PROVIDER_IDS.zaiTeamCodingPlan;
const BIGMODEL_START = BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan;
const BIGMODEL_INDIVIDUAL = BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan;
const BIGMODEL_TEAM = BUILTIN_MODEL_PROVIDER_IDS.bigmodelTeamCodingPlan;

const FAMILY_SPEC_VALUES = [
  {
    id: /* zai 家族 */ "zai",
    label: /* 官方展示名 */ "Z.ai",
    rootDomain: /* 官方根域名 */ "z.ai",
    oauthProviderId: /* zai 的 OAuth 绑定 */ ZAI_PROVIDER_ID,
    startPlanProviderId: /* Start Plan 档 */ ZAI_START,
    individualCodingPlanProviderId: /* 个人版档 */ ZAI_INDIVIDUAL,
    teamCodingPlanProviderId: /* 团队版档 */ ZAI_TEAM,
    teamCodingPlanManageUrl: /* 团队版管理页 */ "https://z.ai/manage-apikey/subscription",
  },
  {
    id: /* bigmodel 家族 */ "bigmodel",
    label: /* 官方展示名 */ "BigModel",
    rootDomain: /* 官方根域名 */ "bigmodel.cn",
    oauthProviderId: /* bigmodel 的 OAuth 绑定 */ BIGMODEL_PROVIDER_ID,
    startPlanProviderId: /* Start Plan 档 */ BIGMODEL_START,
    individualCodingPlanProviderId: /* 个人版档 */ BIGMODEL_INDIVIDUAL,
    teamCodingPlanProviderId: /* 团队版档 */ BIGMODEL_TEAM,
    teamCodingPlanManageUrl: /* 按环境拼管理页 */ buildBigModelCodingPlanTeamManageUrl({
      KNORVIA_ENV,
    }),
  },
] as const satisfies readonly ModelProviderFamilySpec[]; // 两项规格逐字冻结

export const MODEL_PROVIDER_FAMILY_SPECS = FAMILY_SPEC_VALUES;

const specsById = new Map<ModelProviderFamilyId, ModelProviderFamilySpec>();
const familyByProviderId = new Map<string, ModelProviderFamilyId>();

for (const familySpec of MODEL_PROVIDER_FAMILY_SPECS) {
  specsById.set(familySpec.id, familySpec);
  const boundProviderIds: BuiltinModelProviderId[] = [
    familySpec.startPlanProviderId,
    familySpec.individualCodingPlanProviderId,
    familySpec.teamCodingPlanProviderId,
  ];
  for (const boundId of boundProviderIds) {
    familyByProviderId.set(boundId, familySpec.id);
  }
}

type FamilySpec = ModelProviderFamilySpec;
type FamilyId = ModelProviderFamilyId;
type DomainOrNull = ProviderFamilyDomain | null;
type OAuthLike = OAuthProviderId | string | null | undefined;

export function getModelProviderFamilySpec(familyKey: ModelProviderFamilyId): FamilySpec {
  return specsById.get(familyKey) as FamilySpec; // 家族键恒在表内
}

export function resolveModelProviderFamilyIdByProviderId(input: string): FamilyId | null {
  return familyByProviderId.get(input) ?? null;
}

export function resolveModelProviderFamilyIdByBaseURL(
  raw: string | null | undefined,
): FamilyId | null {
  const trimmedTarget = raw?.trim();
  if (!trimmedTarget) {
    return null; // 空 URL 不归属任何家族
  }
  let hostname = "";
  try {
    // 只接受能被 URL 解析的地址，再拿小写主机名匹配根域。
    hostname = new URL(trimmedTarget).hostname.toLowerCase();
  } catch {
    // URL 解析失败按无归属处理。
    return null; // 补不出合法 URL 就不归属任何家族
  }
  for (const familySpec of MODEL_PROVIDER_FAMILY_SPECS) {
    const domainHit =
      hostname === familySpec.rootDomain || hostname.endsWith(`.${familySpec.rootDomain}`);
    if (domainHit) {
      return familySpec.id;
    }
  }
  return null; // 域名不在任何家族根域下
}

export function resolveModelProviderFamilySpecByProviderId(input: string): FamilySpec | null {
  const familyKey = resolveModelProviderFamilyIdByProviderId(input);
  return familyKey === null ? null : getModelProviderFamilySpec(familyKey);
}

export function resolveModelProviderFamilyLabelByProviderId(input: string): string | null {
  return resolveModelProviderFamilySpecByProviderId(input)?.label ?? null;
}

function isFamilyDomain(value: string | null | undefined): value is ProviderFamilyDomain {
  return value === FAMILY_DOMAIN_TABLE.zai || value === FAMILY_DOMAIN_TABLE.bigmodel;
}

export function normalizeProviderFamilyDomain(value: string | null | undefined): DomainOrNull {
  return isFamilyDomain(value) ? value : null;
}

const OAUTH_FAMILY_BY_ID = new Map<string, ProviderFamilyDomain>([
  [ZAI_PROVIDER_ID, FAMILY_DOMAIN_TABLE.zai],
  [BIGMODEL_PROVIDER_ID, FAMILY_DOMAIN_TABLE.bigmodel],
]);

export function resolveProviderFamilyDomainFromOAuthProvider(provider: OAuthLike): DomainOrNull {
  if (provider === null || provider === undefined) {
    return null; // 没有登录供应商就没有家族域
  }
  return OAUTH_FAMILY_BY_ID.get(provider) ?? null;
}

export function shouldShowModelProviderFamilyForDomain(request: {
  familyId: /* 目标家族 */ ModelProviderFamilyId;
  providerFamilyDomain: /* 当前家族域 */ ProviderFamilyDomain | null | undefined;
}): boolean {
  const domain = normalizeProviderFamilyDomain(request.providerFamilyDomain);
  return domain === null || request.familyId === domain;
}

export function shouldShowModelProviderFamilyForActiveOAuth(request: {
  familyId: /* 目标家族 */ ModelProviderFamilyId;
  activeOAuthProvider: /* 当前登录供应商 */ OAuthProviderId | null | undefined;
}): boolean {
  return shouldShowModelProviderFamilyForDomain({
    familyId: request.familyId,
    providerFamilyDomain: resolveProviderFamilyDomainFromOAuthProvider(request.activeOAuthProvider),
  });
}

export function shouldShowBuiltinModelProviderForDomain(request: {
  providerId: /* 内置 provider ID */ string;
  providerFamilyDomain: /* 当前家族域 */ ProviderFamilyDomain | null | undefined;
}): boolean {
  const familyKey = resolveModelProviderFamilyIdByProviderId(request.providerId);
  const visible =
    familyKey === null ||
    shouldShowModelProviderFamilyForDomain({
      familyId: familyKey,
      providerFamilyDomain: request.providerFamilyDomain,
    });
  return visible;
}

export function shouldShowBuiltinModelProviderForActiveOAuth(request: {
  providerId: /* 内置 provider ID */ string;
  activeOAuthProvider: /* 当前登录供应商 */ OAuthProviderId | null | undefined;
}): boolean {
  return shouldShowBuiltinModelProviderForDomain({
    providerId: request.providerId,
    providerFamilyDomain: resolveProviderFamilyDomainFromOAuthProvider(request.activeOAuthProvider),
  });
}
