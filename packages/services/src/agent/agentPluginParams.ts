import type {
  KnorviaAgentMcpServer,
  KnorviaAutomationScheduleRule,
  KnorviaMcpListMode,
  ModelSelection,
} from "@knorvia/shared";

export interface KnorviaAgentWorkspaceTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  /** 远程 workspace 的运行时会话身份；只用于隔离/路由，不能替代 workspacePath。 */
  remoteSessionId?: string;
}

export interface KnorviaAgentPluginViewParams extends KnorviaAgentWorkspaceTarget {
  configScope?: "user" | "workspace";
}

export interface KnorviaAgentListMcpServerStatusesParams extends KnorviaAgentWorkspaceTarget {
  mcpServers?: KnorviaAgentMcpServer[];
  mode?: KnorviaMcpListMode;
}

export interface KnorviaAgentAddPluginMarketplaceParams extends KnorviaAgentWorkspaceTarget {
  dryRun?: boolean;
  operationId?: string;
  source: string;
}

export interface KnorviaAgentRemovePluginMarketplaceParams extends KnorviaAgentWorkspaceTarget {
  marketplace: string;
}

export interface KnorviaAgentUpdatePluginMarketplaceParams extends KnorviaAgentWorkspaceTarget {
  marketplace?: string;
  operationId?: string;
}

export interface KnorviaAgentInstallPluginParams extends KnorviaAgentWorkspaceTarget {
  dryRun?: boolean;
  marketplace: string;
  operationId?: string;
  pluginName: string;
  scope?: "user" | "workspace";
}

export interface KnorviaAgentCancelPluginOperationParams {
  operationId: string;
}

export interface KnorviaAgentUninstallPluginParams extends KnorviaAgentWorkspaceTarget {
  marketplace?: string;
  pluginId?: string;
  pluginName?: string;
  removeCache?: boolean;
}

export interface KnorviaAgentUpdatePluginParams extends KnorviaAgentWorkspaceTarget {
  pluginId?: string;
  marketplace?: string;
}

export interface KnorviaAgentRestoreBuiltinPluginParams extends KnorviaAgentWorkspaceTarget {
  pluginId: string;
}

export interface KnorviaAgentConfigurePluginParams extends KnorviaAgentWorkspaceTarget {
  clearOptionKeys?: string[];
  dryRun?: boolean;
  options: Record<string, unknown>;
  pluginId: string;
  scope?: "user" | "workspace";
}

export interface KnorviaAgentResetPluginConfigParams extends KnorviaAgentWorkspaceTarget {
  pluginId: string;
  scope?: "user" | "workspace";
}

export interface KnorviaAgentValidatePluginParams extends KnorviaAgentWorkspaceTarget {
  marketplace?: string;
  pluginName?: string;
  source?: string;
}

export interface KnorviaAgentDescribePluginParams extends KnorviaAgentWorkspaceTarget {
  marketplace: string;
  pluginName: string;
}

export interface KnorviaAgentSetPluginEnabledParams extends KnorviaAgentWorkspaceTarget {
  enabled: boolean;
  operationId?: string;
  pluginId: string;
  scope?: "user" | "workspace";
}

// Plugin 对话引用 catalog：
// 带 sessionId → session-owned 冻结 catalog（必须路由到持有该 session 的 workspace client）；
// 不带 → workspace 当前 catalog（新建草稿 Picker）。
export interface KnorviaAgentPluginReferenceCatalogParams extends KnorviaAgentWorkspaceTarget {
  sessionId?: string;
}

// Composer Skill catalog：与 Plugin 引用相同，以 sessionId 区分 workspace 当前目录和
// resident Session runtime 快照；不参与 Settings 管理目录。
export interface KnorviaAgentSkillReferenceCatalogParams extends KnorviaAgentWorkspaceTarget {
  sessionId?: string;
}
export interface KnorviaAgentResolveSuggestedPluginReferenceParams extends KnorviaAgentWorkspaceTarget {
  stableId: string;
  operationId: string;
  clientMode: "desktop-continuous" | "web-remote-replayable";
  deliveryKind: "desktop-continuous" | "web-remote-replayable";
}

// ---- 定时任务(automation)管理参数 ----

export interface KnorviaAgentCreateAutomationParams extends KnorviaAgentWorkspaceTarget {
  title: string;
  cronExpr: string;
  relativeDelayMinutes?: number;
  prompt: string;
  studioWorkflowId?: string;
  modelSelection?: ModelSelection;
  mode?: string;
  recurring?: boolean;
  maxRuns?: number;
  endAt?: number;
  scheduleRule?: KnorviaAutomationScheduleRule;
}

export interface KnorviaAgentUpdateAutomationParams extends KnorviaAgentWorkspaceTarget {
  automationId: string;
  title?: string;
  cronExpr?: string;
  prompt?: string;
  modelSelection?: ModelSelection | null;
  mode?: string | null;
  recurring?: boolean;
  maxRuns?: number | null;
  endAt?: number | null;
  scheduleRule?: KnorviaAutomationScheduleRule | null;
  scheduleEditedByUser?: boolean;
}

export interface KnorviaAgentAutomationIdParams extends KnorviaAgentWorkspaceTarget {
  automationId: string;
}

export interface KnorviaAgentSetAutomationEnabledParams extends KnorviaAgentWorkspaceTarget {
  automationId: string;
  enabled: boolean;
}

export interface KnorviaAgentDeleteAutomationRunParams extends KnorviaAgentWorkspaceTarget {
  runId: string;
}
