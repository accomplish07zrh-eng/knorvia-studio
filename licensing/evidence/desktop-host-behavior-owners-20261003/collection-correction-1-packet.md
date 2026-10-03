# Fresh complete-owner author boundary

You are a fresh internal author in user-authorized G lane. Read only THIS packet, /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. Do not inspect any inherited implementation, tests, dependencies, git/history, specs, config/env, other packets/authors, network or existing drafts. The curator is source-exposed and generated this public API/external behavior contract. No private predecessor helper/state/decomposition/body is supplied. Public names/types/static bindings are compatibility constraints, no novelty requirement or credit. Shared filesystem and instruction-only access limit are not an OS clean room.

Author ONE COMPLETE TypeScript module. Do not execute, format, compile, test, install, or edit repository files. Use ONE literal heredoc to the specified new /tmp draft path, then compute SHA256 only without reopening the draft. Report SHA, intended exports, exact reads, limits and any uncertainties. Correction if requested must be a new complete literal draft using a fresh packet, not reading or transforming an earlier draft. Choose your own private structure/state/helpers. Preserve all described behavior, temporal observation, return/error/object identity and dependency injection. No security changes, real browser/process/files/network/provider/credential/settings/permission operation. Preserve current imports/public signatures. Whole draft will be frozen before curator reads or installs it.

## Output
/tmp/knorvia-host-collection-author.ts
Complete packages/desktop/src/host/remoteWorkspaceServiceCollection.ts.

## Behavioral contract
- This owner orchestrates registry composition and dynamic runtime preference responses. SourceServices optional parameter ignored. No new service capabilities, permissions, native operations or replacement dependency implementations. Static registry bindings are constrained, zero novelty credit. Keep existing file-local comment directive /* eslint-disable max-lines -- 远程 workspace 服务注册需集中维护，以保持依赖注入顺序 */ if complete module length requires it; existing boundary, not a new lint/security policy.
- Module import time creates ONE createServiceLogger('remote-runtime-preferences') reused per factory. Factory first assertLegacyRemoteWorkspaceRpcContract(connectionServices), before factory side effects. Then createSettingService(),createCredentialService(),createHostApiNetworkTransport(async getter),createBroadcastService(parentPort),reporting wrapper(connectionServices.taskService),attachment task wrapper(reporting result),attachment session wrapper(connectionServices.sessionService), capture bridge.onError, subscribe to connectionServices.agentService.onDynamicSessionRuntimePreferencesRequest() with handler, then construct/register ServiceCollection and disposal association. No subscription teardown added; preserve original lifetime. Reporting inside attachment wrapper so mirror and actual remote prompt see same paths.
- Network getter awaits localSettingService.get() each time, returns {httpProxy:settings.httpProxy,noProxy:settings.httpProxyNoProxy,caCertPath:settings.httpProxyCaCertPath} explicit keys, no cache/extra provider/network. Injected only in tests.
- Dynamic request handler reads Date.now at arrival, constructs context event knorvia_protocol.runtime_preferences.host_request_received, module desktop.host.remote_workspace,requestId,scope,sessionId. Call logger.info(undefined,'runtime preferences host request received',context) synchronously BEFORE launch async work; exception from this log escapes handler directly. Handler returns undefined/fire-and-forget, no async promise returned.
- Async settings stage records its Date.now right AFTER get() is invoked; settings get synchronous throw yields resolution failed without stage failed log; promise rejection yields logger.warn(undefined,'runtime preferences host stage failed',{...context,durationMs:Math.max(0,Date.now-stageStart),error:Error.message else String,stage:'settings'}), then rethrows same error. Promise success logger.debug(undefined,'runtime preferences host stage completed',{...context,durationMs:Math.max(0,Date.now-stageStart),stage:'settings'}) then passes SAME settings. If debug logger throws, resolution catches it as failure; no stage failed log for exception thrown from success callback. No speculative retry/network/config-gateway read.
- On settings success resolution {status:'resolved',preferences:{askUserQuestionAutoResolutionEnabled:settings.askUserQuestionAutoResolutionEnabled!==false,nativeSearchEnhancementsEnabled:settings.nativeSearchEnhancementsEnabled!==false,memoryEnabled:settings.memoryEnabled===true,modelContextBudgetStrategy:DEFAULT_KNORVIA_MODEL_CONTEXT_BUDGET_STRATEGY,...}}. Add integratedTerminalShell ONLY scope==='user-execution' and settings.integratedTerminalShell truthy; otherwise key omitted. No host/global ownership transfer. Request scope is observed after await (not captured differently). Other fields/types default from imported contracts.
- On settings/resolution failure resolution {status:'failed',message:Error.message else String(error)} and logger.warn(undefined,'runtime preferences host resolution failed',{...context,durationMs:Math.max(0,Date.now-arrival),error:resolution.message}). Then exactly one await connectionServices.agentService.respondSessionRuntimePreferences({requestId:request.requestId,resolution}), with requestId observed at send time. Respond rejection is NOT recoded as settings failure/retried. On response success logger.info(undefined,'runtime preferences host response sent',{...context,durationMs:Math.max(0,Date.now-arrival),resolutionStatus:resolution.status}). Any async flow failure incl response/log failure -> final logger.warn(undefined,'runtime preferences host response failed',{...context,durationMs:Math.max(0,Date.now-arrival),error:Error.message else String(error)}), then captured onError(SAME error). No swallowing/new throws, no retries/disposal change.
- Registry EXACT ordered bindings below. Use existing tokens/imports, same remote/local identities and factory parameters. Retain original permissions. Returned collection is SAME object passed to registerHostApiNetworkTransportForDispose(collection,transport), called AFTER registrations. No sourceServices merge/extra global registration.

