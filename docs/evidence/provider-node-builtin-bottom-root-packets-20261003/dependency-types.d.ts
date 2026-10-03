import type { ModelConfigRules, ProviderConfigMap, ProviderTemplateMap } from "@knorvia/provider";

export declare function parseKnorviaBuiltinProviderConfigRules(input: unknown): {
  providers: ProviderConfigMap;
  providerTemplates: ProviderTemplateMap;
};

export declare function parseKnorviaBuiltinModelConfigRules(input: unknown): ModelConfigRules;

export type ReleaseProviderMapPort = Pick<ProviderConfigMap, "has" | "toJSON">;

export type ReleaseTemplateMapPort = Pick<ProviderTemplateMap, "toJSON">;

export type ReleaseModelRulesPort = Pick<ModelConfigRules, "toKnorviaBuiltinJSON">;
