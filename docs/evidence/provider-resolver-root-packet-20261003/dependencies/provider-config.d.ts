import type { ConfigOverlay, ConfigValidationIssue } from "../config-overlay.js";

import type { z } from "zod";

import type { completeApiKeyAccessDataSchema, completeZhipuAccountAccessDataSchema, completeProviderApiDataSchema, completeProviderConfigDataSchema, providerApiTypeDataSchema, providerGroupDataSchema, zhipuAccountModeDataSchema, providerVisibilityDataSchema, providerLogoDataSchema, apiKeyAccessDataSchema, zhipuAccountAccessDataSchema, providerAccessDataSchema, providerApiDataSchema, providerConfigDataSchema, providerTemplateNameMapDataSchema, providerTemplateDataSchema, } from "./provider-data-schema.js";

import type { ModelId, ProviderId, ProviderTemplateId } from "./ids.js";

import type { ProviderConfigRuleData } from "./rule-data-schema.js";

export type ProviderApiType = z.infer<typeof providerApiTypeDataSchema>;

export type ProviderGroup = z.infer<typeof providerGroupDataSchema>;

export type ZhipuAccountMode = z.infer<typeof zhipuAccountModeDataSchema>;

export type ApiKeyAccessConfigInput = Omit<ApiKeyAccessConfigObject, "type"> & {
    readonly type?: ApiKeyAccessConfigObject["type"];
};

export type ApiKeyAccessConfigObject = Readonly<z.infer<typeof apiKeyAccessDataSchema>>;

export declare class ApiKeyAccessConfig extends ConfigOverlay<ApiKeyAccessConfig> {
  readonly type: ApiKeyAccessConfigObject["type"];
  readonly apiKey?: ApiKeyAccessConfigInput["apiKey"];
  readonly apiKeyManagementUrl?: ApiKeyAccessConfigInput["apiKeyManagementUrl"];
  constructor(input?: ApiKeyAccessConfigInput);
}

export type ZhipuAccountAccessConfigInput = Omit<ZhipuAccountAccessConfigObject, "type">;

export type ZhipuAccountAccessConfigObject = Readonly<z.infer<typeof zhipuAccountAccessDataSchema>>;

export declare class ZhipuAccountAccessConfig extends ConfigOverlay<ZhipuAccountAccessConfig> {
  readonly type: "zhipu-account";
  readonly accountType?: ZhipuAccountAccessConfigInput["accountType"];
  readonly mode?: ZhipuAccountAccessConfigInput["mode"];
  readonly entitled?: ZhipuAccountAccessConfigInput["entitled"];
  constructor(input?: ZhipuAccountAccessConfigInput);
}

export type ProviderAccessConfig = ApiKeyAccessConfig | ZhipuAccountAccessConfig;

export type ProviderAccessConfigObject = Readonly<z.infer<typeof providerAccessDataSchema>>;

export type ProviderVisibility = z.infer<typeof providerVisibilityDataSchema>;

export type ProviderLogoRef = Readonly<z.infer<typeof providerLogoDataSchema>>;

export type ProviderApiConfigInput = Readonly<z.infer<typeof providerApiDataSchema>>;

export declare class ProviderApiConfig extends ConfigOverlay<ProviderApiConfig> {
  readonly type?: ProviderApiConfigInput["type"];
  readonly baseUrl?: ProviderApiConfigInput["baseUrl"];
  readonly headers?: ProviderApiConfigInput["headers"];
  constructor(input?: ProviderApiConfigInput);
}

export type ProviderConfigInput = Omit<ProviderConfigObject, "access" | "api"> & {
    readonly access?: ProviderAccessConfig | null;
    readonly api?: ProviderApiConfig | null;
};

export type ProviderConfigObject = Readonly<z.infer<typeof providerConfigDataSchema>>;

export declare class ProviderConfig extends ConfigOverlay<ProviderConfig> {
  readonly group?: ProviderConfigObject["group"];
  readonly logo?: ProviderConfigObject["logo"];
  readonly access?: ProviderAccessConfig | null;
  readonly api?: ProviderApiConfig | null;
  readonly builtinModelIds?: ProviderConfigObject["builtinModelIds"];
  readonly personalModelIds?: ProviderConfigObject["personalModelIds"];
  readonly modelOrder?: ProviderConfigObject["modelOrder"];
  readonly visibility?: ProviderConfigObject["visibility"];
  constructor(input?: ProviderConfigInput);
  overlay(next: ProviderConfig): ProviderConfig;
  withoutGroup(): ProviderConfig;
  validateComplete(path?: readonly string[]): readonly ConfigValidationIssue[];
}

export type ProviderTemplateNameMap = Readonly<z.infer<typeof providerTemplateNameMapDataSchema>>;

export type ProviderTemplateLocale = keyof ProviderTemplateNameMap;

export type ProviderTemplateInput = Omit<ProviderTemplateObject, "config"> & {
    readonly config: ProviderConfig;
};

export type ProviderTemplateObject = Readonly<z.infer<typeof providerTemplateDataSchema>>;

export declare class ProviderTemplate {
  readonly templateId: ProviderTemplateId;
  readonly templateNameMap: ProviderTemplateNameMap;
  readonly config: ProviderConfig;
  constructor(input: ProviderTemplateInput);
}

export declare class ProviderTemplateMap extends ConfigOverlay<ProviderTemplateMap> {
  constructor(entries?: Iterable<readonly [ProviderTemplateId, ProviderTemplate]>);
  get(templateId: ProviderTemplateId): ProviderTemplate | undefined;
}

export type ProviderConfigRule = Readonly<Omit<ProviderConfigRuleData, "config"> & {
    config: ProviderConfig;
}>;

export declare class ProviderConfigMap extends ConfigOverlay<ProviderConfigMap> {
  constructor(entries?: Iterable<ProviderConfigRule | readonly [ProviderId, ProviderConfig]>);
  overlay(next: ProviderConfigMap): ProviderConfigMap;
  mapConfigs(transform: (
      config: ProviderConfig,
      providerId: ProviderId,
      rule: ProviderConfigRule,
    ) => ProviderConfig): ProviderConfigMap;
  get(providerId: ProviderId): ProviderConfig | undefined;
  getRule(providerId: ProviderId): ProviderConfigRule | undefined;
  has(providerId: ProviderId): boolean;
  keys(): ProviderId[];
  entries(): Array<readonly [ProviderId, ProviderConfig]>;
}
