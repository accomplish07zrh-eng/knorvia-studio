// SPDX-License-Identifier: Apache-2.0
// shared-02 合同测试：模型供应商与选择（B24–B31、B33）。
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  barrel,
  modelSelectionEntry,
  accountProviderStateEntry,
  configSchemaEntry,
} from "./entry.mjs";

const {
  BUILTIN_MODEL_PROVIDER_IDS,
  BUILTIN_PROVIDER_TEMPLATE_IDS,
  isBuiltinModelProviderId,
  isZaiCodingPlanProviderId,
  isBigModelStartPlanProviderId,
  isStartPlanModelProviderId,
  isIndividualCodingPlanModelProviderId,
  isCodingPlanModelProviderId,
  MODEL_PROVIDER_FAMILY_SPECS,
  getModelProviderFamilySpec,
  resolveModelProviderFamilyIdByProviderId,
  resolveModelProviderFamilyIdByBaseURL,
  resolveModelProviderFamilySpecByProviderId,
  resolveModelProviderFamilyLabelByProviderId,
  normalizeProviderFamilyDomain,
  resolveProviderFamilyDomainFromOAuthProvider,
  shouldShowModelProviderFamilyForDomain,
  shouldShowBuiltinModelProviderForDomain,
  CUSTOM_MODEL_VALUE_PREFIX,
  encodeCustomModelValue,
  decodeCustomModelValue,
  NATIVE_SUPPLIER_KEY_PREFIX,
  CUSTOM_SUPPLIER_KEY_PREFIX,
  GHOST_SUPPLIER_KEY_PREFIX,
  normalizeSupplierBaseUrl,
  buildNativeSupplierKey,
  buildCustomSupplierKey,
  buildGhostSupplierIdentity,
  buildGhostSupplierKey,
  resolveSupplierKeyFromModelDisplayValue,
  KNORVIA_MODEL_REASONING_SEPARATOR,
  migrateLegacyModelProviderId,
  migrateLegacyOfficialGlmModelId,
  OFFICIAL_GLM_MODEL_IDS,
  normalizeOfficialGlmModelId,
  providerFamilyConnectionSelectionSchema,
  providerFamilyConnectionSelectionSettingsSchema,
  knorviaProviderSchema,
  parsePluginSubagentModelSelectionOverrides,
  createAgentStateId,
  createPluginAgentStateId,
  KNORVIA_AGENT_PROVIDER_NOT_READY_CODE,
  KNORVIA_AGENT_PROVIDER_NOT_READY_REASON,
} = barrel;

const { modelSelectionSchema, formatModelPickerValue, parseModelPickerValue } = modelSelectionEntry;

test("B24 内置供应商 ID 六值与模板 ID 逐字不变", () => {
  assert.deepEqual(BUILTIN_MODEL_PROVIDER_IDS, {
    zaiIndividualCodingPlan: "account:zai-individual-coding-plan",
    zaiTeamCodingPlan: "account:zai-team-coding-plan",
    zaiStartPlan: "account:zai-start-plan",
    bigmodelIndividualCodingPlan: "account:bigmodel-individual-coding-plan",
    bigmodelTeamCodingPlan: "account:bigmodel-team-coding-plan",
    bigmodelStartPlan: "account:bigmodel-start-plan",
  });
  assert.deepEqual(BUILTIN_PROVIDER_TEMPLATE_IDS, { zai: "zai-api", bigmodel: "bigmodel-api" });
});

test("B24 判别函数：内置六值与各档位集合", () => {
  const ids = Object.values(BUILTIN_MODEL_PROVIDER_IDS);
  for (const id of ids) assert.equal(isBuiltinModelProviderId(id), true, id);
  assert.equal(isBuiltinModelProviderId("custom:x"), false);
  assert.equal(isZaiCodingPlanProviderId(BUILTIN_MODEL_PROVIDER_IDS.zaiTeamCodingPlan), true);
  assert.equal(isZaiCodingPlanProviderId(BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan), false);
  assert.equal(isBigModelStartPlanProviderId(BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan), true);
  assert.equal(isStartPlanModelProviderId(BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan), true);
  assert.equal(
    isStartPlanModelProviderId(BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan),
    false,
  );
  assert.equal(
    isIndividualCodingPlanModelProviderId(BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan),
    true,
  );
  assert.equal(
    isIndividualCodingPlanModelProviderId(BUILTIN_MODEL_PROVIDER_IDS.bigmodelTeamCodingPlan),
    false,
  );
  assert.equal(
    isCodingPlanModelProviderId(BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan),
    true,
  );
  assert.equal(isCodingPlanModelProviderId(BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan), true);
});

