// SPDX-License-Identifier: Apache-2.0
// 技能同步（导出/导入/远端状态）的共享类型（B43 错误码面）。
const SKILL_IMPORT_STATUS_TABLE = {
  synced: "synced",
  skipped: "skipped",
  failed: "failed",
} as const;
export type SkillSyncImportStatus =
  (typeof SKILL_IMPORT_STATUS_TABLE)[keyof typeof SKILL_IMPORT_STATUS_TABLE];

// 技能同步体积超限的稳定错误码（逐字冻结，B43）。
const SKILL_SYNC_SIZE_LIMIT_TEXT = "SKILL_SYNC_SIZE_LIMIT_EXCEEDED";
export const SKILL_SYNC_SIZE_LIMIT_ERROR_CODE = SKILL_SYNC_SIZE_LIMIT_TEXT;

const SIZE_LIMIT_PHASE_TABLE = {
  selectedContent: "selected-content",
  archive: "archive",
  extractedContent: "extracted-content",
} as const;
export type SkillSyncSizeLimitPhase =
  (typeof SIZE_LIMIT_PHASE_TABLE)[keyof typeof SIZE_LIMIT_PHASE_TABLE];

export type SkillSyncSizeLimitErrorData = {
  actualBytes: /* 实际字节数 */ number;
  maxBytes: /* 允许上限 */ number;
  phase: /* 超限发生在哪一阶段 */ SkillSyncSizeLimitPhase;
};

export type SkillSyncCandidate = {
  id: /* 技能标识 */ string;
  name: /* 技能名 */ string;
  directoryName: /* 目录名 */ string;
  description: /* 描述 */ string;
  path: /* 本地路径 */ string;
  sizeBytes: /* 归档字节数 */ number;
};

export type SkillSyncCandidateListResult = {
  candidates: /* 候选列表 */ SkillSyncCandidate[];
  maxArchiveBytes: /* 归档大小上限 */ number;
};

export type SkillSyncRemoteStatus = {
  directoryName: /* 目录名 */ string;
  exists: /* 远端是否已存在 */ boolean;
  path?: /* 远端路径 */ string;
};

export type SkillSyncRemoteStatusResult = {
  statuses: /* 逐技能状态 */ SkillSyncRemoteStatus[];
};

export type SkillSyncArchiveExportResult = {
  archive: /* 归档字节 */ Uint8Array;
  archiveBytes: /* 归档大小 */ number;
  skills: Array<{
    id: /* 技能标识 */ string;
    name: /* 技能名 */ string;
    directoryName: /* 目录名 */ string;
  }>;
};

export type SkillSyncImportResultItem = {
  name: /* 技能名 */ string;
  directoryName: /* 目录名 */ string;
  status: /* 导入结果 */ SkillSyncImportStatus;
  path?: /* 落点路径 */ string;
  error?: /* 错误文本 */ string;
};

export type SkillSyncImportResult = {
  results: /* 逐技能结果 */ SkillSyncImportResultItem[];
};
