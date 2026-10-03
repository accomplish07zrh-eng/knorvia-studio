import type { Event } from "@knorvia/rpc";
import { ServiceChannels, type ModelConnectivityResult } from "@knorvia/shared";
import {
  type ModelConfigObject,
  type ModelId,
  type ModelSelection,
  type ModelSelectionFacade,
  type ModelSelectionView,
  type ModelSelectionViewInput,
  type ProviderConfigObject,
  type ProviderId,
  type ProviderSettingsFacade,
  type ProviderSettingsCreationResult,
  type ModelConfigResolution,
  type ProviderSettingsView,
  type ResolveModelConfigInput,
  type SavePersonalModelDraftInput,
} from "@knorvia/provider";
import { createServiceDescriptor } from "../descriptors.js";
import { createServiceLogger } from "../logger/serviceLogger.js";

export type {
  ProviderSettingsProviderView,
  ModelSelectionView,
  ModelSelectionViewInput,
  ProviderSettingsView,
} from "@knorvia/provider";

export interface IProviderSettingsService {
  readonly onDidChange: Event<ProviderSettingsView>;
  getView(): Promise<ProviderSettingsView>;
  refresh(reason: string): Promise<ProviderSettingsView>;
  createPersonalProvider(
    input?: Parameters<ProviderSettingsFacade["createPersonalProvider"]>[0],
  ): Promise<ProviderSettingsCreationResult>;
  resolveModelConfig(input: ResolveModelConfigInput): Promise<ModelConfigResolution>;
  savePersonalProviderOverlay(
    providerId: ProviderId,
    config: ProviderConfigObject,
    metadata?: Parameters<ProviderSettingsFacade["savePersonalProviderOverlay"]>[2],
  ): Promise<ProviderSettingsView>;
  deletePersonalProvider(providerId: ProviderId): Promise<ProviderSettingsView>;
  reorderPersonalProviders(providerIds: readonly ProviderId[]): Promise<ProviderSettingsView>;
  reorderPersonalModels(
    providerId: ProviderId,
    modelIds: readonly ModelId[],
  ): Promise<ProviderSettingsView>;
  addPersonalModel(
    providerId: ProviderId,
    modelId: ModelId,
    config: ModelConfigObject,
    useRecommendedConfig?: boolean,
  ): Promise<ProviderSettingsView>;
  renamePersonalModel(
    providerId: ProviderId,
    currentModelId: ModelId,
    nextModelId: ModelId,
  ): Promise<ProviderSettingsView>;
  deletePersonalModel(providerId: ProviderId, modelId: ModelId): Promise<ProviderSettingsView>;
  savePersonalModelDraft(input: SavePersonalModelDraftInput): Promise<ProviderSettingsView>;
  setPersonalModelEnabled(
    providerId: ProviderId,
    modelId: ModelId,
    enabled: boolean,
  ): Promise<ProviderSettingsView>;
  /** 测试已经保存并进入目标 Environment Registry 的正式 Model。 */
  testModelConnectivity(
    input: ProviderSettingsConnectivityRequest,
  ): Promise<ModelConnectivityResult>;
}

export const IProviderSettingsService = createServiceDescriptor<IProviderSettingsService>(
  ServiceChannels.ProviderSettings,
);

export interface ProviderSettingsConnectivityTestInput {
  readonly workspacePath: string;
  readonly workspaceIdentity?: string;
  readonly providerId: ProviderId;
  readonly modelId: ModelId;
}

export interface ProviderSettingsConnectivityRequest {
  readonly workspacePath: string;
  readonly workspaceIdentity?: string;
  readonly providerId: ProviderId;
  readonly modelId: ModelId;
}

export type ProviderSettingsConnectivityTester = (
  input: ProviderSettingsConnectivityTestInput,
) => Promise<ModelConnectivityResult>;

export interface IModelSelectionService {
  readonly onDidChange: Event<ModelSelectionView>;
  getView(input?: ModelSelectionViewInput): Promise<ModelSelectionView>;
}

export const IModelSelectionService = createServiceDescriptor<IModelSelectionService>(
  ServiceChannels.ModelSelection,
);

export interface ModelSelectionConfiguredDefaultSource {
  read(): Promise<ModelSelection | undefined>;
  onDidChange?(listener: () => void): () => void;
}

function adaptEvent<T>(subscribe: (listener: (value: T) => void) => () => void): Event<T> {
  return (listener) => {
    const dispose = subscribe(listener);
    return { dispose };
  };
}

