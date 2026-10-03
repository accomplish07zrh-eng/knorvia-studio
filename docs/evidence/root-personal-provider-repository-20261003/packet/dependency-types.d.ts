import type { ProviderConfigMap, ModelConfigRules, ProviderTemplateMap, ProviderId } from "@knorvia/provider";

import type { ModelSelection } from "@knorvia/shared/model-selection";

export interface ProviderSource<TSnapshot> { read(): Promise<TSnapshot>; onDidChange(listener: (reason: string) => void): () => void; }

export interface ProviderConfigLayerSnapshot {
    readonly revision: string;
    readonly providers: ProviderConfigMap;
    readonly providerTemplates?: ProviderTemplateMap;
    readonly models: ModelConfigRules;
    readonly providerOrder?: readonly ProviderId[];
    readonly defaultModelSelection?: ModelSelection;
}

export interface ProviderConfigLayerUpdate {
    readonly providers: ProviderConfigMap;
    readonly providerTemplates?: ProviderTemplateMap;
    readonly models: ModelConfigRules;
    readonly providerOrder?: readonly ProviderId[];
    readonly defaultModelSelection?: ModelSelection;
}

export interface PersonalProviderConfigRepository extends ProviderSource<ProviderConfigLayerSnapshot> {
    update(transform: (current: ProviderConfigLayerSnapshot) => ProviderConfigLayerUpdate): Promise<ProviderConfigLayerSnapshot>;
}
