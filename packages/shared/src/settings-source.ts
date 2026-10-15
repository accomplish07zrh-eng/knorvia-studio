// SPDX-License-Identifier: Apache-2.0
// 设置目录来源与位置类型（纯声明）。
const DIRECTORY_SOURCE_TABLE = { knorvia: "knorvia", agents: "agents", claude: "claude" } as const;
export type SettingsDirectorySource =
  (typeof DIRECTORY_SOURCE_TABLE)[keyof typeof DIRECTORY_SOURCE_TABLE];

const DIRECTORY_SCOPE_TABLE = { user: "user", project: "project" } as const;
export type SettingsDirectoryScope =
  (typeof DIRECTORY_SCOPE_TABLE)[keyof typeof DIRECTORY_SCOPE_TABLE];

export type SettingsDirectoryLocation = {
  source: /* 来源产品 */ SettingsDirectorySource;
  scope: /* 用户级或项目级 */ SettingsDirectoryScope;
  directoryPath: /* 设置目录绝对路径 */ string;
  projectPath?: /* 项目级时的项目路径 */ string;
};
