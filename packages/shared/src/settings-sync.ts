// SPDX-License-Identifier: Apache-2.0
// 设置跨产品同步（发现/选择/导入）的共享类型（纯声明）。
const SYNC_AGENT_TABLE = {
  knorvia: "knorvia",
  claudeCode: "claudeCode",
  codexCli: "codexCli",
  openCode: "openCode",
  openClaw: "openClaw",
  augment: "augment",
  continue: "continue",
  goose: "goose",
  qwenCode: "qwenCode",
  qode: "qode",
  qodeCn: "qodeCn",
  windsurf: "windsurf",
  trae: "trae",
  traeCn: "traeCn",
  kiroCli: "kiroCli",
  roo: "roo",
  codeBuddy: "codeBuddy",
  agents: "agents",
} as const;
export type SettingsSyncAgent = (typeof SYNC_AGENT_TABLE)[keyof typeof SYNC_AGENT_TABLE];

const SYNC_CATEGORY_TABLE = {
  providers: "providers",
  skills: "skills",
  commands: "commands",
  plugins: "plugins",
  mcpServers: "mcpServers",
} as const;
export type SettingsSyncCategory = (typeof SYNC_CATEGORY_TABLE)[keyof typeof SYNC_CATEGORY_TABLE];

const SYNC_SCOPE_TABLE = { global: "global", project: "project" } as const;
export type SettingsSyncSourceScope = (typeof SYNC_SCOPE_TABLE)[keyof typeof SYNC_SCOPE_TABLE];

const IMPORT_MODE_TABLE = { copy: "copy", symlink: "symlink" } as const;
export type SettingsSyncImportMode = (typeof IMPORT_MODE_TABLE)[keyof typeof IMPORT_MODE_TABLE];

export type SettingsSyncClaudeAgentsFileMigrationStatus = {
  sourcePath: /* 源文件路径 */ string;
  targetPath: /* 目标文件路径 */ string;
  sourceExists: /* 源是否存在 */ boolean;
  targetExists: /* 目标是否存在 */ boolean;
  supported: /* 是否支持迁移 */ boolean;
  unavailableReason?: /* 不可用原因 */ "missingSource";
};

export type SettingsSyncClaudeAgentsFileCopyResult = {
  sourcePath: /* 源文件路径 */ string;
  targetPath: /* 目标文件路径 */ string;
  status: /* 复制结果 */ "copied" | "skipped";
  overwritten: /* 是否覆盖了目标 */ boolean;
  skippedReason?: /* 跳过原因 */ "missingSource" | "targetExists";
};

const SKILL_SKIP_TABLE = {
  targetExists: "targetExists",
  sameNameExists: "sameNameExists",
} as const;
export type SettingsSyncSkillSkipReason = (typeof SKILL_SKIP_TABLE)[keyof typeof SKILL_SKIP_TABLE];

export type SettingsSyncSourceSkillSummary = {
  name: /* 技能名 */ string;
  path: /* 来源路径 */ string;
  importable: /* 是否可导入 */ boolean;
  skipReason?: /* 跳过原因 */ SettingsSyncSkillSkipReason;
  version?: /* 版本 */ string;
};

export type SettingsSyncCommandSkipReason =
  (typeof SKILL_SKIP_TABLE)[keyof typeof SKILL_SKIP_TABLE];

export type SettingsSyncSourceCommandSummary = {
  name: /* 命令名 */ string;
  path: /* 来源路径 */ string;
  importable: /* 是否可导入 */ boolean;
  skipReason?: /* 跳过原因 */ SettingsSyncCommandSkipReason;
  description?: /* 描述 */ string;
  argumentHint?: /* 参数占位提示 */ string;
};

export type SettingsSyncPluginSkipReason = (typeof SKILL_SKIP_TABLE)[keyof typeof SKILL_SKIP_TABLE];

export type SettingsSyncSourcePluginSummary = {
  name: /* 插件名 */ string;
  path: /* 来源路径 */ string;
  importable: /* 是否可导入 */ boolean;
  skipReason?: /* 跳过原因 */ SettingsSyncPluginSkipReason;
  version?: /* 版本 */ string;
};

const MCP_SKIP_TABLE = { sameNameExists: "sameNameExists" } as const;
export type SettingsSyncMcpServerSkipReason = (typeof MCP_SKIP_TABLE)[keyof typeof MCP_SKIP_TABLE];

export type SettingsSyncSourceMcpServerSummary = {
  name: /* 服务名 */ string;
  path: /* 来源路径 */ string;
  importable: /* 是否可导入 */ boolean;
  skipReason?: /* 跳过原因 */ SettingsSyncMcpServerSkipReason;
};

export type SettingsSyncSourceRootSummary = {
  scope: /* 来源层级 */ SettingsSyncSourceScope;
  path: /* 来源根路径 */ string;
  discoveredCount: /* 发现数 */ number;
  importableCount: /* 可导入数 */ number;
  skippedCount?: /* 跳过数 */ number;
  skills?: /* 技能明细 */ SettingsSyncSourceSkillSummary[];
  commands?: /* 命令明细 */ SettingsSyncSourceCommandSummary[];
  plugins?: /* 插件明细 */ SettingsSyncSourcePluginSummary[];
  mcpServers?: /* MCP 明细 */ SettingsSyncSourceMcpServerSummary[];
};

