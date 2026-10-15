// SPDX-License-Identifier: Apache-2.0
// MCP 用户目录配置同步的共享类型（纯声明）。
import type { McpServerConfig } from "./mcp.js";

const MCP_IMPORT_STATUS_TABLE = { synced: "synced", skipped: "skipped", failed: "failed" } as const;
export type McpSyncImportStatus =
  (typeof MCP_IMPORT_STATUS_TABLE)[keyof typeof MCP_IMPORT_STATUS_TABLE];

const MCP_SYNC_SOURCE_TABLE = { knorvia: "knorvia", agents: "agents" } as const;
export type McpSyncSource = (typeof MCP_SYNC_SOURCE_TABLE)[keyof typeof MCP_SYNC_SOURCE_TABLE];

export type McpSyncCandidate = {
  id: /* 配置项标识 */ string;
  name: /* 服务名 */ string;
  config: /* 服务配置 */ McpServerConfig;
  enabled: /* 是否启用 */ boolean;
  source: /* 来源产品 */ McpSyncSource;
  path: /* 定义文件路径 */ string;
};

export type McpSyncCandidateListResult = {
  candidates: /* 候选列表 */ McpSyncCandidate[];
  localHomeDir: /* 本地 home 目录 */ string;
};

export type McpSyncRemoteStatus = {
  name: /* 服务名 */ string;
  exists: /* 远端是否已存在 */ boolean;
  path?: /* 远端路径 */ string;
};

export type McpSyncRemoteStatusResult = {
  statuses: /* 逐服务状态 */ McpSyncRemoteStatus[];
  remoteHomeDir: /* 远端 home 目录 */ string;
};

export type McpSyncExportedServer = {
  id: /* 配置项标识 */ string;
  name: /* 服务名 */ string;
  config: /* 服务配置 */ McpServerConfig;
  enabled: /* 是否启用 */ boolean;
  source: /* 来源产品 */ McpSyncSource;
  path: /* 定义文件路径 */ string;
};

export type McpSyncExportResult = {
  servers: /* 导出的服务 */ McpSyncExportedServer[];
  localHomeDir: /* 本地 home 目录 */ string;
};

export type McpSyncImportResultItem = {
  name: /* 服务名 */ string;
  status: /* 导入结果 */ McpSyncImportStatus;
  path?: /* 落点路径 */ string;
  error?: /* 错误文本 */ string;
};

export type McpSyncImportResult = {
  results: /* 逐服务结果 */ McpSyncImportResultItem[];
};
