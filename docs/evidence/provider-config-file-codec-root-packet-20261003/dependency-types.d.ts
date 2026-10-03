import type { ProviderConfigMap, ModelConfigRules, ProviderTemplateMap, ProviderId, ManualModelConfig } from "@knorvia/provider";

import type { ModelSelection } from "@knorvia/shared/model-selection";

export interface ProviderConfigLayerUpdate {
    readonly providers: ProviderConfigMap;
    readonly providerTemplates?: ProviderTemplateMap;
    readonly models: ModelConfigRules;
    readonly providerOrder?: readonly ProviderId[];
    readonly defaultModelSelection?: ModelSelection;
}

export declare function parsePersonalProviderConfigMap(input: unknown): ProviderConfigMap;

export declare function parsePersonalModelConfigRules(input: unknown): ModelConfigRules;

export declare function extractManualModelConfig(input: unknown): ManualModelConfig;
