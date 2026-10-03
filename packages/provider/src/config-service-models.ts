import { ModelConfig, ProviderConfig, type ModelId, type ProviderId } from "./config/index.js";
import { resolveOwnedOrder } from "./owned-order.js";
import type {
  ProviderConfigLayerSnapshot,
  ProviderConfigLayerUpdate,
  ProviderModelMembership,
} from "./config-service.js";

export function assertMembership(
  membership: ProviderModelMembership | undefined,
  providerId: ProviderId,
  current: ProviderConfigLayerSnapshot,
): void {
  if (!membership) return;
  membership.assertCurrent();
  if (membership.providerId !== providerId || membership.personalRevision !== current.revision) {
    throw new Error("Provider Settings membership revision conflict");
  }
}

export function providerBaseline(
  providerId: ProviderId,
  builtin: ProviderConfigLayerSnapshot,
  current: ProviderConfigLayerSnapshot,
): ProviderConfig | undefined {
  const exact = builtin.providers.get(providerId);
  if (exact) return exact;
  return currentTemplateConfig(providerId, builtin, current);
}

function currentTemplateConfig(
  providerId: ProviderId,
  builtin: ProviderConfigLayerSnapshot,
  current: ProviderConfigLayerSnapshot,
): ProviderConfig | undefined {
  const templateId = current.providers.getRule(providerId)?.templateId;
  return templateId ? builtin.providerTemplates?.get(templateId)?.config : undefined;
}

function inheritedModels(
  providerId: ProviderId,
  builtin: ProviderConfigLayerSnapshot,
  current: ProviderConfigLayerSnapshot,
  membership: ProviderModelMembership | undefined,
): readonly ModelId[] {
  return (
    membership?.inheritedModelIds ??
    builtin.providers.get(providerId)?.builtinModelIds ??
    currentTemplateConfig(providerId, builtin, current)?.builtinModelIds ??
    []
  );
}

function writableProvider(
  providerId: ProviderId,
  builtin: ProviderConfigLayerSnapshot,
  current: ProviderConfigLayerSnapshot,
): ProviderConfig {
  const personal = current.providers.get(providerId);
  if (personal) return personal;
  if (builtin.providers.has(providerId)) return new ProviderConfig({});
  throw new Error(`Provider 不存在: ${providerId}`);
}

export function modelOrder(
  inherited: readonly ModelId[],
  personal: readonly ModelId[],
  requested: readonly ModelId[],
): ModelId[] {
  return [...resolveOwnedOrder(inherited, personal, requested)];
}

function structurallyEmpty(value: unknown): boolean {
  if (value === undefined) return true;
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.length === 0;
  return Object.values(value).every(structurallyEmpty);
}

function renameMembership(
  provider: ProviderConfig,
  inherited: readonly ModelId[],
  originalId: ModelId,
  nextId: ModelId,
): ProviderConfig {
  const personal = (provider.personalModelIds ?? []).map((id) => (id === originalId ? nextId : id));
  const requested = (provider.modelOrder ?? []).map((id) => (id === originalId ? nextId : id));
  return provider
    .withPersonalModelIds(personal)
    .withModelOrder(modelOrder(inherited, personal, requested));
}

export function reorderModelsUpdate(
  current: ProviderConfigLayerSnapshot,
  builtin: ProviderConfigLayerSnapshot,
  providerId: ProviderId,
  modelIds: readonly ModelId[],
  membership?: ProviderModelMembership,
): ProviderConfigLayerUpdate {
  assertMembership(membership, providerId, current);
  const baseline = providerBaseline(providerId, builtin, current);
  const provider = writableProvider(providerId, builtin, current);
  const inherited = membership?.inheritedModelIds ?? baseline?.builtinModelIds ?? [];
  return {
    providers: current.providers.set(
      providerId,
      provider.withModelOrder(modelOrder(inherited, provider.personalModelIds ?? [], modelIds)),
    ),
    models: current.models,
    providerOrder: current.providerOrder,
  };
}

export function addModelUpdate(
  current: ProviderConfigLayerSnapshot,
  builtin: ProviderConfigLayerSnapshot,
  providerId: ProviderId,
  modelId: ModelId,
  config: ModelConfig,
  membership?: ProviderModelMembership,
  useRecommendedConfig?: boolean,
): ProviderConfigLayerUpdate {
  assertMembership(membership, providerId, current);
  const provider = writableProvider(providerId, builtin, current);
  const inherited = inheritedModels(providerId, builtin, current, membership);
  const personal = provider.personalModelIds ?? [];
  if (inherited.includes(modelId)) {
    throw new Error(`Model 已存在: ${providerId}/${modelId}`);
  }
  if (personal.includes(modelId)) {
    throw new Error(`Model 已存在: ${providerId}/${modelId}`);
  }
  const nextPersonal = [...personal, modelId];
  const nextProvider = provider
    .withPersonalModelIds(nextPersonal)
    .withModelOrder(modelOrder(inherited, nextPersonal, provider.modelOrder ?? []));
  return {
    providers: current.providers.set(providerId, nextProvider),
    models: current.models.setExact(
      providerId,
      modelId,
      config.overlay(new ModelConfig({ enabled: true })),
      useRecommendedConfig,
    ),
    providerOrder: current.providerOrder,
  };
}

