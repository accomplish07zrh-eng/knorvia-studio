// SPDX-License-Identifier: Apache-2.0
// 子代理（subagent）配置类型、覆盖解析与稳定 ID 构造（B42）。
import type { KnorviaProvider } from "./task-types-core.js";
import { modelSelectionSchema, type ModelSelection } from "./model-selection.js";

const AGENT_SCOPE_TABLE = { builtIn: "built-in", workspace: "workspace", user: "user" } as const;
export type AgentScope = (typeof AGENT_SCOPE_TABLE)[keyof typeof AGENT_SCOPE_TABLE];

const AGENT_SOURCE_TABLE = { builtIn: "built-in", user: "user", plugin: "plugin" } as const;
export type AgentSource = (typeof AGENT_SOURCE_TABLE)[keyof typeof AGENT_SOURCE_TABLE];

const BUILT_IN_NAME_TABLE = { generalPurpose: "general-purpose", explore: "Explore" } as const;
export type BuiltInSubagentName = (typeof BUILT_IN_NAME_TABLE)[keyof typeof BUILT_IN_NAME_TABLE];

export type BuiltInSubagentModelSelectionOverrides = Partial<
  Record<BuiltInSubagentName, ModelSelection>
>;

export type PluginSubagentModelSelectionOverrides = Readonly<Record<string, ModelSelection>>;

const PLUGIN_ID_PREFIX = "plugin:";

// 正式 reader 只接受结构化覆盖，不在读取时解释旧双 map 或重新匹配 Provider。
export function parsePluginSubagentModelSelectionOverrides(
  value: unknown,
): PluginSubagentModelSelectionOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([id, candidate]) => {
      const selection = modelSelectionSchema.safeParse(candidate);
      return id.startsWith(PLUGIN_ID_PREFIX) && selection.success ? [[id, selection.data]] : [];
    }),
  );
}

const PERMISSION_MODE_TABLE = { auto: "auto", plan: "plan" } as const;
export type AgentPermissionMode =
  (typeof PERMISSION_MODE_TABLE)[keyof typeof PERMISSION_MODE_TABLE];

const AGENT_COLOR_TABLE = {
  red: "red",
  blue: "blue",
  green: "green",
  yellow: "yellow",
  purple: "purple",
  orange: "orange",
  pink: "pink",
  cyan: "cyan",
} as const;
export type AgentColor = (typeof AGENT_COLOR_TABLE)[keyof typeof AGENT_COLOR_TABLE];

const LIST_MODE_TABLE = {
  allRuntimeScopes: "allRuntimeScopes",
  settingsUserOnly: "settingsUserOnly",
} as const;
export type SubagentsListMode = (typeof LIST_MODE_TABLE)[keyof typeof LIST_MODE_TABLE];

export type AgentSummary = {
  id: /* 稳定 agent ID */ string;
  name: /* 展示名 */ string;
  description: /* 描述 */ string;
  systemPrompt: /* 系统提示词 */ string;
  color?: /* 标识色 */ AgentColor;
  modelSelection?: /* 生效模型选择 */ ModelSelection;
  defaultModelSelection?: /* 默认模型选择 */ ModelSelection;
  modelSelectionOverride?: /* 覆盖模型选择 */ ModelSelection;
  tools?: /* 允许工具列表 */ string[];
  disallowedTools?: /* 禁用工具列表 */ string[];
  injectAgentsMd?: /* 是否注入 AGENTS.md */ boolean;
  skills?: /* 启用技能 */ string[];
  permissionMode?: /* 权限模式 */ AgentPermissionMode;
  maxTurns?: /* 最大轮次 */ number;
  background?: /* 是否后台运行 */ boolean;
  mcpServers?: /* MCP 服务配置 */ unknown[];
  path: /* 定义文件路径 */ string;
  scope: /* 作用域 */ AgentScope;
  source: /* 来源 */ AgentSource;
  enabled: /* 是否启用 */ boolean;
  readOnly?: /* 是否只读 */ boolean;
  projectPath?: /* 项目级定义的项目路径 */ string;
  pluginId?: /* 插件 ID */ string;
  pluginName?: /* 插件名 */ string;
  diagnostics?: /* 读取诊断 */ AgentDiagnostic[];
};

