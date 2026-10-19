// SPDX-License-Identifier: Apache-2.0
// Provider 供给信封：把「个人配置 + 账号设置 + 凭据」打包成一次可传输、可回执的
// 同步单元。这里只有数据合同与严格解码器；落盘、回滚与网络投递都在服务层。

import { z } from "zod";
import { modelSelectionSchema as selectionSchema } from "./model-selection.js";
import { providerFamilyConnectionSelectionSettingsSchema as familySelectionsSchema } from "./provider-family-connection-selection.js";

/** 空白分隔的词表登记一次，同时投影成 zod 枚举元组与展示顺序。 */
const tuple = (source: string): [string, ...string[]] =>
  source.trim().split(/\s+/u) as [string, ...string[]];

const strict = (shape: z.ZodRawShape) => z.object(shape).strict();

/** 跨 Environment 的主键统一 trim + 非空；其余文本原样保留。 */
const identifier = z.string().trim().min(1);
const text = () => z.string();
const flag = () => z.boolean();
const count = () => z.number().int().nonnegative();
const many = <T extends z.ZodTypeAny>(item: T) => z.array(item);
const opaqueMany = () => z.array(z.unknown());

const TRIGGER_WORDS =
  "environment-online personal-config configured-default account-settings credential";
const CREDENTIAL_SCOPE_WORDS = "oauth-session account-provider";
const RESULT_STATUS_WORDS = "applied already-applied unsupported failed rollback_failed";
const FAMILY_DOMAIN_WORDS = "zai bigmodel";

export const providerProvisioningTriggerSchema = z.enum(tuple(TRIGGER_WORDS));
export type ProviderProvisioningTrigger = z.output<typeof providerProvisioningTriggerSchema>;

const credentialScopeSchema = z.enum(tuple(CREDENTIAL_SCOPE_WORDS));

/** Provisioning 中允许跨 Environment 传输的凭据类别。 */
export const providerProvisioningCredentialScopeSchema = credentialScopeSchema;

export type ProviderProvisioningCredentialScope = z.infer<typeof credentialScopeSchema>;

/** 账号 Provider 的请求期 API key 形状：中间段是 Provider id（可含冒号）。 */
const ACCOUNT_CREDENTIAL_KEY = /^account-provider:.+:api-key$/u;

/**
 * 只允许同步 Account Provider 的请求期 API key，不同步账号身份或未来扩展字段。
 * 首尾空白一律视为不合法而不是先 trim 再匹配——键必须按原样跨 Environment 复现。
 */
export const isProviderProvisioningAccountCredentialKey = (key: string): boolean =>
  key.trim() === key && ACCOUNT_CREDENTIAL_KEY.test(key);

const personalConfigShape = () =>
  strict({
    providerConfigRules: strict({ providerRules: opaqueMany() }),
    modelConfigRules: strict({
      providerModelRules: opaqueMany(),
      manualProviderModelRules: opaqueMany(),
    }),
    providerOrder: many(identifier).optional(),
    defaultModelSelection: selectionSchema.optional(),
  });

/** Personal Config 的 Envelope；具体字段由 @knorvia/provider 在目标 Environment 再校验。 */
export const providerProvisioningPersonalConfigSchema = personalConfigShape();

export type ProviderProvisioningPersonalConfig = z.infer<typeof personalConfigShape>;

const accountSettingsShape = () =>
  strict({
    providerFamilyDomain: z.enum(tuple(FAMILY_DOMAIN_WORDS)).nullable(),
    providerFamilyConnectionSelections: familySelectionsSchema,
  });

export const providerProvisioningAccountSettingsSchema = accountSettingsShape();

export type ProviderProvisioningAccountSettings = z.infer<typeof accountSettingsShape>;

const credentialEntryShape = () =>
  strict({
    scope: credentialScopeSchema,
    key: identifier,
    value: text(),
  });

export const providerProvisioningCredentialEntrySchema = credentialEntryShape();

export type ProviderProvisioningCredentialEntry = z.infer<typeof credentialEntryShape>;

const envelopeShape = () =>
  strict({
    schemaVersion: z.literal(1),
    syncId: identifier,
    personalConfig: providerProvisioningPersonalConfigSchema,
    accountSettings: providerProvisioningAccountSettingsSchema,
    credentials: many(providerProvisioningCredentialEntrySchema).max(256),
  });

export const providerProvisioningEnvelopeSchema = envelopeShape();

export type ProviderProvisioningEnvelope = z.infer<typeof envelopeShape>;

/**
 * 回执只描述「发生了什么」：计数用于对账，errorMessage 仅在失败时出现，
 * rolledBack 单独一个布尔，因为回滚失败本身也是一种终态。
 */
const resultShape = () =>
  strict({
    syncId: identifier,
    status: z.enum(tuple(RESULT_STATUS_WORDS)),
    personalProviderCount: count(),
    credentialCount: count(),
    configRevision: identifier.optional(),
    errorMessage: text().optional(),
    rolledBack: flag(),
  });

export const providerProvisioningResultSchema = resultShape();

export type ProviderProvisioningResult = z.infer<typeof resultShape>;
