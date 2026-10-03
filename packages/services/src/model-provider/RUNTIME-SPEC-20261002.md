# Model provider runtime/facades — behavior/API contract

Batch after remote preflight on same PR10. Replace four full owners: providerConfigRuntime.ts, providerRuntime.ts, providerFacadeServices.ts, providerSettingsConnectivity.ts. legacyModelProviderSerialized.ts is separate following batch; do not open. Services unmanaged legacy; retain imported @knorvia/provider, provider-node, rpc/shared, descriptors, paths and logger implementations. No actual settings/token/network access, no provider/authentication policy changes, no alternate execution chain.

```text
settings command → ensure runtime ready → existing facade → config/registry owner
connectivity → readiness → provider-operation barrier → public eligibility → injected executor
selection events → revision bump → readiness/default-source → facade view → observers
runtime start → config start → registry start; runtime dispose → selection → registry → sources → config
```

Public API declarations are in appendix extracted ONLY as type/API syntax. Preserve imports/type exports/service descriptors/channels. These declarations are retained compatibility expression, not novel implementation.

## Config runtime

ProviderConfigRuntimeOptions readonly fields knorviaBuiltinFilePath required; optional knorviaBuiltinActiveFilePath,onPersonalConfigRecovery,onPersonalConfigPollingError,personalFilePath,personalPollingIntervalMs:number|false,watch:boolean. Class ProviderConfigRuntime composes NodeProviderConfigRuntime from @knorvia/provider-node, publicly readonly configService same identity. Construct explicit runtimeOptions containing ALL fields including own undefined optional fields, personalFilePath = options.personalFilePath ?? join(getAppConfigDir(),PERSONAL_PROVIDER_CONFIG_FILE_NAME). No legacy data/remote config import. start, personalRepository getter, resolveKnorviaBuiltinActiveFilePath, refreshKnorviaBuiltin(options?), onDidCheckKnorviaBuiltin(listener:()=>Promise<void>) and dispose synchronously delegate preserving return promises/results/error identity/receiver. Factory new wrapper.

## Registry runtime

ProviderRuntimeOptions extends config options with accountSource?: RefreshableProviderSource<AccountProviderConfigSnapshot> and testConnectivity?: ProviderSettingsConnectivityTester. Dependencies: configRuntime, optional accountSource,disposeAccountSource,testConnectivity,modelSelectionConfiguredDefaultSource,disposeModelSelectionConfiguredDefaultSource. RefreshableSource extends ProviderSource with refresh?(reason:string):Promise<T>.
EmptyAccountProviderConfigSource public readonly configSource constructor. read awaits configSource.read() then createFailClosedAccountProviderConfigSnapshot(result), no product account/credentials. onDidChange takes no declared arguments and returns no-op unsubscribe; no subscription.
ProviderRuntime constructor retains supplied configRuntime/dispose callbacks; public configService exact config runtime service. accountSource supplied or new EmptyAccountProviderConfigSource(configService). public registryService=new ProviderRegistryService({configSource:configService,accountSource}). Construct mutation target described below, ensureReady closure=()=>this.start(), ProviderSettingsFacade(registryService,mutations); createProviderSettingsService(facade,ensureReady,testConnectivity). createNodeModelSelectionFacade(registryService) then createModelSelectionService(that,ensureReady,configuredDefaultSource), expose same object as modelSelection. No eager start in constructor.
start() is NON-async. If disposed throw Error('ProviderRuntime 已 dispose') synchronously. Single-flight exact Promise identity configRuntime.start().then(()=>registryService.start()). Save before attaching rejection observer. Catch observer only resets saved promise if identity still same, consumes its own rejection; returned promise retains failure identity, enables retry. Once success remains cached. Sync throw from config start precedes cache assignment. In-flight start is not cancelled on dispose; do not change.
dispose() idempotent flag before operations, synchronous order: selection.dispose(); registry.dispose(); disposeAccountSource?.(); disposeModelSelectionConfiguredDefaultSource?.(); configRuntime.dispose(). Preserve throw/stop behavior, no allSettled.
Settings mutation target wrappers invoke live configService method receiver, forwarding exact args for createPersonalProvider,savePersonalProviderOverlay(providerId,config,membership,metadata),deletePersonalProvider,reorderPersonalProviders,reorderPersonalModels(providerId,modelIds,membership),renamePersonalModel(providerId,currentModelId,nextModelId,membership),deletePersonalModel(providerId,modelId,membership),setPersonalModelEnabled(providerId,modelId,enabled,membership),savePersonalModelDraft(providerId,originalModelId,nextModelId,config,expectedPersonalRevision,useRecommendedConfig,membership). addPersonalModel is full-signature .bind(configService), no truncation. refresh(reason) forwards registry.refresh. refreshSources(reason): await Promise.allSettled([configRuntime.refreshKnorviaBuiltin({force:true}),accountSource.refresh?.(reason) ?? Promise.resolve()]); then await registry.refresh(reason) even if source rejection; after registry completes choose first rejected SOURCE result in input order and throw exact reason, else return snapshot. Sync source invocation throws before allSettled; preserve. Registry rejection takes precedence.
createProviderRuntime(options) destructure accountSource,testConnectivity, pass rest to createProviderConfigRuntime; create NodeModelSelectionConfigRepository({personalRepository:configRuntime.personalRepository}); then factory from deps including configured-default repository and dispose callback repository.dispose(). No implicit disposeAccountSource in this factory. createProviderRuntimeFromConfigRuntime new ProviderRuntime.

