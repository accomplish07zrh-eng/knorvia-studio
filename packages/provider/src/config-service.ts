import {
  ProviderTemplateMap,
  type ModelConfig,
  type ModelConfigRules,
  type ModelId,
  type ProviderConfig,
  type ProviderConfigMap,
  type ProviderConfigRule,
  type ProviderId,
  type ProviderTemplateId,
  type ProviderTemplateLocale,
} from "./config/index.js";
import type { ModelSelection } from "@knorvia/shared/model-selection";
import type { ProviderConfigSnapshot, ProviderSource } from "./sources.js";
import {
  createProviderUpdate,
  deleteProviderUpdate,
  prepareProviderCreation,
  reorderProvidersUpdate,
  saveProviderOverlay,
} from "./config-service-providers.js";
import {
  addModelUpdate,
  deleteModelUpdate,
  renameModelUpdate,
  reorderModelsUpdate,
  saveModelDraftUpdate,
  setModelEnabledUpdate,
} from "./config-service-models.js";

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
  update(
    transform: (current: ProviderConfigLayerSnapshot) => ProviderConfigLayerUpdate,
  ): Promise<ProviderConfigLayerSnapshot>;
}

export interface ProviderConfigServiceDependencies {
  readonly knorviaBuiltinSource: ProviderSource<ProviderConfigLayerSnapshot>;
  readonly personalRepository: PersonalProviderConfigRepository;
}

export interface PersonalProviderCreation {
  readonly providerId: ProviderId;
}

export interface CreatePersonalProviderInput {
  readonly templateId?: ProviderTemplateId;
  readonly providerName?: string;
  readonly locale?: ProviderTemplateLocale;
  readonly initialConfig?: ProviderConfig;
}

export interface ProviderModelMembership {
  readonly providerId: ProviderId;
  readonly inheritedModelIds: readonly ModelId[];
  readonly personalRevision: string;
  readonly assertCurrent: () => void;
}

