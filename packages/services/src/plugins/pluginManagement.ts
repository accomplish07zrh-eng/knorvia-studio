// 平台能力面收敛：设置页「插件管理」的薄服务接口。
//
// 背景：pluginManagementStore / usePluginUninstall 过去直接注入 IKnorviaAgentService，
// UI 层因此散布 13 个 plugins/* 旧协议词的消费点。收敛为独立薄 service 后，UI 只依赖
// 本接口；plugins/* 词表的 host 侧消费点收拢到 pluginManagementService 一处（插件的
// 事实源在 cli 进程，服务实现仍经 agent 协议往返——plugins 词表的收口归属
// 插件能力面自身的协议演进，不在会话 v4 词表范围内）。
// 注意与既有 IPluginsService（已 retired 的 marketplace pluginStore 通道）区分：
// 那套接口按 pluginName+marketplace 寻址且方法语义过时，不复用避免签名冲突。
import type { Event } from "@knorvia/rpc";
import type {
  KnorviaPluginOperationProgressNotification,
  KnorviaPluginsConfigureResult,
  KnorviaPluginsCancelOperationResult,
  KnorviaPluginsDescribeResult,
  KnorviaPluginsInstallResult,
  KnorviaPluginsListResult,
  KnorviaPluginsMarketplaceMutationResult,
  KnorviaPluginsOverviewResult,
  KnorviaPluginsReferenceCatalogResult,
  KnorviaPluginsRestoreBuiltinResult,
  KnorviaPluginsSetEnabledResult,
  KnorviaPluginsUninstallResult,
  KnorviaPluginsValidateResult,
} from "@knorvia/shared";
import { ServiceChannels } from "@knorvia/shared";
import { createServiceDescriptor } from "../descriptors.js";
import type {
  KnorviaAgentAddPluginMarketplaceParams,
  KnorviaAgentConfigurePluginParams,
  KnorviaAgentCancelPluginOperationParams,
  KnorviaAgentDescribePluginParams,
  KnorviaAgentInstallPluginParams,
  KnorviaAgentPluginReferenceCatalogParams,
  KnorviaAgentResolveSuggestedPluginReferenceParams,
  KnorviaAgentResetPluginConfigParams,
  KnorviaAgentPluginViewParams,
  KnorviaAgentRemovePluginMarketplaceParams,
  KnorviaAgentRestoreBuiltinPluginParams,
  KnorviaAgentSetPluginEnabledParams,
  KnorviaAgentUninstallPluginParams,
  KnorviaAgentUpdatePluginMarketplaceParams,
  KnorviaAgentUpdatePluginParams,
  KnorviaAgentValidatePluginParams,
} from "../agent/agentPluginParams.js";

export interface IPluginManagementService {
  listPlugins(params: KnorviaAgentPluginViewParams): Promise<KnorviaPluginsListResult>;
  /**
   * Plugin 对话引用 catalog：
   * 带 sessionId → session-owned 冻结 catalog；不带 → workspace 当前 catalog。
   * 实现路由到 workspace 级 agent client，不走插件管理独立进程。
   */
  getPluginReferenceCatalog(
    params: KnorviaAgentPluginReferenceCatalogParams,
  ): Promise<KnorviaPluginsReferenceCatalogResult>;
  resolveSuggestedPluginReference(
    params: KnorviaAgentResolveSuggestedPluginReferenceParams,
  ): Promise<import("@knorvia/shared").KnorviaPluginsResolveSuggestedReferenceResult>;
  onDynamicPluginOperationProgress(
    operationId: string,
  ): Event<KnorviaPluginOperationProgressNotification>;
  getPluginsOverview(params: KnorviaAgentPluginViewParams): Promise<KnorviaPluginsOverviewResult>;
  addPluginMarketplace(
    params: KnorviaAgentAddPluginMarketplaceParams,
  ): Promise<KnorviaPluginsMarketplaceMutationResult>;
  removePluginMarketplace(
    params: KnorviaAgentRemovePluginMarketplaceParams,
  ): Promise<KnorviaPluginsMarketplaceMutationResult>;
  updatePluginMarketplace(
    params: KnorviaAgentUpdatePluginMarketplaceParams,
  ): Promise<KnorviaPluginsMarketplaceMutationResult>;
  installPlugin(params: KnorviaAgentInstallPluginParams): Promise<KnorviaPluginsInstallResult>;
  cancelPluginOperation(
    params: KnorviaAgentCancelPluginOperationParams,
  ): Promise<KnorviaPluginsCancelOperationResult>;
  uninstallPlugin(
    params: KnorviaAgentUninstallPluginParams,
  ): Promise<KnorviaPluginsUninstallResult>;
  updatePlugin(params: KnorviaAgentUpdatePluginParams): Promise<KnorviaPluginsInstallResult>;
  restoreBuiltinPlugin(
    params: KnorviaAgentRestoreBuiltinPluginParams,
  ): Promise<KnorviaPluginsRestoreBuiltinResult>;
  configurePlugin(
    params: KnorviaAgentConfigurePluginParams,
  ): Promise<KnorviaPluginsConfigureResult>;
  resetPluginConfig(
    params: KnorviaAgentResetPluginConfigParams,
  ): Promise<KnorviaPluginsConfigureResult>;
  validatePlugin(params: KnorviaAgentValidatePluginParams): Promise<KnorviaPluginsValidateResult>;
  describePlugin(params: KnorviaAgentDescribePluginParams): Promise<KnorviaPluginsDescribeResult>;
  setPluginEnabled(
    params: KnorviaAgentSetPluginEnabledParams,
  ): Promise<KnorviaPluginsSetEnabledResult>;
}

export const IPluginManagementService = createServiceDescriptor<IPluginManagementService>(
  ServiceChannels.PluginManagement,
);