export type AgentDiagnostic = {
  code: /* 诊断码 */ string;
  message: /* 可读描述 */ string;
  path?: /* 相关文件 */ string;
};

export type AgentsCapability = {
  userScopeAvailable: /* 是否有用户级目录 */ boolean;
  userScopeReason?: /* 缺席原因枚举 */ "desktop_only";
};

export type AgentsListResult = {
  agents: /* 全部 agent */ AgentSummary[];
  userAgents: /* 用户级子集 */ AgentSummary[];
  pluginAgents: /* 插件级子集 */ AgentSummary[];
  capability: /* 能力说明 */ AgentsCapability;
  diagnostics?: /* 读取诊断 */ AgentDiagnostic[];
};

// Agent 配置，用于创建/更新 agent。
export type SubAgentConfig = {
  name: /* 展示名 */ string;
  description: /* 描述 */ string;
  systemPrompt: /* 系统提示词 */ string;
  color?: /* 标识色 */ AgentColor;
  modelSelection?: /* 模型选择 */ ModelSelection;
  tools?: /* 允许工具列表 */ string[];
  disallowedTools?: /* 禁用工具列表 */ string[];
  injectAgentsMd?: /* 是否注入 AGENTS.md */ boolean;
  skills?: /* 启用技能 */ string[];
  permissionMode?: /* 权限模式 */ AgentPermissionMode;
  maxTurns?: /* 最大轮次 */ number;
  background?: /* 是否后台运行 */ boolean;
  mcpServers?: /* MCP 服务配置 */ unknown[];
};

// Agent 创建参数。
export type AgentCreateParams = {
  config: /* agent 定义 */ SubAgentConfig;
  provider: /* 归属供应商 */ KnorviaProvider;
  scope?: /* 保存层级 */ "user" | "workspace";
  workspacePath?: /* 工作区路径 */ string;
  workspaceIdentity?: /* 身份 key */ string;
};

// Agent 更新参数。
export type AgentUpdateParams = {
  agentId: /* 目标 agent ID */ string;
  config: /* 新定义 */ SubAgentConfig;
  oldFilePath?: /* 改名前路径 */ string;
  provider: /* 归属供应商 */ KnorviaProvider;
  scope?: /* 保存层级 */ "user" | "workspace";
  workspacePath?: /* 工作区路径 */ string;
  workspaceIdentity?: /* 身份 key */ string;
};

// Agent 删除参数。
export type AgentDeleteParams = {
  agentId: /* 目标 agent ID */ string;
  filePath: /* 定义文件路径 */ string;
};

export type BuiltInSubagentModelOverrideParams = {
  agentName: /* 内置 agent 名 */ BuiltInSubagentName;
  modelSelection?: /* 覆盖选择；缺席清覆盖 */ ModelSelection;
};

export type PluginSubagentModelOverrideParams = {
  agentId: /* 插件 agent 稳定 ID */ string;
  modelSelection?: /* 覆盖选择；缺席清覆盖 */ ModelSelection;
};

/**
 * 插件 subagent 的稳定 id：`plugin:<pluginId>:<裸名小写>`。
 * pluginId 为 `<name>@<marketplace>`，不含版本，插件升级后 id 不变、覆盖随之保留。
 * services 与 CLI bootstrap 都拿它做 agents-state.json 的键，必须共用这一处实现。
 */
export function createPluginAgentStateId(pluginId: string, agentName: string): string {
  return `${PLUGIN_ID_PREFIX}${pluginId}:${agentName.trim().toLowerCase()}`;
}

export function createAgentStateId(input: {
  name: /* agent 名 */ string;
  scope: /* 作用域 */ AgentScope;
  source: /* 来源 */ AgentSource;
}): string {
  return `${input.source}:${input.scope}:${input.name.trim().toLowerCase()}`;
}
