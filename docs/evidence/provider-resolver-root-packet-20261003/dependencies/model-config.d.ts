import type { ConfigOverlay, ConfigValidationIssue } from "../config-overlay.js";

import type { z } from "zod";

import type { completeEnumOptionSpecDataSchema, completeLimitOptionSpecDataSchema, completeModelInputFormatDataSchema, completeModelOutputFormatDataSchema, completeModelPropertiesDataSchema, completeModelOptionSpecsDataSchema, completeModelConfigDataSchema, enumOptionSpecDataSchema, limitOptionSpecDataSchema, modelInputFormatDataSchema, modelOutputFormatDataSchema, modelPropertiesDataSchema, modelOptionSpecsDataSchema, modelConfigDataSchema, } from "@knorvia/shared/model-config";

import type { providerModelConfigRuleSchema, manualProviderModelConfigRuleSchema, personalModelConfigRulesSchema, builtinModelConfigRulesSchema, ProviderModelConfigRuleData, ManualProviderModelConfigRuleData, TemplateModelConfigRuleData, ModelMatchConfigRuleData, ModelApiMatchConfigRuleData, ProviderSiteMatchConfigRuleData, BuiltinModelConfigRulesData, PersonalModelConfigRulesData, } from "./rule-data-schema.js";

export type EnumOptionSpec = Readonly<z.infer<typeof completeEnumOptionSpecDataSchema>>;

export type LimitOptionSpec = Readonly<z.infer<typeof completeLimitOptionSpecDataSchema>>;

export type EnumOptionSpecConfigInput = Readonly<z.infer<typeof enumOptionSpecDataSchema>>;

export declare class EnumOptionSpecConfig extends ConfigOverlay<EnumOptionSpecConfig> {
  readonly values?: EnumOptionSpecConfigInput["values"];
  readonly map?: EnumOptionSpecConfigInput["map"];
  constructor(input?: EnumOptionSpecConfigInput);
}

export type LimitOptionSpecConfigInput = Readonly<z.infer<typeof limitOptionSpecDataSchema>>;

export declare class LimitOptionSpecConfig extends ConfigOverlay<LimitOptionSpecConfig> {
  readonly max?: LimitOptionSpecConfigInput["max"];
  readonly map?: LimitOptionSpecConfigInput["map"];
  constructor(input?: LimitOptionSpecConfigInput);
}

export type ModelPropertiesConfigInput = Readonly<z.infer<typeof modelPropertiesDataSchema>>;

export type ModelInputFormatConfigInput = Readonly<z.infer<typeof modelInputFormatDataSchema>>;

export declare class ModelInputFormatConfig extends ConfigOverlay<ModelInputFormatConfig> {
  readonly supportsText?: ModelInputFormatConfigInput["supportsText"];
  readonly supportsImage?: ModelInputFormatConfigInput["supportsImage"];
  readonly supportsVideo?: ModelInputFormatConfigInput["supportsVideo"];
  readonly supportsAudio?: ModelInputFormatConfigInput["supportsAudio"];
  readonly supportsPdf?: ModelInputFormatConfigInput["supportsPdf"];
  constructor(input?: ModelInputFormatConfigInput);
}

export type ModelOutputFormatConfigInput = Readonly<z.infer<typeof modelOutputFormatDataSchema>>;

export declare class ModelOutputFormatConfig extends ConfigOverlay<ModelOutputFormatConfig> {
  readonly supportsText?: ModelOutputFormatConfigInput["supportsText"];
  constructor(input?: ModelOutputFormatConfigInput);
}

export declare class ModelPropertiesConfig extends ConfigOverlay<ModelPropertiesConfig> {
  readonly requiresMfjsToolSchema?: ModelPropertiesConfigInput["requiresMfjsToolSchema"];
  readonly contextWindow?: ModelPropertiesConfigInput["contextWindow"];
  readonly inputFormat?: ModelInputFormatConfig | null;
  readonly outputFormat?: ModelOutputFormatConfig | null;
  readonly supportsToolCall?: ModelPropertiesConfigInput["supportsToolCall"];
  readonly supportsJsonSchemaOutput?: ModelPropertiesConfigInput["supportsJsonSchemaOutput"];
  readonly supportsNativeWebSearch?: ModelPropertiesConfigInput["supportsNativeWebSearch"];
  readonly supportsMidConversationSystem?: ModelPropertiesConfigInput["supportsMidConversationSystem"];
  constructor(input?: ModelPropertiesConfigInput);
}

export type ModelOptionSpecsConfigInput = Readonly<z.infer<typeof modelOptionSpecsDataSchema>>;

export declare class ModelOptionSpecsConfig extends ConfigOverlay<ModelOptionSpecsConfig> {
  readonly reasoningLevel?: EnumOptionSpecConfig | null;
  readonly maxOutputTokens?: LimitOptionSpecConfig | null;
  constructor(input?: ModelOptionSpecsConfigInput);
}

export type ModelConfigInput = Omit<ModelConfigObject, "properties" | "optionSpecs"> & {
    readonly properties?: ModelPropertiesConfig | null;
    readonly optionSpecs?: ModelOptionSpecsConfig | null;
};

export type ModelConfigObject = Readonly<z.infer<typeof modelConfigDataSchema>>;

export declare class ModelConfig extends ConfigOverlay<ModelConfig> {
  readonly enabled?: ModelConfigObject["enabled"];
  readonly properties?: ModelPropertiesConfig | null;
  readonly optionSpecs?: ModelOptionSpecsConfig | null;
  constructor(input?: ModelConfigInput);
  validateComplete(path?: readonly string[]): readonly ConfigValidationIssue[];
}

type RuleWithConfig<T> = Readonly<Omit<T, "config"> & {
    config: ModelConfig;
}>;

export type ProviderModelConfigRule = RuleWithConfig<ProviderModelConfigRuleData>;

export type ManualProviderModelConfigRule = RuleWithConfig<ManualProviderModelConfigRuleData>;

export type TemplateModelConfigRule = RuleWithConfig<TemplateModelConfigRuleData>;

export type ModelMatchConfigRule = RuleWithConfig<ModelMatchConfigRuleData>;

export type ModelApiMatchConfigRule = RuleWithConfig<ModelApiMatchConfigRuleData>;

export type ProviderSiteMatchConfigRule = RuleWithConfig<ProviderSiteMatchConfigRuleData>;

export type ModelConfigRule = (ProviderModelConfigRule & {
    readonly type: "provider-model";
}) | (ManualProviderModelConfigRule & {
    readonly type: "manual-provider-model";
}) | (TemplateModelConfigRule & {
    readonly type: "template-model";
}) | (ModelMatchConfigRule & {
    readonly type: "model";
}) | (ModelApiMatchConfigRule & {
    readonly type: "model-api";
}) | (ProviderSiteMatchConfigRule & {
    readonly type: "provider-site";
});

type ExactModelConfigRule = Extract<ModelConfigRule, {
    type: "provider-model" | "manual-provider-model";
}>;

export interface ModelConfigRuleResolutionInput {
    readonly providerId: string;
    readonly templateId?: string | null;
    readonly modelId: string;
    readonly apiType?: string | null;
    readonly baseUrl?: string | null;
}

export declare class ModelConfigRules {
  constructor(rules?: readonly ModelConfigRule[]);
  static composeEffective(builtin: ModelConfigRules, personal: ModelConfigRules): ModelConfigRules;
  resolve(input: ModelConfigRuleResolutionInput): ModelConfig;
}