export type SettingsSyncCategorySummary = {
  category: /* 分类 */ SettingsSyncCategory;
  discoveredCount: /* 发现数 */ number;
  importableCount: /* 可导入数 */ number;
  skippedCount?: /* 跳过数 */ number;
  sourcePaths?: /* 来源路径 */ string[];
  sourceRoots?: /* 来源根明细 */ SettingsSyncSourceRootSummary[];
  selectedByDefault: /* 是否默认勾选 */ boolean;
};

const IMPORT_STATUS_TABLE = {
  imported: "imported",
  skipped: "skipped",
  failed: "failed",
} as const;
export type SettingsSyncSkillImportStatus =
  (typeof IMPORT_STATUS_TABLE)[keyof typeof IMPORT_STATUS_TABLE];

export type SettingsSyncSkillImportResult = {
  name: /* 技能名 */ string;
  path: /* 落点路径 */ string;
  sourceScope: /* 来源层级 */ SettingsSyncSourceScope;
  status: /* 导入结果 */ SettingsSyncSkillImportStatus;
  skipReason?: /* 跳过原因 */ SettingsSyncSkillSkipReason;
  version?: /* 版本 */ string;
};

export type SettingsSyncCommandImportStatus =
  (typeof IMPORT_STATUS_TABLE)[keyof typeof IMPORT_STATUS_TABLE];

export type SettingsSyncCommandImportResult = {
  name: /* 命令名 */ string;
  path: /* 落点路径 */ string;
  sourceScope: /* 来源层级 */ SettingsSyncSourceScope;
  status: /* 导入结果 */ SettingsSyncCommandImportStatus;
  skipReason?: /* 跳过原因 */ SettingsSyncCommandSkipReason;
};

export type SettingsSyncPluginImportStatus =
  (typeof IMPORT_STATUS_TABLE)[keyof typeof IMPORT_STATUS_TABLE];

export type SettingsSyncPluginImportResult = {
  name: /* 插件名 */ string;
  path: /* 落点路径 */ string;
  sourceScope: /* 来源层级 */ SettingsSyncSourceScope;
  status: /* 导入结果 */ SettingsSyncPluginImportStatus;
  skipReason?: /* 跳过原因 */ SettingsSyncPluginSkipReason;
  version?: /* 版本 */ string;
};

export type SettingsSyncMcpServerImportStatus =
  (typeof IMPORT_STATUS_TABLE)[keyof typeof IMPORT_STATUS_TABLE];

export type SettingsSyncMcpServerImportResult = {
  name: /* 服务名 */ string;
  path: /* 落点路径 */ string;
  sourceScope: /* 来源层级 */ SettingsSyncSourceScope;
  status: /* 导入结果 */ SettingsSyncMcpServerImportStatus;
  skipReason?: /* 跳过原因 */ SettingsSyncMcpServerSkipReason;
};

export type SettingsSyncAgentSummary = {
  agent: /* 目标产品 */ SettingsSyncAgent;
  discovered: /* 是否发现配置 */ boolean;
  categories: /* 分类汇总 */ SettingsSyncCategorySummary[];
};

export type SettingsSyncDiscoveryResult = {
  agents: /* 逐产品汇总 */ SettingsSyncAgentSummary[];
};

export type SettingsSyncSelection = {
  agent: /* 目标产品 */ SettingsSyncAgent;
  category: /* 分类 */ SettingsSyncCategory;
  sourceScope?: /* 来源层级 */ SettingsSyncSourceScope;
  targetScope?: /* 目标层级 */ SettingsSyncSourceScope;
  importMode?: /* 导入方式 */ SettingsSyncImportMode;
  skillPaths?: /* 选中的技能路径 */ string[];
  commandPaths?: /* 选中的命令路径 */ string[];
  pluginPaths?: /* 选中的插件路径 */ string[];
  mcpServerPaths?: /* 选中的 MCP 路径 */ string[];
};

export type SettingsSyncProgressEvent = {
  total: /* 总任务数 */ number;
  completed: /* 已完成数 */ number;
  currentAgent?: /* 当前产品 */ SettingsSyncAgent;
  currentCategory?: /* 当前分类 */ SettingsSyncCategory;
  successCount: /* 成功数 */ number;
  skippedCount: /* 跳过数 */ number;
  failedCount: /* 失败数 */ number;
};

export type SettingsSyncTaskImportResult = {
  agent: /* 目标产品 */ SettingsSyncAgent;
  category: /* 分类 */ SettingsSyncCategory;
  status: /* 任务结果 */ "success" | "skipped" | "failed";
  importedCount: /* 导入数 */ number;
  skippedCount: /* 跳过数 */ number;
  failedCount: /* 失败数 */ number;
  skillResults?: /* 技能明细 */ SettingsSyncSkillImportResult[];
  commandResults?: /* 命令明细 */ SettingsSyncCommandImportResult[];
  pluginResults?: /* 插件明细 */ SettingsSyncPluginImportResult[];
  mcpServerResults?: /* MCP 明细 */ SettingsSyncMcpServerImportResult[];
};

export type SettingsSyncImportResult = {
  successCount: /* 成功任务数 */ number;
  skippedCount: /* 跳过任务数 */ number;
  failedCount: /* 失败任务数 */ number;
  taskResults: /* 逐任务结果 */ SettingsSyncTaskImportResult[];
};

export type SettingsSyncFirstRunPromptState = {
  handled: /* 首跑提示是否已处理 */ boolean;
};