## Settings facade service

Event adapter returns listener=>{const dispose=subscribe(listener);return{dispose}} preserving facade subscription/disposer. No extra ownership of settings event. Each facade method is async, awaits ensureReady then calls SAME facade method with full exact args, preserving errors. Defaults ensureReady async()=>{}. Methods and signatures in API appendix.
Connectivity: await readiness first; missing tester throws Error('当前 Environment 未装配模型连通性测试能力') BEFORE waiting provider operations. await facade.waitForProviderOperations(input.providerId), obtain current facade.getView().providers.find(item => item.providerId === input.providerId) and provider.models.find(item => item.modelId === input.modelId). Provider/model use providerId/modelId, not generic id fields. Eligibility precedence: missing/disabled provider -> provider-unavailable; missing/disabled model OR model.issues.length>0 -> model-unavailable; !provider.executable -> provider-unavailable; !model.executable -> model-unavailable. Return success:false,error:{code, message} with exact messages 'This provider is currently unavailable for connectivity testing.' / 'This model is currently unavailable for connectivity testing.'. Otherwise call injected tester with workspacePath, truthy workspaceIdentity included conditionally, providerId,modelId only; do not inspect keys/entitlement or run secondary transport. Errors from readiness/barrier/getView/tester propagate exact identity.
createProviderSettingsConnectivityTester({readonly testModelConnectivity}) returns async function: inside try await LIVE dependencies.testModelConnectivity({workspacePath,...truthy workspaceIdentity conditional,selection:{providerId,modelId}}); ignore returned success value return {success:true}. Catch everything incl malformed input getters: {success:false,error:{message:Error.message else String(error)}}. Export type ModelConnectivityResult. No network here.

## Selection facade event lifecycle

createModelSelectionService(facade,ensureReady=async()=>{},configuredDefaultSource?) returns IModelSelectionService & dispose():void. logger createServiceLogger('model-selection') retained. revision=0,disposed=false, listener Set. getView(input?): await readiness; if disposed throw Error('ModelSelectionService 已 dispose'); await configuredDefaultSource?.read(); check disposed again same error. base=facade.getView(configuredDefault); if revision < base.revision assign revision=base.revision. Return facade.getView(configuredDefault,revision,input) second call even without listeners. No clone/cache/default preference replacement.
emit sync returns if disposed else revision+=1 then void getView().then(success,failure). Success if still alive iterate live listener Set synchronously in insertion order, call each view; no isolation/catch or stale-result generation rejection. Failure if still alive log.warn(undefined,`ModelSelection View 刷新失败: ${String(error)}`); if disposed ignore. Listener throw in success can reject child promise as existing, don't invent policy.
Immediately subscribe facade.onDidChange(emit), then configuredDefaultSource?.onDidChange?.(emit) preserving receiver. onDidChange listener adds to Set and returns {dispose:()=>listeners.delete(listener)} (boolean compatible void return); can subscribe after dispose as existing. dispose flag first, idempotent, invoke facade disposer then optional default-source disposer then clear set; errors stop remaining teardown. A pending getView cannot notify after dispose; explicit cancellation boundary preserves error identity. No event queue/throttle/order changes.

