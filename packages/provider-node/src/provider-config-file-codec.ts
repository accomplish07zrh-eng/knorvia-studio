// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
import { z } from "zod";
import { modelSelectionSchema } from "@knorvia/shared/model-selection";
import { completeModelConfigDataSchema, modelConfigDataSchema } from "@knorvia/shared/model-config";
import {
  extractManualModelConfig,
  manualModelConfigSchema,
  parsePersonalModelConfigRules,
  parsePersonalProviderConfigMap,
  type ProviderConfigLayerUpdate,
} from "@knorvia/provider";

const SUPPORTED_SCHEMA_VERSION = 1;

const VERSION_MESSAGES = {
  absent: "Provider Config 缺少 schemaVersion",
  notAnIndex: "Provider Config schemaVersion 必须是非负整数",
  unversionedUpgrade: "Provider Config 迁移器必须产生版本化文件",
} as const;

// 交换格式的字段声明：未知键在顶层与 config 层都拒绝，规则内容留给 provider 层校验。
const anyPayload = z.unknown();
const orderList = z.array(z.string().min(1)).optional();
const selectionField = modelSelectionSchema.optional();

const configContract = z.strictObject({
  providerOrder: orderList,
  providerConfigRules: anyPayload,
  modelConfigRules: anyPayload,
  defaultModelSelection: selectionField,
});

const fileContract = z.strictObject({
  schemaVersion: z.literal(SUPPORTED_SCHEMA_VERSION),
  config: configContract,
});

// 旧 manual 规则的两种历史形状：完整字段集，以及多带 requiresMfjsToolSchema 的可编辑形状。
const enabledToggle = modelConfigDataSchema.shape.enabled;
const toolSchemaToggle =
  completeModelConfigDataSchema.shape.properties.shape.requiresMfjsToolSchema;

const historicalManualForms = z.union([
  completeModelConfigDataSchema.extend({ enabled: enabledToggle }),
  manualModelConfigSchema.extend({
    properties: manualModelConfigSchema.shape.properties.extend({
      requiresMfjsToolSchema: toolSchemaToggle,
    }),
  }),
]);

// 目前只有 1 版：升级表为空，任何低版本都会命中「缺迁移器」。
const upgraders: ReadonlyMap<number, (payload: unknown) => unknown> = new Map();

export class UnsupportedProviderConfigVersionError extends Error {
  override readonly name = "UnsupportedProviderConfigVersionError";

  readonly version: number | null;

  constructor(message: string, version: number | null) {
    super(message);
    this.version = version;
  }
}

const unsupported = (message: string, version: number | null) =>
  new UnsupportedProviderConfigVersionError(message, version);

const isPlainObject = (candidate: unknown): candidate is Record<string, unknown> =>
  typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);

const readVersion = (candidate: unknown): number | null => {
  if (!isPlainObject(candidate) || !Object.hasOwn(candidate, "schemaVersion")) return null;
  const version = candidate.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) {
    throw unsupported(VERSION_MESSAGES.notAnIndex, null);
  }
  return version;
};

const tooNew = (version: number) =>
  `Provider Config schemaVersion ${version} 高于当前支持的 ${SUPPORTED_SCHEMA_VERSION}`;

const missingUpgrade = (version: number) =>
  `缺少 Provider Config schemaVersion ${version} 到 ${version + 1} 的迁移器`;

const skippedStep = (version: number) =>
  `Provider Config 迁移器必须从 schemaVersion ${version} 迁移到 ${version + 1}`;

// 版本从文件声明值逐级加一；升级函数不存在或跳号都立即失败，不做猜测性修补。
const upgradeToCurrent = (payload: unknown): unknown => {
  const claimed = readVersion(payload);
  if (claimed === null) throw unsupported(VERSION_MESSAGES.absent, null);
  if (claimed > SUPPORTED_SCHEMA_VERSION) throw unsupported(tooNew(claimed), claimed);

  const climb = (current: unknown, version: number): unknown => {
    if (version === SUPPORTED_SCHEMA_VERSION) return current;
    const upgrade = upgraders.get(version);
    if (upgrade === undefined) throw unsupported(missingUpgrade(version), version);
    const upgraded = upgrade(current);
    const declared = readVersion(upgraded);
    if (declared === null) throw unsupported(VERSION_MESSAGES.unversionedUpgrade, null);
    if (declared !== version + 1) throw new Error(skippedStep(version));
    return climb(upgraded, declared);
  };

  return climb(payload, claimed);
};

const normalizeManualRule = (rule: unknown): unknown => {
  if (!isPlainObject(rule)) return rule;
  if (manualModelConfigSchema.safeParse(rule.config).success) return rule;
  const historical = historicalManualForms.safeParse(rule.config);
  if (!historical.success) return rule;
  return { ...rule, config: extractManualModelConfig(historical.data) };
};

const normalizeManualRules = (rules: unknown): unknown => {
  if (!isPlainObject(rules) || !Array.isArray(rules.manualProviderModelRules)) return rules;
  return {
    ...rules,
    manualProviderModelRules: rules.manualProviderModelRules.map(normalizeManualRule),
  };
};

export function decodeProviderConfigFile(input: unknown): ProviderConfigLayerUpdate {
  const { config } = fileContract.parse(upgradeToCurrent(input));
  const snapshot: ProviderConfigLayerUpdate = {
    providers: parsePersonalProviderConfigMap(config.providerConfigRules),
    models: parsePersonalModelConfigRules(normalizeManualRules(config.modelConfigRules)),
    providerOrder: config.providerOrder,
    ...(config.defaultModelSelection === undefined
      ? {}
      : { defaultModelSelection: config.defaultModelSelection }),
  };
  return Object.freeze(snapshot);
}

export function encodeProviderConfigFile(update: ProviderConfigLayerUpdate) {
  const config = {
    ...(update.providerOrder === undefined ? {} : { providerOrder: update.providerOrder }),
    providerConfigRules: { providerRules: update.providers.toJSON() },
    modelConfigRules: update.models.toPersonalJSON(),
    ...(update.defaultModelSelection === undefined
      ? {}
      : { defaultModelSelection: update.defaultModelSelection }),
  };
  return { schemaVersion: SUPPORTED_SCHEMA_VERSION, config };
}
