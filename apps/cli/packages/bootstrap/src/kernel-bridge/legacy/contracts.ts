// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy：旧协议参数/结果的 schema 收口。
//
// 为什么集中一份：合同 interface.md §六.1 要求「每个方法先用 @knorvia/shared 的既有 schema
// 校验参数，返回值再用既有 result schema 校验一次」。把 schema → 方法 的配对集中在
// 这里，处理器只表达业务，不各自记 schema 名；也让「不改协议字段」在本包只有一处可疑点。

import type { z } from "zod";
import {
  knorviaMcpListParamsSchema,
  knorviaMcpListResultSchema,
  knorviaPluginOperationProgressNotificationSchema,
  knorviaPluginsCancelOperationParamsSchema,
  knorviaPluginsConfigureParamsSchema,
  knorviaPluginsDescribeParamsSchema,
  knorviaPluginsInstallParamsSchema,
  knorviaPluginsListParamsSchema,
  knorviaPluginsListResultSchema,
  knorviaPluginsMarketplaceAddParamsSchema,
  knorviaPluginsMarketplaceRemoveParamsSchema,
  knorviaPluginsMarketplaceUpdateParamsSchema,
  knorviaPluginsOverviewParamsSchema,
  knorviaPluginsOverviewResultSchema,
  knorviaPluginsReferenceCatalogParamsSchema,
  knorviaPluginsReferenceCatalogResultSchema,
  knorviaPluginsResetConfigParamsSchema,
  knorviaPluginsResolveSuggestedReferenceParamsSchema,
  knorviaPluginsResolveSuggestedReferenceResultSchema,
  knorviaPluginsRestoreBuiltinParamsSchema,
  knorviaPluginsSetEnabledParamsSchema,
  knorviaPluginsSetEnabledResultSchema,
  knorviaPluginsUninstallParamsSchema,
  knorviaPluginsUninstallResultSchema,
  knorviaPluginsUpdateParamsSchema,
  knorviaPluginsValidateParamsSchema,
  knorviaPluginsValidateResultSchema,
  knorviaProcessChildProcessesParamsSchema,
  knorviaProcessChildProcessesResultSchema,
  knorviaProviderTestModelConnectivityParamsSchema,
  knorviaProviderTestModelConnectivityResultSchema,
  knorviaProviderUpdateAccountConfigParamsSchema,
  knorviaProviderUpdateAccountConfigResultSchema,
  knorviaRuntimeCapabilitiesSchema,
  knorviaSavedWorkflowMetaSchema,
  knorviaSavedWorkflowScopeSchema,
  knorviaSkillsReferenceCatalogParamsSchema,
  knorviaSkillsReferenceCatalogResultSchema,
  knorviaTaskTokenUsageParamsSchema,
  knorviaTaskTokenUsageResultSchema,
  knorviaUsageStatsParamsSchema,
  knorviaUsageStatsResultSchema,
  knorviaUserInputRequestParamsSchema,
  knorviaWorkspaceCancelGenerateTextParamsSchema,
  knorviaWorkspaceCancelGenerateTextResultSchema,
  knorviaWorkspaceGenerateTextParamsSchema,
  knorviaWorkspaceGenerateTextResultSchema,
  knorviaWorkspaceHookTrustGrantParamsSchema,
  knorviaWorkspaceHookTrustGrantResultSchema,
  knorviaWorkspacePresentationSchema,
  knorviaWorkspaceReadPresentationParamsSchema,
  knorviaWorkspaceRefSchema,
  knorviaWorkspaceUpdateDynamicWorkflowPolicyParamsSchema,
  knorviaWorkspaceUpdateDynamicWorkflowPolicyResultSchema,
  knorviaWorkspaceUpdateInteractionPreferencesParamsSchema,
  knorviaWorkspaceUpdateInteractionPreferencesResultSchema,
  knorviaWorkspaceUpdateModelIoPreferencesParamsSchema,
  knorviaWorkspaceUpdateModelIoPreferencesResultSchema,
  knorviaWorkspaceUpdateOffPeakToolPolicyParamsSchema,
  knorviaWorkspaceUpdateOffPeakToolPolicyResultSchema,
  knorviaWorkflowsDeleteParamsSchema,
  knorviaWorkflowsDeleteResultSchema,
  knorviaWorkflowsGetParamsSchema,
  knorviaWorkflowsGetResultSchema,
  knorviaWorkflowsListParamsSchema,
  knorviaWorkflowsListResultSchema,
  knorviaWorkflowsMoveParamsSchema,
  knorviaWorkflowsMoveResultSchema,
  knorviaWorkflowsRunsParamsSchema,
  knorviaWorkflowsRunsResultSchema,
  knorviaWorkflowsUpdateMetaParamsSchema,
  knorviaWorkflowsUpdateMetaResultSchema,
  sessionCancelBackgroundTaskParamsSchema,
  sessionCancelBackgroundTaskResultSchema,
  sessionCloseParamsSchema,
  sessionCloseResultSchema,
  sessionCompactParamsSchema,
  sessionCompactResultSchema,
  sessionCreateParamsSchema,
  sessionDebugParamsSchema,
  sessionEventsParamsSchema,
  sessionEventsResultSchema,
  sessionForkParamsSchema,
  sessionForkResultSchema,
  sessionGoalParamsSchema,
  sessionGoalResultSchema,
  sessionListParamsSchema,
  sessionListResultSchema,
  sessionMessagesParamsSchema,
  sessionMessagesResultSchema,
  sessionReadParamsSchema,
  sessionResumeParamsSchema,
  sessionRuntimePreferencesResultSchema,
  sessionSendParamsSchema,
  sessionSendResultSchema,
  sessionSetModeParamsSchema,
  sessionSetModelParamsSchema,
  sessionSetThoughtLevelParamsSchema,
  sessionStopParamsSchema,
  sessionSubagentsParamsSchema,
  sessionSubagentsResultSchema,
  sessionSubscribeParamsSchema,
  sessionSubscribeResultSchema,
  sessionStateSnapshotSchema,
  sessionModeSchema,
} from "@knorvia/shared";