function requireId(value: string, label: "providerId" | "modelId"): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} 不能为空`);
  return trimmed;
}

export class ProviderConfigService implements ProviderSource<ProviderConfigSnapshot> {
  readonly #knorviaBuiltinSource: ProviderSource<ProviderConfigLayerSnapshot>;
  readonly #personalRepository: PersonalProviderConfigRepository;
  readonly #listeners = new Set<(reason: string) => void>();
  readonly #subscriptionDisposers: Array<() => void> = [];
  #disposed = false;

  constructor(dependencies: ProviderConfigServiceDependencies) {
    this.#knorviaBuiltinSource = dependencies.knorviaBuiltinSource;
    this.#personalRepository = dependencies.personalRepository;
    this.#subscriptionDisposers.push(
      this.#knorviaBuiltinSource.onDidChange((reason) =>
        this.#emitChange(`knorviaBuiltin:${reason}`),
      ),
    );
    this.#subscriptionDisposers.push(
      this.#personalRepository.onDidChange((reason) => this.#emitChange(`personal:${reason}`)),
    );
  }

  async read(): Promise<ProviderConfigSnapshot> {
    this.#assertActive();
    const [builtin, personal] = await Promise.all([
      this.#knorviaBuiltinSource.read(),
      this.#personalRepository.read(),
    ]);
    return Object.freeze({
      revision: JSON.stringify([builtin.revision, personal.revision]),
      knorviaBuiltinRevision: builtin.revision,
      personalRevision: personal.revision,
      knorviaBuiltinProviders: builtin.providers,
      knorviaBuiltinProviderTemplates: builtin.providerTemplates ?? ProviderTemplateMap.empty(),
      personalProviders: personal.providers,
      knorviaBuiltinModelRules: builtin.models,
      personalModels: personal.models,
      personalProviderOrder: personal.providerOrder ?? [],
    });
  }

  onDidChange(listener: (reason: string) => void): () => void {
    this.#assertActive();
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  replacePersonalConfig(config: ProviderConfigLayerUpdate): Promise<ProviderConfigLayerSnapshot> {
    this.#assertActive();
    return this.#personalRepository.update(() => config);
  }

  async savePersonalProviderOverlay(
    providerId: ProviderId,
    config: ProviderConfig,
    membership?: ProviderModelMembership,
    metadata?: Pick<ProviderConfigRule, "providerName" | "templateId" | "enabled">,
  ): Promise<ProviderConfigLayerSnapshot> {
    requireId(providerId, "providerId");
    const builtin = await this.#knorviaBuiltinSource.read();
    return this.#update((current) =>
      saveProviderOverlay(current, builtin, providerId, config, membership, metadata),
    );
  }

  async createPersonalProvider(
    input: CreatePersonalProviderInput = {},
  ): Promise<PersonalProviderCreation> {
    const builtin = await this.#knorviaBuiltinSource.read();
    const creation = prepareProviderCreation(builtin, input);
    let createdId: ProviderId | undefined;
    await this.#update((current) =>
      createProviderUpdate(current, builtin, input, creation, (providerId) => {
        createdId = providerId;
      }),
    );
    if (!createdId) throw new Error("Personal Provider 创建失败");
    return Object.freeze({ providerId: createdId });
  }

  deletePersonalProvider(providerId: ProviderId): Promise<ProviderConfigLayerSnapshot> {
    requireId(providerId, "providerId");
    return this.#update((current) => deleteProviderUpdate(current, providerId));
  }

  async reorderPersonalProviders(
    providerIds: readonly ProviderId[],
  ): Promise<ProviderConfigLayerSnapshot> {
    await this.#knorviaBuiltinSource.read();
    return this.#update((current) => reorderProvidersUpdate(current, providerIds));
  }

  async reorderPersonalModels(
    providerId: ProviderId,
    modelIds: readonly ModelId[],
    membership?: ProviderModelMembership,
  ): Promise<ProviderConfigLayerSnapshot> {
    requireId(providerId, "providerId");
    const builtin = await this.#knorviaBuiltinSource.read();
    return this.#update((current) =>
      reorderModelsUpdate(current, builtin, providerId, modelIds, membership),
    );
  }

  async addPersonalModel(
    providerId: ProviderId,
    modelId: ModelId,
    config: ModelConfig,
    membership?: ProviderModelMembership,
    useRecommendedConfig?: boolean,
  ): Promise<ProviderConfigLayerSnapshot> {
    providerId = requireId(providerId, "providerId");
    modelId = requireId(modelId, "modelId");
    const builtin = await this.#knorviaBuiltinSource.read();
    return this.#update((current) =>
      addModelUpdate(
        current,
        builtin,
        providerId,
        modelId,
        config,
        membership,
        useRecommendedConfig,
      ),
    );
  }

  async renamePersonalModel(
    providerId: ProviderId,
    currentModelId: ModelId,
    nextModelId: ModelId,
    membership?: ProviderModelMembership,
  ): Promise<ProviderConfigLayerSnapshot> {
    providerId = requireId(providerId, "providerId");
    currentModelId = requireId(currentModelId, "modelId");
    nextModelId = requireId(nextModelId, "modelId");
    if (currentModelId === nextModelId) return this.#personalRepository.read();
    const builtin = await this.#knorviaBuiltinSource.read();
    return this.#update((current) =>
      renameModelUpdate(current, builtin, providerId, currentModelId, nextModelId, membership),
    );
  }

  async setPersonalModelEnabled(
    providerId: ProviderId,
    modelId: ModelId,
    enabled: boolean,
    membership?: ProviderModelMembership,
  ): Promise<ProviderConfigLayerSnapshot> {
    providerId = requireId(providerId, "providerId");
    modelId = requireId(modelId, "modelId");
    if (typeof enabled !== "boolean") {
      throw new Error("Model enabled 必须是 boolean");
    }
    const builtin = await this.#knorviaBuiltinSource.read();
    return this.#update((current) =>
      setModelEnabledUpdate(current, builtin, providerId, modelId, enabled, membership),
    );
  }

  async savePersonalModelDraft(
    providerId: ProviderId,
    originalModelId: ModelId,
    nextModelId: ModelId,
    config: ModelConfig,
    expectedPersonalRevision: string,
    useRecommendedConfig?: boolean,
    membership?: ProviderModelMembership,
  ): Promise<ProviderConfigLayerSnapshot> {
    providerId = requireId(providerId, "providerId");
    originalModelId = requireId(originalModelId, "modelId");
    nextModelId = requireId(nextModelId, "modelId");
    const builtin = await this.#knorviaBuiltinSource.read();
    return this.#update((current) =>
      saveModelDraftUpdate(
        current,
        builtin,
        providerId,
        originalModelId,
        nextModelId,
        config,
        expectedPersonalRevision,
        useRecommendedConfig,
        membership,
      ),
    );
  }

  async deletePersonalModel(
    providerId: ProviderId,
    modelId: ModelId,
    membership?: ProviderModelMembership,
  ): Promise<ProviderConfigLayerSnapshot> {
    providerId = requireId(providerId, "providerId");
    modelId = requireId(modelId, "modelId");
    const builtin = await this.#knorviaBuiltinSource.read();
    return this.#update((current) =>
      deleteModelUpdate(current, builtin, providerId, modelId, membership),
    );
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const dispose of this.#subscriptionDisposers.splice(0)) dispose();
    this.#listeners.clear();
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("ProviderConfigService 已 dispose");
  }

  #emitChange(reason: string): void {
    if (this.#disposed) return;
    for (const listener of this.#listeners) listener(reason || "changed");
  }

  #update(
    transform: (current: ProviderConfigLayerSnapshot) => ProviderConfigLayerUpdate,
  ): Promise<ProviderConfigLayerSnapshot> {
    this.#assertActive();
    return this.#personalRepository.update((current) => ({
      defaultModelSelection: current.defaultModelSelection,
      ...transform(current),
    }));
  }
}