| Token | Value |
|---|---|
| IStudioRuntimeService | connectionServices.studioRuntimeService (non-null TS assertion only) |
| IFileService | connectionServices.fileService |
| IGitService | connectionServices.gitService |
| IGitCheckpointService | connectionServices.gitCheckpointService |
| ISystemService | connectionServices.systemService |
| ITerminalService | connectionServices.terminalService |
| ISettingService | local factory setting service |
| ICredentialService | local factory credential service |
| IBroadcastService | local factory broadcast service |
| IKnorviaTaskService | attachment(task reporting) wrapper |
| IKnorviaAgentService | connectionServices.agentService |
| IKnorviaSessionService | attachment session wrapper |
| IFileWatcherService | connectionServices.fileWatcherService |
| IModelSelectionService | connectionServices.modelSelectionService |
| IProviderSettingsService | connectionServices.providerSettingsService |
| IUsageStatsService | createUsageStatsService({agentService:connectionServices.agentService}) |
| ISkillsService | connectionServices.skillsService |
| ISkillSyncService | connectionServices.skillSyncService |
| IMcpSyncService | connectionServices.mcpSyncService |
| IPluginSyncService | connectionServices.pluginSyncService |
| IPluginsService | connectionServices.pluginsService |
| IPluginManagementService | connectionServices.pluginManagementService |
| ICommandsService | connectionServices.commandsService |
| ISubagentsService | createSubagentsService({isDesktopRuntime:true}) |
| IHooksService | connectionServices.hooksService |
| IMemoryService | createMemoryService() |
| ISettingsSyncService | createSettingsSyncService({settingService:local factory setting service}) |
| IPromptAttachmentTransferService | params.promptAttachmentTransferService |

## Body-free public API and imports

```ts
import { IBroadcastService, ICommandsService, ICredentialService, IFileService, IFileWatcherService, IGitCheckpointService, IGitService, IHooksService, IMcpSyncService, IMemoryService, IModelSelectionService, IPluginManagementService, IPluginsService, IPluginSyncService, IPromptAttachmentTransferService, IProviderSettingsService, ISettingService, IStudioRuntimeService, ISettingsSyncService, ISkillsService, ISkillSyncService, ISubagentsService, ISystemService, ITerminalService, IUsageStatsService, IKnorviaAgentService, IKnorviaSessionService, IKnorviaTaskService, ServiceCollection, type IServiceAccessor, } from "@knorvia/services";

import { createBroadcastService, createCredentialService, createHostApiNetworkTransport, createMemoryService, createServiceLogger, createSettingService, createSettingsSyncService, createSubagentsService, createUsageStatsService, registerHostApiNetworkTransportForDispose, } from "@knorvia/services/node";

import { DEFAULT_KNORVIA_MODEL_CONTEXT_BUDGET_STRATEGY, type KnorviaSessionRuntimePreferencesResult, } from "@knorvia/shared";

import { assertLegacyRemoteWorkspaceRpcContract } from "./legacyRemoteWorkspaceRpcContract.js";

export function createRemoteWorkspaceServiceCollection(params: {
    connectionServices: IServiceAccessor;
    sourceServices?: ServiceCollection;
    parentPort: Parameters<typeof createBroadcastService>[0];
    createReportingRemoteKnorviaTaskService: <T extends object>(service: T) => T;
    createRemotePromptAttachmentTaskService: <T extends object>(service: T) => T;
    createRemotePromptAttachmentSessionService: <T extends object>(service: T) => T;
    promptAttachmentTransferService: IPromptAttachmentTransferService;
    runtimePreferencesBridge: {
        onError: (error: unknown) => void;
    };
}): ServiceCollection;
```

## Authoritative correction/public-port clarification
Write ONE NEW COMPLETE literal draft /tmp/knorvia-host-collection-author-correction-1.ts. Read only this complete fresh packet and two instruction files; no earlier draft or repository/dependency/tests/source reads. New complete literal implementation only.
- ServiceCollection public method is register(token,value), returning the same collection. It is NOT set(). Keep exact table/order/local/remote identities. Initial registry tests failed TypeError collection.set is not a function.
- Agent public event subscription is TWO stages: agentService.onDynamicSessionRuntimePreferencesRequest() returns an Event callable; invoke that returned callable with handler. Do not pass handler directly to event factory. Initial assumed form silently failed to subscribe synthetic port.
- Imported KnorviaSessionRuntimePreferencesResult describes ONLY the preferences PAYLOAD (askUserQuestionAutoResolutionEnabled,nativeSearchEnhancementsEnabled,memoryEnabled,modelContextBudgetStrategy,optional integratedTerminalShell). The resolution is a UNION {status:'resolved';preferences:KnorviaSessionRuntimePreferencesResult} | {status:'failed';message:string}; it is not itself KnorviaSessionRuntimePreferencesResult. Maintain public signature/imports and correct nested type relationship; no casts hiding incompatible types.
- Preserve module-time logger, assert-before-factories, subscription lifetime, setting authority, exact response/error timing and no retries. Static registry table retained, no forced novelty.