export function renameModelUpdate(
  current: ProviderConfigLayerSnapshot,
  builtin: ProviderConfigLayerSnapshot,
  providerId: ProviderId,
  currentModelId: ModelId,
  nextModelId: ModelId,
  membership?: ProviderModelMembership,
): ProviderConfigLayerUpdate {
  assertMembership(membership, providerId, current);
  const inherited = inheritedModels(providerId, builtin, current, membership);
  const provider = current.providers.get(providerId);
  const personal = provider?.personalModelIds ?? [];
  if (inherited.includes(currentModelId)) {
    throw new Error(`Built-in Model 不能重命名: ${providerId}/${currentModelId}`);
  }
  if (!provider || !personal.includes(currentModelId)) {
    throw new Error(`Personal Model 不存在: ${providerId}/${currentModelId}`);
  }
  if (personal.includes(nextModelId)) {
    throw new Error(`Model 已存在: ${providerId}/${nextModelId}`);
  }
  if (inherited.includes(nextModelId)) {
    throw new Error(`Model 已存在: ${providerId}/${nextModelId}`);
  }
  return {
    providers: current.providers.set(
      providerId,
      renameMembership(provider, inherited, currentModelId, nextModelId),
    ),
    models: current.models.renameExactModel(providerId, currentModelId, nextModelId),
    providerOrder: current.providerOrder,
  };
}

export function setModelEnabledUpdate(
  current: ProviderConfigLayerSnapshot,
  builtin: ProviderConfigLayerSnapshot,
  providerId: ProviderId,
  modelId: ModelId,
  enabled: boolean,
  membership?: ProviderModelMembership,
): ProviderConfigLayerUpdate {
  assertMembership(membership, providerId, current);
  const inherited = inheritedModels(providerId, builtin, current, membership);
  const personal = current.providers.get(providerId)?.personalModelIds ?? [];
  if (!inherited.includes(modelId) && !personal.includes(modelId)) {
    throw new Error(`Model 不存在: ${providerId}/${modelId}`);
  }
  const config = current.models.getExact(providerId, modelId) ?? new ModelConfig({});
  return {
    providers: current.providers,
    models: current.models.setExact(
      providerId,
      modelId,
      config.overlay(new ModelConfig({ enabled })),
    ),
    providerOrder: current.providerOrder,
  };
}

export function saveModelDraftUpdate(
  current: ProviderConfigLayerSnapshot,
  builtin: ProviderConfigLayerSnapshot,
  providerId: ProviderId,
  originalModelId: ModelId,
  nextModelId: ModelId,
  config: ModelConfig,
  expectedPersonalRevision: string,
  useRecommendedConfig?: boolean,
  membership?: ProviderModelMembership,
): ProviderConfigLayerUpdate {
  assertMembership(membership, providerId, current);
  if (current.revision !== expectedPersonalRevision) {
    throw new Error(
      `Personal Provider Config revision conflict: expected ${expectedPersonalRevision}, current ${current.revision}`,
    );
  }
  const recommended =
    useRecommendedConfig ??
    current.models.getExactRule(providerId, originalModelId)?.type !== "manual-provider-model";
  const inherited = inheritedModels(providerId, builtin, current, membership);
  const provider = current.providers.get(providerId);
  const personal = provider?.personalModelIds ?? [];
  const renaming = originalModelId !== nextModelId;
  if (renaming && inherited.includes(originalModelId)) {
    throw new Error(`Built-in Model 不能重命名: ${providerId}/${originalModelId}`);
  }
  if (renaming && inherited.includes(nextModelId)) {
    throw new Error(`Model 已存在: ${providerId}/${nextModelId}`);
  }
  if (!inherited.includes(originalModelId) && !personal.includes(originalModelId)) {
    throw new Error(`Model 不存在: ${providerId}/${originalModelId}`);
  }
  if (renaming && (personal.includes(nextModelId) || inherited.includes(nextModelId))) {
    throw new Error(`Model 已存在: ${providerId}/${nextModelId}`);
  }
  let providers = current.providers;
  let models = current.models;
  if (renaming) {
    if (!provider || !personal.includes(originalModelId)) {
      throw new Error(`Personal Model 不存在: ${providerId}/${originalModelId}`);
    }
    providers = providers.set(
      providerId,
      renameMembership(provider, inherited, originalModelId, nextModelId),
    );
    models = models.renameExactModel(providerId, originalModelId, nextModelId);
  }
  models =
    recommended && structurallyEmpty(config.toJSON())
      ? models.deleteExact(providerId, nextModelId)
      : models.setExact(providerId, nextModelId, config, recommended);
  return {
    providers,
    models,
    providerOrder: current.providerOrder,
  };
}

export function deleteModelUpdate(
  current: ProviderConfigLayerSnapshot,
  builtin: ProviderConfigLayerSnapshot,
  providerId: ProviderId,
  modelId: ModelId,
  membership?: ProviderModelMembership,
): ProviderConfigLayerUpdate {
  assertMembership(membership, providerId, current);
  const inherited = inheritedModels(providerId, builtin, current, membership);
  if (inherited.includes(modelId)) {
    throw new Error(`Built-in Model 不能删除: ${providerId}/${modelId}`);
  }
  const provider = current.providers.get(providerId);
  const personal = provider?.personalModelIds ?? [];
  if (!provider || !personal.includes(modelId)) {
    throw new Error(`Personal Model 不存在: ${providerId}/${modelId}`);
  }
  const remaining = personal.filter((id) => id !== modelId);
  const nextProvider = provider
    .withPersonalModelIds(remaining)
    .withModelOrder(modelOrder(inherited, remaining, provider.modelOrder ?? []));
  return {
    providers: current.providers.set(providerId, nextProvider),
    models: current.models.deleteExact(providerId, modelId),
    providerOrder: current.providerOrder,
  };
}
