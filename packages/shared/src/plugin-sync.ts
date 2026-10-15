// SPDX-License-Identifier: Apache-2.0
// 插件同步（导出/导入/远端状态）的共享类型（纯声明）。
const IMPORT_STATUS_TABLE = { synced: "synced", skipped: "skipped", failed: "failed" } as const;
export type PluginSyncImportStatus = (typeof IMPORT_STATUS_TABLE)[keyof typeof IMPORT_STATUS_TABLE];

const SYNC_COMPONENT_TABLE = {
  skills: "skills",
  commands: "commands",
  hooks: "hooks",
  mcp: "mcp",
} as const;
export type PluginSyncComponentType =
  (typeof SYNC_COMPONENT_TABLE)[keyof typeof SYNC_COMPONENT_TABLE];

export type PluginSyncCandidate = {
  id: /* 插件完整 ID */ string;
  name: /* 插件名 */ string;
  pluginId: /* 插件 ID */ string;
  directoryName: /* 目录名 */ string;
  description?: /* 描述 */ string;
  version?: /* 版本 */ string;
  path: /* 本地路径 */ string;
  sizeBytes: /* 归档字节数 */ number;
  enabled: /* 是否启用 */ boolean;
  enabledOverride?: /* 覆盖启用态 */ boolean;
  componentTypes: /* 组件构成 */ PluginSyncComponentType[];
};

export type PluginSyncCandidateListResult = {
  candidates: /* 候选列表 */ PluginSyncCandidate[];
  maxArchiveBytes: /* 归档大小上限 */ number;
};

export type PluginSyncRemoteStatus = {
  pluginId: /* 插件 ID */ string;
  directoryName: /* 目录名 */ string;
  exists: /* 远端是否已存在 */ boolean;
  path?: /* 远端路径 */ string;
  reason?: /* 冲突原因 */ "samePluginId" | "targetExists";
};

export type PluginSyncRemoteStatusResult = {
  statuses: /* 逐插件状态 */ PluginSyncRemoteStatus[];
};

export type PluginSyncArchiveExportResult = {
  archive: /* 归档字节 */ Uint8Array;
  archiveBytes: /* 归档大小 */ number;
  plugins: Array<{
    id: /* 插件完整 ID */ string;
    name: /* 插件名 */ string;
    pluginId: /* 插件 ID */ string;
    directoryName: /* 目录名 */ string;
    enabled?: /* 是否启用 */ boolean;
  }>;
};

export type PluginSyncMarketplaceSourceArchiveExportResult = {
  archive: /* 归档字节 */ Uint8Array;
  archiveBytes: /* 归档大小 */ number;
  marketplaceId: /* 市场标识 */ string;
  pluginNames: /* 归档内插件名 */ string[];
};

export type PluginSyncMarketplaceSourceImportResult = {
  marketplaceId: /* 市场标识 */ string;
  path: /* 导入落点 */ string;
  status: /* 导入结果（失败另有通道） */ Exclude<PluginSyncImportStatus, "failed">;
};

export type PluginSyncImportResultItem = {
  name: /* 插件名 */ string;
  pluginId: /* 插件 ID */ string;
  directoryName: /* 目录名 */ string;
  status: /* 导入结果 */ PluginSyncImportStatus;
  path?: /* 落点路径 */ string;
  error?: /* 错误文本 */ string;
};

export type PluginSyncImportResult = {
  results: /* 逐插件结果 */ PluginSyncImportResultItem[];
};
