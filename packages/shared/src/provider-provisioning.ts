// SPDX-License-Identifier: Apache-2.0
// Provider 供给信封：把「个人配置 + 账号设置 + 凭据」打包成一次可传输、可回执的
// 同步单元。这里只有数据合同与严格解码器；落盘、回滚与网络投递都在服务层。
// 枚举取值表在 ./provider-provisioning-data.js。

import { z } from "zod";
import { modelSelectionSchema as selectionSchema } from "./model-selection.js";
import { providerFamilyConnectionSelectionSettingsSchema as familySelectionsSchema } from "./provider-family-connection-selection.js";
import {
  PROVIDER_PROVISIONING_CREDENTIAL_SCOPES,
  PROVIDER_PROVISIONING_FAMILY_DOMAINS,
  PROVIDER_PROVISIONING_RESULT_STATUSES,
  PROVIDER_PROVISIONING_TRIGGERS,
} from "./provider-provisioning-data.js";

const strict = <S extends z.ZodRawShape>(shape: S) => z.object(shape).strict();

/** 跨 Environment 的主键统一 trim + 非空；其余文本原样保留。 */
const identifier = z.string().trim().min(1);
const text = () => z.string();
const flag = () => z.boolean();
const count = () => z.number().int().nonnegative();
const many = <T extends z.ZodTypeAny>(item: T) => z.array(item);
const opaqueMany = () => z.array(z.unknown());

export const providerProvisioningTriggerSchema = z.enum(PROVIDER_PROVISIONING_TRIGGERS);
export type ProviderProvisioningTrigger = z.output<typeof providerProvisioningTriggerSchema>;

const credentialScopeSchema = z.enum(PROVIDER_PROVISIONING_CREDENTIAL_SCOPES);

/** Provisioning 中允许跨 Environment 传输的凭据类别。 */
export const providerProvisioningCredentialScopeSchema = credentialScopeSchema;

export type ProviderProvisioningCredentialScope = z.output<typeof credentialScopeSchema>;

/** 账号 Provider 的请求期 API key 形状：中间段是 Provider id（可含冒号）。 */
const ACCOUNT_CREDENTIAL_KEY = /^account-provider:.+:api-key$/u;

/**
 * 只允许同步 Account Provider 的请求期 API key，不同步账号身份或未来扩展字段。
 * 首尾空白一律视为不合法而不是先 trim 再匹配——键必须按原样跨 Environment 复现。
 */
export const isProviderProvisioningAccountCredentialKey = (key: string): boolean =>
  key.trim() === key && ACCOUNT_CREDENTIAL_KEY.test(key);

const personalConfigShape = () => ({
  providerConfigRules: strict({ providerRules: opaqueMany() }),
  modelConfigRules: strict({
    providerModelRules: opaqueMany(),
    manualProviderModelRules: opaqueMany(),
  }),
  providerOrder: many(identifier).optional(),
  defaultModelSelection: selectionSchema.optional(),
});

/** Personal Config 的 Envelope；具体字段由 @knorvia/provider 在目标 Environment 再校验。 */
export const providerProvisioningPersonalConfigSchema = strict(personalConfigShape());

export type ProviderProvisioningPersonalConfig = z.output<
  typeof providerProvisioningPersonalConfigSchema
>;

const accountSettingsShape = () => ({
  providerFamilyDomain: z.enum(PROVIDER_PROVISIONING_FAMILY_DOMAINS).nullable(),
  providerFamilyConnectionSelections: familySelectionsSchema,
});

export const providerProvisioningAccountSettingsSchema = strict(accountSettingsShape());

export type ProviderProvisioningAccountSettings = z.output<
  typeof providerProvisioningAccountSettingsSchema
>;

const credentialEntryShape = () => ({
  scope: credentialScopeSchema,
  key: identifier,
  value: text(),
});

export const providerProvisioningCredentialEntrySchema = strict(credentialEntryShape());

export type ProviderProvisioningCredentialEntry = z.output<
  typeof providerProvisioningCredentialEntrySchema
>;

const envelopeShape = () => ({
  schemaVersion: z.literal(1),
  syncId: identifier,
  personalConfig: providerProvisioningPersonalConfigSchema,
  accountSettings: providerProvisioningAccountSettingsSchema,
  credentials: many(providerProvisioningCredentialEntrySchema).max(256),
});

export const providerProvisioningEnvelopeSchema = strict(envelopeShape());

export type ProviderProvisioningEnvelope = z.output<typeof providerProvisioningEnvelopeSchema>;

/**
 * 回执只描述「发生了什么」：计数用于对账，errorMessage 仅在失败时出现，
 * rolledBack 单独一个布尔，因为回滚失败本身也是一种终态。
 */
const resultShape = () => ({
  syncId: identifier,
  status: z.enum(PROVIDER_PROVISIONING_RESULT_STATUSES),
  personalProviderCount: count(),
  credentialCount: count(),
  configRevision: identifier.optional(),
  errorMessage: text().optional(),
  rolledBack: flag(),
});

export const providerProvisioningResultSchema = strict(resultShape());

export type ProviderProvisioningResult = z.output<typeof providerProvisioningResultSchema>;