## Validation and provenance

Original six-source queue scoped types passed (remote + five model files). Ordinary tests/builds skipped per parent; wrappers retain actual provider-node persistence owner, no new write-path implementation in this batch so no new actual-write test. Run only scoped type/lint/architecture and review. No real config/runtime start/auth/network operations. Fresh author reads allowed instructions/packet/API declarations and imported public TYPE-only APIs where necessary, no dependency bodies. Coordinator source-exposed behavior extraction/review separately disclosed, no blanket independent package/MIT claim, retained dependencies classified later. Exact original hashes frozen separately by coordinator.

## Runtime visibility and captured ports

Internal state of ProviderConfigRuntime and ProviderRuntime uses ECMAScript #private fields, inaccessible and non-enumerable at runtime. Preserve this boundary rather than compiling TypeScript private to ordinary properties. Runtime mutation closures capture the constructor's configService/registryService/accountSource objects; invoke live methods on these captured receivers, not replacement objects assigned later to public readonly fields by untyped callers. Only declared public fields should enumerate. Runtime start continuation and dispose invoke the live public this.registryService method; constructor-captured registry semantics apply to mutation closures only.

## Verified declaration-only appendix

### providerFacadeServices.ts

```ts
import type { Event } from "@knorvia/rpc";

import { ServiceChannels } from "@knorvia/shared";

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

import type { ModelConnectivityResult } from "@knorvia/shared";

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

export interface ModelSelectionConfiguredDefaultSource {
  read(): Promise<ModelSelection | undefined>;
  onDidChange?(listener: () => void): () => void;
}

export function createProviderSettingsService(
  facade: ProviderSettingsFacade,
  ensureReady: () => Promise<void> = async () => {},
  testConnectivity?: ProviderSettingsConnectivityTester,
): IProviderSettingsService;

export function createModelSelectionService(
  facade: ModelSelectionFacade,
  ensureReady: () => Promise<void> = async () => {},
  configuredDefaultSource?: ModelSelectionConfiguredDefaultSource,
): IModelSelectionService & { dispose(): void };
```

### providerRuntime.ts

```ts
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

export function createProviderRuntime(options: ProviderRuntimeOptions): ProviderRuntime;

export function createProviderRuntimeFromConfigRuntime(
  dependencies: ProviderRuntimeDependencies,
): ProviderRuntime;
```

### providerConfigRuntime.ts

```ts
import {
  NodeProviderConfigRuntime,
  PERSONAL_PROVIDER_CONFIG_FILE_NAME,
  type NodeProviderConfigRuntimeOptions,
  type PersonalProviderConfigRecoveryEvent,
} from "@knorvia/provider-node";

import { join } from "node:path";

import { getAppConfigDir } from "../paths.js";

export interface ProviderConfigRuntimeOptions {
  readonly knorviaBuiltinFilePath: string;
  readonly knorviaBuiltinActiveFilePath?: string;
  readonly onPersonalConfigRecovery?: (event: PersonalProviderConfigRecoveryEvent) => void;
  readonly onPersonalConfigPollingError?: (error: unknown) => void;
  readonly personalFilePath?: string;
  readonly personalPollingIntervalMs?: number | false;
  readonly watch?: boolean;
}

export function createProviderConfigRuntime(
  options: ProviderConfigRuntimeOptions,
): ProviderConfigRuntime;
```

### providerSettingsConnectivity.ts

```ts
import type { ModelConnectivityResult } from "@knorvia/shared";

import type { ProviderSettingsConnectivityTester } from "./providerFacadeServices.js";

interface FormalModelConnectivityInput {
  readonly workspacePath: string;
  readonly workspaceIdentity?: string;
  readonly selection: {
    readonly providerId: string;
    readonly modelId: string;
  };
}

type FormalModelConnectivityExecutor = (
  input: FormalModelConnectivityInput,
) => Promise<{ readonly success: true }>;

export function createProviderSettingsConnectivityTester(dependencies: {
  readonly testModelConnectivity: FormalModelConnectivityExecutor;
}): ProviderSettingsConnectivityTester;

export type { ModelConnectivityResult };
```