/**
 * 参数/结果 schema 的形状：`parse` 足够，避免各处理器直接依赖 zod 类型。
 * 跨入口/跨模块判断一律用这里的 schema 与方法表，不用 instanceof（团队实测结论）。
 */
export interface LegacySchema<T = unknown> {
  parse(value: unknown): T;
}

/** 参数与结果 schema 配对。`result` 缺席表示该方法返回 `{}`（strict 空对象）。 */
export interface LegacyMethodSchemas {
  readonly params: LegacySchema;
  readonly result?: LegacySchema;
}

/**
 * 74 个方法里本包直接应答的 47 个（59 客户端方向 − 12 端口方法）的 schema 配对。
 * 端口方法的 schema 由执行端口一侧校验（02/03 负责），这里不重复。
 */
export const LEGACY_METHOD_SCHEMAS = {
  "runtime/capabilities": {
    params: knorviaProcessChildProcessesParamsSchema,
    result: knorviaRuntimeCapabilitiesSchema,
  },
  "process/childProcesses": {
    params: knorviaProcessChildProcessesParamsSchema,
    result: knorviaProcessChildProcessesResultSchema,
  },
  "workspace/readPresentation": {
    params: knorviaWorkspaceReadPresentationParamsSchema,
    result: knorviaWorkspacePresentationSchema,
  },
  "session/create": { params: sessionCreateParamsSchema, result: sessionStateSnapshotSchema },
  "session/resume": { params: sessionResumeParamsSchema, result: sessionStateSnapshotSchema },
  "session/list": { params: sessionListParamsSchema, result: sessionListResultSchema },
  "session/subagents": {
    params: sessionSubagentsParamsSchema,
    result: sessionSubagentsResultSchema,
  },
  "session/read": { params: sessionReadParamsSchema, result: sessionStateSnapshotSchema },
  "session/messages": { params: sessionMessagesParamsSchema, result: sessionMessagesResultSchema },
  "session/events": { params: sessionEventsParamsSchema, result: sessionEventsResultSchema },
  "session/debug": { params: sessionDebugParamsSchema },
  "session/usage": {
    params: knorviaTaskTokenUsageParamsSchema,
    result: knorviaTaskTokenUsageResultSchema,
  },
  "session/subscribe": {
    params: sessionSubscribeParamsSchema,
    result: sessionSubscribeResultSchema,
  },
  "session/send": { params: sessionSendParamsSchema, result: sessionSendResultSchema },
  "session/stop": { params: sessionStopParamsSchema },
  "session/cancelBackgroundTask": {
    params: sessionCancelBackgroundTaskParamsSchema,
    result: sessionCancelBackgroundTaskResultSchema,
  },
  "session/fork": { params: sessionForkParamsSchema, result: sessionForkResultSchema },
  "session/compact": { params: sessionCompactParamsSchema, result: sessionCompactResultSchema },
  "session/goal": { params: sessionGoalParamsSchema, result: sessionGoalResultSchema },
  "session/close": { params: sessionCloseParamsSchema, result: sessionCloseResultSchema },
  "session/setModel": { params: sessionSetModelParamsSchema },
  "session/setThoughtLevel": { params: sessionSetThoughtLevelParamsSchema },
  "session/setMode": { params: sessionSetModeParamsSchema },
  "workspace/hooks/trustGrant": {
    params: knorviaWorkspaceHookTrustGrantParamsSchema,
    result: knorviaWorkspaceHookTrustGrantResultSchema,
  },
  "workspace/updateInteractionPreferences": {
    params: knorviaWorkspaceUpdateInteractionPreferencesParamsSchema,
    result: knorviaWorkspaceUpdateInteractionPreferencesResultSchema,
  },
  "workspace/updateModelIoPreferences": {
    params: knorviaWorkspaceUpdateModelIoPreferencesParamsSchema,
    result: knorviaWorkspaceUpdateModelIoPreferencesResultSchema,
  },
  "workspace/updateOffPeakToolPolicy": {
    params: knorviaWorkspaceUpdateOffPeakToolPolicyParamsSchema,
    result: knorviaWorkspaceUpdateOffPeakToolPolicyResultSchema,
  },
  "workspace/updateDynamicWorkflowPolicy": {
    params: knorviaWorkspaceUpdateDynamicWorkflowPolicyParamsSchema,
    result: knorviaWorkspaceUpdateDynamicWorkflowPolicyResultSchema,
  },
  "workspace/generateText": {
    params: knorviaWorkspaceGenerateTextParamsSchema,
    result: knorviaWorkspaceGenerateTextResultSchema,
  },
  "workspace/cancelGenerateText": {
    params: knorviaWorkspaceCancelGenerateTextParamsSchema,
    result: knorviaWorkspaceCancelGenerateTextResultSchema,
  },
  "provider/updateAccountConfig": {
    params: knorviaProviderUpdateAccountConfigParamsSchema,
    result: knorviaProviderUpdateAccountConfigResultSchema,
  },
  "provider/testModelConnectivity": {
    params: knorviaProviderTestModelConnectivityParamsSchema,
    result: knorviaProviderTestModelConnectivityResultSchema,
  },
  "mcp/list": { params: knorviaMcpListParamsSchema, result: knorviaMcpListResultSchema },
  "plugins/list": {
    params: knorviaPluginsListParamsSchema,
    result: knorviaPluginsListResultSchema,
  },
  "plugins/referenceCatalog": {
    params: knorviaPluginsReferenceCatalogParamsSchema,
    result: knorviaPluginsReferenceCatalogResultSchema,
  },
  "plugins/referenceCatalogWithCategory": {
    params: knorviaPluginsReferenceCatalogParamsSchema,
    result: knorviaPluginsReferenceCatalogResultSchema,
  },
  "skills/referenceCatalog": {
    params: knorviaSkillsReferenceCatalogParamsSchema,
    result: knorviaSkillsReferenceCatalogResultSchema,
  },
  "plugins/overview": {
    params: knorviaPluginsOverviewParamsSchema,
    result: knorviaPluginsOverviewResultSchema,
  },
  "plugins/cancelOperation": {
    params: knorviaPluginsCancelOperationParamsSchema,
  },
  "plugins/setEnabled": {
    params: knorviaPluginsSetEnabledParamsSchema,
    result: knorviaPluginsSetEnabledResultSchema,
  },
  "plugins/resolveSuggestedReference": {
    params: knorviaPluginsResolveSuggestedReferenceParamsSchema,
    result: knorviaPluginsResolveSuggestedReferenceResultSchema,
  },
  "plugins/marketplace/add": { params: knorviaPluginsMarketplaceAddParamsSchema },
  "plugins/marketplace/remove": { params: knorviaPluginsMarketplaceRemoveParamsSchema },
  "plugins/marketplace/update": { params: knorviaPluginsMarketplaceUpdateParamsSchema },
  "plugins/install": { params: knorviaPluginsInstallParamsSchema },
  "plugins/uninstall": {
    params: knorviaPluginsUninstallParamsSchema,
    result: knorviaPluginsUninstallResultSchema,
  },
  "plugins/update": { params: knorviaPluginsUpdateParamsSchema },
  "plugins/restoreBuiltin": { params: knorviaPluginsRestoreBuiltinParamsSchema },
  "plugins/configure": { params: knorviaPluginsConfigureParamsSchema },
  "plugins/resetConfig": { params: knorviaPluginsResetConfigParamsSchema },
  "plugins/validate": {
    params: knorviaPluginsValidateParamsSchema,
    result: knorviaPluginsValidateResultSchema,
  },
  "plugins/describe": { params: knorviaPluginsDescribeParamsSchema },
  "workflows/list": {
    params: knorviaWorkflowsListParamsSchema,
    result: knorviaWorkflowsListResultSchema,
  },
  "workflows/get": {
    params: knorviaWorkflowsGetParamsSchema,
    result: knorviaWorkflowsGetResultSchema,
  },
  "workflows/updateMeta": {
    params: knorviaWorkflowsUpdateMetaParamsSchema,
    result: knorviaWorkflowsUpdateMetaResultSchema,
  },
  "workflows/delete": {
    params: knorviaWorkflowsDeleteParamsSchema,
    result: knorviaWorkflowsDeleteResultSchema,
  },
  "workflows/runs": {
    params: knorviaWorkflowsRunsParamsSchema,
    result: knorviaWorkflowsRunsResultSchema,
  },
  "workflows/move": {
    params: knorviaWorkflowsMoveParamsSchema,
    result: knorviaWorkflowsMoveResultSchema,
  },
  "usage/stats": { params: knorviaUsageStatsParamsSchema, result: knorviaUsageStatsResultSchema },
} as const satisfies Readonly<Record<string, LegacyMethodSchemas>>;

/** 反向请求/通知的 schema。 */
export const LEGACY_REVERSE_SCHEMAS = {
  sessionRuntimePreferencesResult: sessionRuntimePreferencesResultSchema,
  userInputRequest: knorviaUserInputRequestParamsSchema,
  pluginOperationProgress: knorviaPluginOperationProgressNotificationSchema,
} as const;

/** 越界引用的既有类型别名（只在本包内部用，不改 shared）。 */
export type WorkspaceRef = z.output<typeof knorviaWorkspaceRefSchema>;
export type SessionMode = z.output<typeof sessionModeSchema>;
export type SavedWorkflowScope = z.output<typeof knorviaSavedWorkflowScopeSchema>;
export type SavedWorkflowMeta = z.output<typeof knorviaSavedWorkflowMetaSchema>;