test("B25 家族规格表：两项、标签、域名、manage URL 与三档 ID 绑定", () => {
  assert.equal(MODEL_PROVIDER_FAMILY_SPECS.length, 2);
  const zai = getModelProviderFamilySpec("zai");
  assert.equal(zai.label, "Z.ai");
  assert.equal(zai.rootDomain, "z.ai");
  assert.equal(zai.teamCodingPlanManageUrl, "https://z.ai/manage-apikey/subscription");
  assert.equal(zai.startPlanProviderId, BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan);
  const bigmodel = getModelProviderFamilySpec("bigmodel");
  assert.equal(bigmodel.label, "BigModel");
  assert.equal(bigmodel.rootDomain, "bigmodel.cn");
  assert.match(bigmodel.teamCodingPlanManageUrl, /^https?:\/\//u);
});

test("B25 providerId/baseURL/domain 解析与显示判定", () => {
  assert.equal(
    resolveModelProviderFamilyIdByProviderId(BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan),
    "zai",
  );
  assert.equal(
    resolveModelProviderFamilyIdByProviderId(BUILTIN_MODEL_PROVIDER_IDS.bigmodelTeamCodingPlan),
    "bigmodel",
  );
  assert.equal(resolveModelProviderFamilyIdByProviderId("custom:x"), null);
  assert.equal(resolveModelProviderFamilyIdByBaseURL("https://z.ai/v1"), "zai");
  assert.equal(
    resolveModelProviderFamilyIdByBaseURL("https://api.bigmodel.cn/paas/v4"),
    "bigmodel",
  );
  assert.equal(
    resolveModelProviderFamilyIdByBaseURL("https://evilz.ai/"),
    null,
    "后缀需 . 前缀对齐",
  );
  assert.equal(resolveModelProviderFamilyIdByBaseURL("not a url"), null);
  assert.equal(resolveModelProviderFamilyIdByBaseURL(undefined), null);
  assert.equal(
    resolveModelProviderFamilyLabelByProviderId(BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan),
    "Z.ai",
  );
  assert.equal(resolveModelProviderFamilyLabelByProviderId("custom:x"), null);
  assert.equal(resolveModelProviderFamilySpecByProviderId("custom:x"), null);
  assert.equal(normalizeProviderFamilyDomain("zai"), "zai");
  assert.equal(normalizeProviderFamilyDomain("openrouter"), null);
  assert.equal(resolveProviderFamilyDomainFromOAuthProvider("zai"), "zai");
  assert.equal(resolveProviderFamilyDomainFromOAuthProvider("bigmodel"), "bigmodel");
  assert.equal(resolveProviderFamilyDomainFromOAuthProvider("openrouter"), null);
  assert.equal(
    shouldShowModelProviderFamilyForDomain({ familyId: "zai", providerFamilyDomain: null }),
    true,
  );
  assert.equal(
    shouldShowModelProviderFamilyForDomain({ familyId: "zai", providerFamilyDomain: "bigmodel" }),
    false,
  );
  assert.equal(
    shouldShowBuiltinModelProviderForDomain({
      providerId: BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan,
      providerFamilyDomain: "bigmodel",
    }),
    false,
  );
});

test("B26 自定义模型值编解码往返与 legacy builtin 形态", () => {
  assert.equal(CUSTOM_MODEL_VALUE_PREFIX, "custom:");
  assert.equal(encodeCustomModelValue("p-1"), "custom:p-1");
  assert.equal(encodeCustomModelValue("p 1", "m/1"), "custom:p%201:m%2F1");
  assert.deepEqual(decodeCustomModelValue("custom:p%201:m%2F1"), {
    providerId: "p 1",
    modelName: "m/1",
  });
  assert.deepEqual(decodeCustomModelValue("custom:only-provider"), { providerId: "only-provider" });
  assert.deepEqual(decodeCustomModelValue("custom:builtin:zai:model:x"), {
    providerId: "builtin:zai",
    modelName: "model:x",
  });
  assert.equal(decodeCustomModelValue("native:zai"), null);
  assert.deepEqual(decodeCustomModelValue("custom:%E0%A4%A"), {
    providerId: "%E0%A4%A",
  });
});

test("B27 供应商 key 前缀、baseURL 归一与 ghost 摘要退化", () => {
  assert.equal(NATIVE_SUPPLIER_KEY_PREFIX, "native:");
  assert.equal(CUSTOM_SUPPLIER_KEY_PREFIX, "custom:");
  assert.equal(GHOST_SUPPLIER_KEY_PREFIX, "ghost:");
  assert.equal(normalizeSupplierBaseUrl("  https://x.example/// "), "https://x.example");
  assert.equal(buildNativeSupplierKey("knorvia"), "native:knorvia");
  assert.equal(buildCustomSupplierKey("  p1  "), "custom:p1");
  assert.equal(buildGhostSupplierIdentity("  "), "unknown");
  assert.equal(buildGhostSupplierIdentity("a b"), "a%20b");
  const longIdentity = `https://x.example/${"seg/".repeat(80)}`;
  assert.match(buildGhostSupplierIdentity(longIdentity), /^hash=[0-9a-f]{12}$/u);
  assert.equal(buildGhostSupplierKey("knorvia", "mismatch", "raw"), "ghost:knorvia:mismatch:raw");
  assert.equal(
    resolveSupplierKeyFromModelDisplayValue("knorvia", encodeCustomModelValue("p9", "m")),
    "custom:p9",
  );
  assert.equal(resolveSupplierKeyFromModelDisplayValue("knorvia", undefined), "native:knorvia");
  assert.equal(resolveSupplierKeyFromModelDisplayValue("knorvia", "plain-model"), "native:knorvia");
});

test("B28 modelSelectionSchema：strict、trim 非空、未知键拒绝", () => {
  assert.equal(KNORVIA_MODEL_REASONING_SEPARATOR, "$");
  assert.deepEqual(modelSelectionSchema.parse({ providerId: " p1 ", modelId: " m1 " }), {
    providerId: "p1",
    modelId: "m1",
  });
  assert.equal(modelSelectionSchema.safeParse({ providerId: "p", modelId: " " }).success, false);
  assert.equal(
    modelSelectionSchema.safeParse({ providerId: "p", modelId: "m", extra: 1 }).success,
    false,
    "strict 拒绝未知键",
  );
  assert.equal(
    modelSelectionSchema.safeParse({
      providerId: "p",
      modelId: "m",
      options: { reasoningLevel: " ", bogus: 1 },
    }).success,
    false,
  );
});

test("B28 formatModelPickerValue / parseModelPickerValue 往返与错误语义", () => {
  assert.equal(formatModelPickerValue(undefined), "");
  assert.equal(formatModelPickerValue({ providerId: "p", modelId: "m" }), "p/m");
  assert.equal(
    formatModelPickerValue({ providerId: "p", modelId: "m", options: { reasoningLevel: "high" } }),
    "p/m$high",
  );
  assert.deepEqual(parseModelPickerValue("p/m"), { providerId: "p", modelId: "m" });
  assert.deepEqual(parseModelPickerValue("p/m$high"), {
    providerId: "p",
    modelId: "m",
    options: { reasoningLevel: "high" },
  });
  assert.throws(() => parseModelPickerValue("/m"), /模型选择缺少 Provider/u);
  assert.throws(() => parseModelPickerValue("only-model"));
  assert.throws(() => parseModelPickerValue("p/ "), "空模型名应被 schema 拒绝");
});

test("B29 旧供应商 ID 迁移表与 builtin: 未知返回 undefined", () => {
  assert.equal(
    migrateLegacyModelProviderId("builtin:bigmodel"),
    BUILTIN_PROVIDER_TEMPLATE_IDS.bigmodel,
  );
  assert.equal(migrateLegacyModelProviderId("builtin:zai"), BUILTIN_PROVIDER_TEMPLATE_IDS.zai);
  assert.equal(
    migrateLegacyModelProviderId("builtin:bigmodel-start-plan"),
    BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan,
  );
  assert.equal(
    migrateLegacyModelProviderId("builtin:zai-start-plan"),
    BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan,
  );
  assert.equal(
    migrateLegacyModelProviderId("builtin:bigmodel-coding-plan"),
    BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan,
  );
  assert.equal(
    migrateLegacyModelProviderId("builtin:zai-coding-plan"),
    BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan,
  );
  assert.equal(migrateLegacyModelProviderId("builtin:unknown"), undefined);
  assert.equal(migrateLegacyModelProviderId("custom:mine"), "custom:mine");
});

test("B29 migrateLegacyOfficialGlmModelId：只对内置/账号 provider 生效", () => {
  assert.equal(
    migrateLegacyOfficialGlmModelId(BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan, "GLM-4.6"),
    "GLM-4.6",
  );
  assert.equal(
    migrateLegacyOfficialGlmModelId(BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan, "glm-4-flashx-250414"),
    "GLM-4-FlashX-250414",
  );
  assert.equal(
    migrateLegacyOfficialGlmModelId(BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan, "unknown-model"),
    "unknown-model",
    "非官方 ID 原样返回",
  );
  assert.equal(
    migrateLegacyOfficialGlmModelId("custom:mine", "glm-4-flashx-250414"),
    "glm-4-flashx-250414",
  );
  assert.equal(
    migrateLegacyOfficialGlmModelId("builtin:zai-coding-plan", "glm-5"),
    "GLM-5",
    "builtin:<legacy coding-plan> 也在迁移名单",
  );
  assert.equal(
    migrateLegacyOfficialGlmModelId("builtin:zai-api", "glm-5"),
    "glm-5",
    "模板 ID（zai-api）不在迁移名单",
  );
});

test("B30 官方 GLM 名单 22 项与大小写不敏感归一", () => {
  assert.equal(OFFICIAL_GLM_MODEL_IDS.length, 22);
  assert.equal(OFFICIAL_GLM_MODEL_IDS[0], "GLM-5.3");
  assert.equal(OFFICIAL_GLM_MODEL_IDS.at(-1), "GLM-4V-Flash");
  assert.equal(normalizeOfficialGlmModelId("glm-5.3-flash"), "GLM-5.3-Flash");
  assert.equal(normalizeOfficialGlmModelId("unknown-model"), "unknown-model");
});

test("B31 家族连接选择 schema：team 三字段必填、strict、settings 整体 partial", () => {
  assert.equal(
    providerFamilyConnectionSelectionSchema.safeParse({ kind: "start-plan" }).success,
    true,
  );
  assert.equal(
    providerFamilyConnectionSelectionSchema.safeParse({
      kind: "team-coding-plan",
      productId: "p",
      organizationId: "o",
      projectId: "pr",
    }).success,
    true,
  );
  assert.equal(
    providerFamilyConnectionSelectionSchema.safeParse({ kind: "team-coding-plan", productId: "p" })
      .success,
    false,
  );
  assert.equal(
    providerFamilyConnectionSelectionSchema.safeParse({ kind: "start-plan", bogus: 1 }).success,
    false,
  );
  assert.equal(providerFamilyConnectionSelectionSettingsSchema.safeParse({}).success, true);
  assert.equal(
    providerFamilyConnectionSelectionSettingsSchema.safeParse({ zai: { kind: "start-plan" } })
      .success,
    true,
  );
});

test("B32 账号不可用原因四值枚举（子路径入口同面）", () => {
  const schema = accountProviderStateEntry.accountProviderUnavailableReasonSchema;
  for (const value of ["not-authenticated", "not-connected", "credential-failed", "not-entitled"]) {
    assert.equal(schema.safeParse(value).success, true, value);
  }
  assert.equal(schema.safeParse("bogus").success, false);
});

test("B33 knorviaProviderSchema 单值枚举", () => {
  assert.equal(knorviaProviderSchema.safeParse("knorvia").success, true);
  assert.equal(knorviaProviderSchema.safeParse("openai").success, false);
});

test("B13 sparseShape（config-schema 子路径入口）：每项 nullable+optional", () => {
  const { sparseShape } = configSchemaEntry;
  const { nonEmptyStringSchema } = barrel;
  const derived = sparseShape({ alpha: nonEmptyStringSchema });
  assert.deepEqual(Object.keys(derived), ["alpha"]);
  assert.equal(derived.alpha.safeParse(undefined).success, true);
  assert.equal(derived.alpha.safeParse(null).success, true);
  assert.equal(derived.alpha.safeParse("  x ").success, true);
  assert.equal(derived.alpha.safeParse(3).success, false, "原 schema 的类型约束保留");
  assert.notEqual(derived.alpha, nonEmptyStringSchema, "派生新 schema，不修改原对象");
});

test("B42 子代理覆盖解析与状态 ID", () => {
  assert.deepEqual(parsePluginSubagentModelSelectionOverrides(null), {});
  assert.deepEqual(parsePluginSubagentModelSelectionOverrides([1]), {});
  const parsed = parsePluginSubagentModelSelectionOverrides({
    "plugin:demo@market": { providerId: "p", modelId: "m" },
    "not-plugin": { providerId: "p", modelId: "m" },
    "plugin:bad@market": { providerId: "", modelId: "" },
  });
  assert.deepEqual(Object.keys(parsed), ["plugin:demo@market"]);
  assert.equal(
    createAgentStateId({ name: " Explore ", scope: "built-in", source: "built-in" }),
    "built-in:built-in:explore",
  );
  assert.equal(createPluginAgentStateId("demo@mkt", "Reviewer"), "plugin:demo@mkt:reviewer");
});

test("B28 供应商未就绪常量（model-selection-types）", () => {
  assert.equal(KNORVIA_AGENT_PROVIDER_NOT_READY_CODE, "KNORVIA_AGENT_PROVIDER_NOT_READY");
  assert.equal(KNORVIA_AGENT_PROVIDER_NOT_READY_REASON, "provider_not_ready");
});