export function createProviderSettingsService(
  facade: ProviderSettingsFacade,
  ensureReady: () => Promise<void> = async () => {},
  testConnectivity?: ProviderSettingsConnectivityTester,
): IProviderSettingsService {
  return {
    onDidChange: adaptEvent((listener) => facade.onDidChange(listener)),
    async getView() {
      await ensureReady();
      return facade.getView();
    },
    async refresh(reason) {
      await ensureReady();
      return facade.refresh(reason);
    },
    async createPersonalProvider(input) {
      await ensureReady();
      return facade.createPersonalProvider(input);
    },
    async resolveModelConfig(input) {
      await ensureReady();
      return facade.resolveModelConfig(input);
    },
    async savePersonalProviderOverlay(providerId, config, metadata) {
      await ensureReady();
      return facade.savePersonalProviderOverlay(providerId, config, metadata);
    },
    async deletePersonalProvider(providerId) {
      await ensureReady();
      return facade.deletePersonalProvider(providerId);
    },
    async reorderPersonalProviders(providerIds) {
      await ensureReady();
      return facade.reorderPersonalProviders(providerIds);
    },
    async reorderPersonalModels(providerId, modelIds) {
      await ensureReady();
      return facade.reorderPersonalModels(providerId, modelIds);
    },
    async addPersonalModel(providerId, modelId, config, useRecommendedConfig) {
      await ensureReady();
      return facade.addPersonalModel(providerId, modelId, config, useRecommendedConfig);
    },
    async renamePersonalModel(providerId, currentModelId, nextModelId) {
      await ensureReady();
      return facade.renamePersonalModel(providerId, currentModelId, nextModelId);
    },
    async deletePersonalModel(providerId, modelId) {
      await ensureReady();
      return facade.deletePersonalModel(providerId, modelId);
    },
    async savePersonalModelDraft(input) {
      await ensureReady();
      return facade.savePersonalModelDraft(input);
    },
    async setPersonalModelEnabled(providerId, modelId, enabled) {
      await ensureReady();
      return facade.setPersonalModelEnabled(providerId, modelId, enabled);
    },
    async testModelConnectivity(input) {
      await ensureReady();
      if (!testConnectivity) {
        throw new Error("当前 Environment 未装配模型连通性测试能力");
      }
      await facade.waitForProviderOperations(input.providerId);
      const provider = facade
        .getView()
        .providers.find((entry) => entry.providerId === input.providerId);
      const model = provider?.models.find((entry) => entry.modelId === input.modelId);
      let unavailable: "provider-unavailable" | "model-unavailable" | undefined;
      if (!provider || !provider.enabled) {
        unavailable = "provider-unavailable";
      } else if (!model || !model.enabled || model.issues.length > 0) {
        unavailable = "model-unavailable";
      } else if (!provider.executable) {
        unavailable = "provider-unavailable";
      } else if (!model.executable) {
        unavailable = "model-unavailable";
      }
      if (unavailable) {
        return {
          success: false,
          error: {
            code: unavailable,
            message:
              unavailable === "provider-unavailable"
                ? "This provider is currently unavailable for connectivity testing."
                : "This model is currently unavailable for connectivity testing.",
          },
        };
      }
      return testConnectivity({
        workspacePath: input.workspacePath,
        ...(input.workspaceIdentity ? { workspaceIdentity: input.workspaceIdentity } : {}),
        providerId: input.providerId,
        modelId: input.modelId,
      });
    },
  };
}

export function createModelSelectionService(
  facade: ModelSelectionFacade,
  ensureReady: () => Promise<void> = async () => {},
  configuredDefaultSource?: ModelSelectionConfiguredDefaultSource,
): IModelSelectionService & { dispose(): void } {
  const log = createServiceLogger("model-selection");
  const listeners = new Set<(view: ModelSelectionView) => void>();
  let revision = 0;
  let disposed = false;
  const getView = async (input?: ModelSelectionViewInput): Promise<ModelSelectionView> => {
    await ensureReady();
    if (disposed) throw new Error("ModelSelectionService 已 dispose");
    const configuredDefault = await configuredDefaultSource?.read();
    if (disposed) throw new Error("ModelSelectionService 已 dispose");
    const base = facade.getView(configuredDefault);
    if (revision < base.revision) revision = base.revision;
    return facade.getView(configuredDefault, revision, input);
  };
  const emit = () => {
    if (disposed) return;
    revision += 1;
    void getView().then(
      (view) => {
        if (disposed) return;
        for (const listener of listeners) listener(view);
      },
      (error: unknown) => {
        if (disposed) return;
        log.warn(undefined, `ModelSelection View 刷新失败: ${String(error)}`);
      },
    );
  };
  const disposeFacade = facade.onDidChange(emit);
  const disposeDefaults = configuredDefaultSource?.onDidChange?.(emit);
  return {
    getView,
    onDidChange(listener) {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeFacade();
      disposeDefaults?.();
      listeners.clear();
    },
  };
}
