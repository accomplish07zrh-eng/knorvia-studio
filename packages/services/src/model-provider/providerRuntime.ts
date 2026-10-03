import {
  ProviderRegistryService,
  ProviderSettingsFacade,
  createFailClosedAccountProviderConfigSnapshot,
  type AccountProviderConfigSnapshot,
  type ProviderConfigSnapshot,
  type ProviderSettingsMutationTarget,
  type ProviderSource,
} from "@knorvia/provider";
import {
  NodeModelSelectionConfigRepository,
  createNodeModelSelectionFacade,
} from "@knorvia/provider-node";
import {
  createProviderConfigRuntime,
  type ProviderConfigRuntime,
  type ProviderConfigRuntimeOptions,
} from "./providerConfigRuntime.js";
import {
  createModelSelectionService,
  createProviderSettingsService,
  type IModelSelectionService,
  type IProviderSettingsService,
  type ModelSelectionConfiguredDefaultSource,
  type ProviderSettingsConnectivityTester,
} from "./providerFacadeServices.js";

export interface ProviderRuntimeOptions extends ProviderConfigRuntimeOptions {
  readonly accountSource?: RefreshableProviderSource<AccountProviderConfigSnapshot>;
  readonly testConnectivity?: ProviderSettingsConnectivityTester;
}

export interface ProviderRuntimeDependencies {
  readonly configRuntime: ProviderConfigRuntime;
  readonly accountSource?: RefreshableProviderSource<AccountProviderConfigSnapshot>;
  readonly disposeAccountSource?: () => void;
  readonly testConnectivity?: ProviderSettingsConnectivityTester;
  readonly modelSelectionConfiguredDefaultSource?: ModelSelectionConfiguredDefaultSource;
  readonly disposeModelSelectionConfiguredDefaultSource?: () => void;
}

interface RefreshableProviderSource<TSnapshot> extends ProviderSource<TSnapshot> {
  refresh?(reason: string): Promise<TSnapshot>;
}

export class EmptyAccountProviderConfigSource implements ProviderSource<AccountProviderConfigSnapshot> {
  constructor(readonly configSource: ProviderSource<ProviderConfigSnapshot>) {}

  async read(): Promise<AccountProviderConfigSnapshot> {
    const config = await this.configSource.read();
    return createFailClosedAccountProviderConfigSnapshot(config);
  }

  onDidChange(): () => void {
    return () => {};
  }
}

export class ProviderRuntime {
  readonly configService: ProviderConfigRuntime["configService"];
  readonly registryService: ProviderRegistryService;
  readonly providerSettings: IProviderSettingsService;
  readonly modelSelection: IModelSelectionService;
  #configRuntime: ProviderConfigRuntime;
  #disposeSelection: () => void;
  #disposeAccountSource: (() => void) | undefined;
  #disposeConfiguredDefaultSource: (() => void) | undefined;
  #startPromise: Promise<void> | undefined;
  #disposed = false;

  constructor(dependencies: ProviderRuntimeDependencies) {
    const configRuntime = dependencies.configRuntime;
    const configService = configRuntime.configService;
    const accountSource: RefreshableProviderSource<AccountProviderConfigSnapshot> =
      dependencies.accountSource ?? new EmptyAccountProviderConfigSource(configService);
    const registryService = new ProviderRegistryService({
      configSource: configService,
      accountSource,
    });
    this.#configRuntime = configRuntime;
    this.#disposeAccountSource = dependencies.disposeAccountSource;
    this.#disposeConfiguredDefaultSource =
      dependencies.disposeModelSelectionConfiguredDefaultSource;
    this.configService = configService;
    this.registryService = registryService;
    const mutations: ProviderSettingsMutationTarget = {
      createPersonalProvider: (...args) => configService.createPersonalProvider(...args),
      savePersonalProviderOverlay: (providerId, config, membership, metadata) =>
        configService.savePersonalProviderOverlay(providerId, config, membership, metadata),
      deletePersonalProvider: (...args) => configService.deletePersonalProvider(...args),
      reorderPersonalProviders: (...args) => configService.reorderPersonalProviders(...args),
      reorderPersonalModels: (providerId, modelIds, membership) =>
        configService.reorderPersonalModels(providerId, modelIds, membership),
      addPersonalModel: configService.addPersonalModel.bind(configService),
      renamePersonalModel: (providerId, currentModelId, nextModelId, membership) =>
        configService.renamePersonalModel(providerId, currentModelId, nextModelId, membership),
      deletePersonalModel: (providerId, modelId, membership) =>
        configService.deletePersonalModel(providerId, modelId, membership),
      setPersonalModelEnabled: (providerId, modelId, enabled, membership) =>
        configService.setPersonalModelEnabled(providerId, modelId, enabled, membership),
      savePersonalModelDraft: (
        providerId,
        originalModelId,
        nextModelId,
        config,
        expectedPersonalRevision,
        useRecommendedConfig,
        membership,
      ) =>
        configService.savePersonalModelDraft(
          providerId,
          originalModelId,
          nextModelId,
          config,
          expectedPersonalRevision,
          useRecommendedConfig,
          membership,
        ),
      refresh: (reason) => registryService.refresh(reason),
      refreshSources: async (reason) => {
        const sources = await Promise.allSettled([
          configRuntime.refreshKnorviaBuiltin({ force: true }),
          accountSource.refresh?.(reason) ?? Promise.resolve(),
        ]);
        const snapshot = await registryService.refresh(reason);
        for (const source of sources) {
          if (source.status === "rejected") throw source.reason;
        }
        return snapshot;
      },
    };
    const ensureReady = () => this.start();
    const settingsFacade = new ProviderSettingsFacade(registryService, mutations);
    this.providerSettings = createProviderSettingsService(
      settingsFacade,
      ensureReady,
      dependencies.testConnectivity,
    );
    const selection = createModelSelectionService(
      createNodeModelSelectionFacade(registryService),
      ensureReady,
      dependencies.modelSelectionConfiguredDefaultSource,
    );
    this.modelSelection = selection;
    this.#disposeSelection = () => selection.dispose();
  }

  start(): Promise<void> {
    if (this.#disposed) throw new Error("ProviderRuntime 已 dispose");
    if (this.#startPromise) return this.#startPromise;
    const promise = this.#configRuntime.start().then(() => this.registryService.start());
    this.#startPromise = promise;
    void promise.catch(() => {
      if (this.#startPromise === promise) this.#startPromise = undefined;
    });
    return promise;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#disposeSelection();
    this.registryService.dispose();
    this.#disposeAccountSource?.();
    this.#disposeConfiguredDefaultSource?.();
    this.#configRuntime.dispose();
  }
}

export function createProviderRuntime(options: ProviderRuntimeOptions): ProviderRuntime {
  const { accountSource, testConnectivity, ...configOptions } = options;
  const configRuntime = createProviderConfigRuntime(configOptions);
  const repository = new NodeModelSelectionConfigRepository({
    personalRepository: configRuntime.personalRepository,
  });
  return createProviderRuntimeFromConfigRuntime({
    configRuntime,
    accountSource,
    testConnectivity,
    modelSelectionConfiguredDefaultSource: repository,
    disposeModelSelectionConfiguredDefaultSource: () => repository.dispose(),
  });
}

export function createProviderRuntimeFromConfigRuntime(
  dependencies: ProviderRuntimeDependencies,
): ProviderRuntime {
  return new ProviderRuntime(dependencies);
}
