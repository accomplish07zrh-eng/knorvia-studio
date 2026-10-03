/* eslint-disable max-lines -- 远程 workspace 服务注册需集中维护，以保持依赖注入顺序 */
import {
  IBroadcastService,
  ICommandsService,
  ICredentialService,
  IFileService,
  IFileWatcherService,
  IGitCheckpointService,
  IGitService,
  IHooksService,
  IMcpSyncService,
  IMemoryService,
  IModelSelectionService,
  IPluginManagementService,
  IPluginsService,
  IPluginSyncService,
  IPromptAttachmentTransferService,
  IProviderSettingsService,
  ISettingService,
  IStudioRuntimeService,
  ISettingsSyncService,
  ISkillsService,
  ISkillSyncService,
  ISubagentsService,
  ISystemService,
  ITerminalService,
  IUsageStatsService,
  IKnorviaAgentService,
  IKnorviaSessionService,
  IKnorviaTaskService,
  ServiceCollection,
  type IServiceAccessor,
} from "@knorvia/services";
import {
  createBroadcastService,
  createCredentialService,
  createHostApiNetworkTransport,
  createMemoryService,
  createServiceLogger,
  createSettingService,
  createSettingsSyncService,
  createSubagentsService,
  createUsageStatsService,
  registerHostApiNetworkTransportForDispose,
} from "@knorvia/services/node";
import {
  DEFAULT_KNORVIA_MODEL_CONTEXT_BUDGET_STRATEGY,
  type KnorviaSessionRuntimePreferencesResult,
} from "@knorvia/shared";
import { assertLegacyRemoteWorkspaceRpcContract } from "./legacyRemoteWorkspaceRpcContract.js";

const runtimeLogger = createServiceLogger("remote-runtime-preferences");

type HostPreferenceResolution =
  | { status: "resolved"; preferences: KnorviaSessionRuntimePreferencesResult }
  | { status: "failed"; message: string };

function failureText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
}): ServiceCollection {
  const remote = params.connectionServices;
  assertLegacyRemoteWorkspaceRpcContract(remote);

  const localSettings = createSettingService();
  const localCredentials = createCredentialService();
  const transport = createHostApiNetworkTransport(async () => {
    const current = await localSettings.get();
    return {
      httpProxy: current.httpProxy,
      noProxy: current.httpProxyNoProxy,
      caCertPath: current.httpProxyCaCertPath,
    };
  });
  const localBroadcast = createBroadcastService(params.parentPort);
  const reportingTasks = params.createReportingRemoteKnorviaTaskService(remote.taskService);
  const attachmentTasks = params.createRemotePromptAttachmentTaskService(reportingTasks);
  const attachmentSessions = params.createRemotePromptAttachmentSessionService(
    remote.sessionService,
  );
  const reportAsyncError = params.runtimePreferencesBridge.onError;

  // 公共事件端口先返回 Event，再由 Event 接收处理器。
  remote.agentService.onDynamicSessionRuntimePreferencesRequest()((request) => {
    const receivedAt = Date.now();
    const requestContext = {
      event: "knorvia_protocol.runtime_preferences.host_request_received",
      module: "desktop.host.remote_workspace",
      requestId: request.requestId,
      scope: request.scope,
      sessionId: request.sessionId,
    };
    runtimeLogger.info(undefined, "runtime preferences host request received", requestContext);

    const respond = async (): Promise<void> => {
      let result: HostPreferenceResolution;
      try {
        const pendingSettings = localSettings.get();
        const settingsBeganAt = Date.now();
        const current = await pendingSettings.then(
          (settings) => {
            runtimeLogger.debug(undefined, "runtime preferences host stage completed", {
              ...requestContext,
              durationMs: Math.max(0, Date.now() - settingsBeganAt),
              stage: "settings",
            });
            return settings;
          },
          (error: unknown) => {
            runtimeLogger.warn(undefined, "runtime preferences host stage failed", {
              ...requestContext,
              durationMs: Math.max(0, Date.now() - settingsBeganAt),
              error: failureText(error),
              stage: "settings",
            });
            throw error;
          },
        );
        const preferences: KnorviaSessionRuntimePreferencesResult = {
          askUserQuestionAutoResolutionEnabled:
            current.askUserQuestionAutoResolutionEnabled !== false,
          nativeSearchEnhancementsEnabled: current.nativeSearchEnhancementsEnabled !== false,
          memoryEnabled: current.memoryEnabled === true,
          modelContextBudgetStrategy: DEFAULT_KNORVIA_MODEL_CONTEXT_BUDGET_STRATEGY,
          ...(request.scope === "user-execution" && current.integratedTerminalShell
            ? { integratedTerminalShell: current.integratedTerminalShell }
            : {}),
        };
        result = { status: "resolved", preferences };
      } catch (error) {
        result = { status: "failed", message: failureText(error) };
        runtimeLogger.warn(undefined, "runtime preferences host resolution failed", {
          ...requestContext,
          durationMs: Math.max(0, Date.now() - receivedAt),
          error: result.message,
        });
      }

      await remote.agentService.respondSessionRuntimePreferences({
        requestId: request.requestId,
        resolution: result,
      });
      runtimeLogger.info(undefined, "runtime preferences host response sent", {
        ...requestContext,
        durationMs: Math.max(0, Date.now() - receivedAt),
        resolutionStatus: result.status,
      });
    };

    void respond().catch((error: unknown) => {
      runtimeLogger.warn(undefined, "runtime preferences host response failed", {
        ...requestContext,
        durationMs: Math.max(0, Date.now() - receivedAt),
        error: failureText(error),
      });
      reportAsyncError(error);
    });
  });

  const services = new ServiceCollection();
  services.register(IStudioRuntimeService, remote.studioRuntimeService!);
  services.register(IFileService, remote.fileService);
  services.register(IGitService, remote.gitService);
  services.register(IGitCheckpointService, remote.gitCheckpointService);
  services.register(ISystemService, remote.systemService);
  services.register(ITerminalService, remote.terminalService);
  services.register(ISettingService, localSettings);
  services.register(ICredentialService, localCredentials);
  services.register(IBroadcastService, localBroadcast);
  services.register(IKnorviaTaskService, attachmentTasks);
  services.register(IKnorviaAgentService, remote.agentService);
  services.register(IKnorviaSessionService, attachmentSessions);
  services.register(IFileWatcherService, remote.fileWatcherService);
  services.register(IModelSelectionService, remote.modelSelectionService);
  services.register(IProviderSettingsService, remote.providerSettingsService);
  services.register(
    IUsageStatsService,
    createUsageStatsService({ agentService: remote.agentService }),
  );
  services.register(ISkillsService, remote.skillsService);
  services.register(ISkillSyncService, remote.skillSyncService);
  services.register(IMcpSyncService, remote.mcpSyncService);
  services.register(IPluginSyncService, remote.pluginSyncService);
  services.register(IPluginsService, remote.pluginsService);
  services.register(IPluginManagementService, remote.pluginManagementService);
  services.register(ICommandsService, remote.commandsService);
  services.register(ISubagentsService, createSubagentsService({ isDesktopRuntime: true }));
  services.register(IHooksService, remote.hooksService);
  services.register(IMemoryService, createMemoryService());
  services.register(
    ISettingsSyncService,
    createSettingsSyncService({ settingService: localSettings }),
  );
  services.register(IPromptAttachmentTransferService, params.promptAttachmentTransferService);
  registerHostApiNetworkTransportForDispose(services, transport);
  return services;
}
