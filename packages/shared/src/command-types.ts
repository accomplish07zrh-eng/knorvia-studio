// SPDX-License-Identifier: Apache-2.0
// 命令（快捷指令）的类型面与两个来源判别函数（B15）。
import type { SettingsDirectoryLocation } from "./settings-source.js";

const COMMAND_SOURCE_TABLE = { user: "user", plugin: "plugin" } as const;
export type CommandSource = (typeof COMMAND_SOURCE_TABLE)[keyof typeof COMMAND_SOURCE_TABLE];

const AGENT_SOURCE_TEXT = "agent" as const;
export type CommandAgentSource = typeof AGENT_SOURCE_TEXT;

export type CommandInfo = {
  name: /* 触发用命令名 */ string;
  prompt: /* 展开给模型的提示词模板 */ string;
  content: /* 命令正文 */ string;
  filePath: /* 定义文件的绝对路径 */ string;
  description?: /* 列表展示的说明文字 */ string;
  argumentHint?: /* 参数占位提示 */ string;
};

export type UserCommand = CommandInfo & {
  id: /* 稳定命令 ID */ string;
  source: /* 用户定义来源标记 */ "user";
  agentSource: /* 归属 agent 来源 */ CommandAgentSource;
  location: /* 所在设置目录位置 */ SettingsDirectoryLocation;
  enabled: /* 是否启用 */ boolean;
  scope: /* 全局或项目级 */ "global" | "project";
  projectPath?: /* 项目级命令的目标路径 */ string;
};

export type PluginCommand = Omit<CommandInfo, "filePath"> & {
  id: /* 稳定命令 ID */ string;
  source: /* 插件来源标记 */ "plugin";
  enabled: /* 是否启用 */ boolean;
  pluginName: /* 提供命令的插件名 */ string;
  pluginMarketplace: /* 插件来源市场标识 */ string;
  pluginEnabled: /* 插件自身是否启用 */ boolean;
  scope: /* 插件命令恒为全局级 */ "global";
  filePath: /* 插件内定义文件路径 */ string;
};

export type KnorviaCommand = PluginCommand | UserCommand;

export function isUserCommand(candidate: KnorviaCommand): candidate is UserCommand {
  return candidate.source === "user";
}

export function isPluginCommand(candidate: KnorviaCommand): candidate is PluginCommand {
  return candidate.source === "plugin";
}

export type CommandConfig = {
  name: /* 触发用命令名 */ string;
  prompt: /* 展开给模型的提示词模板 */ string;
  description?: /* 列表展示的说明文字 */ string;
  argumentHint?: /* 参数占位提示 */ string;
  filePath?: /* 定义文件路径（更新时可带） */ string;
};

const STORAGE_LEVEL_TABLE = { user: "user", project: "project" } as const;
export type CommandStorageLevel = (typeof STORAGE_LEVEL_TABLE)[keyof typeof STORAGE_LEVEL_TABLE];

export type CommandsCapability = {
  userScopeAvailable: /* 桌面端才有用户级目录 */ boolean;
  userScopeReason?: /* 缺席原因枚举 */ "desktop_only";
};

export type CommandsListResult = {
  commands: /* 全部命令（用户 + 插件） */ KnorviaCommand[];
  userCommands: /* 用户命令子集 */ UserCommand[];
  pluginCommands: /* 插件命令子集 */ PluginCommand[];
  capability: /* 能力说明 */ CommandsCapability;
};

export type CommandCreateParams = {
  config: /* 新命令定义 */ CommandConfig;
  agentSource?: /* 归属 agent 来源 */ CommandAgentSource;
  storageLevel?: /* 写入层级 */ CommandStorageLevel;
  workspacePath?: /* 项目级命令的工作区路径 */ string;
};

export type CommandUpdateParams = {
  commandId: /* 被更新命令的 ID */ string;
  config: /* 更新后的命令定义 */ CommandConfig;
  agentSource?: /* 归属 agent 来源 */ CommandAgentSource;
  oldFilePath?: /* 改名前的定义文件路径 */ string;
  storageLevel?: /* 写入层级 */ CommandStorageLevel;
  workspacePath?: /* 项目级命令的工作区路径 */ string;
};

export type CommandDeleteParams = {
  commandId: /* 被删除命令的 ID */ string;
  filePath: /* 定义文件路径 */ string;
  agentSource?: /* 归属 agent 来源 */ CommandAgentSource;
};

export type CommandSetEnabledParams = {
  commandId: /* 目标命令的 ID */ string;
  filePath: /* 定义文件路径 */ string;
  enabled: /* 目标启用态 */ boolean;
  agentSource?: /* 归属 agent 来源 */ CommandAgentSource;
};
