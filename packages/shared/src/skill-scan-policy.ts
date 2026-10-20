// SPDX-License-Identifier: Apache-2.0

/*
 * 技能目录扫描策略（纯逻辑，无 IO、无 node:* 依赖）。
 *
 * 桌面端递归扫描与 CLI 单层扫描共用同一份判定，避免两端对
 * 「哪些目录该进」产生分歧；引入 node 内建模块会破坏 web bundle。
 * 文件名、深度与目录词表见 ./skill-scan-policy-data.js。
 */
import {
  SKILL_FILE_NAME,
  MAX_SKILL_SCAN_DEPTH,
  SKILL_SCAN_DOT_DIRECTORY_ALLOWLIST,
  SKILL_SCAN_EXCLUDED_DIRECTORY_NAMES as SKIPPED_DIRECTORY_NAMES,
} from "./skill-scan-policy-data.js";

export { MAX_SKILL_SCAN_DEPTH, SKILL_FILE_NAME };

/** 对外暴露的只读集合；内容与数据文件的词表同源。 */
export const SKILL_SCAN_EXCLUDED_DIRECTORY_NAMES: ReadonlySet<string> = new Set(
  SKIPPED_DIRECTORY_NAMES,
);

const DOT_DIRECTORY_ALLOWED = new Set<string>(SKILL_SCAN_DOT_DIRECTORY_ALLOWLIST);

/** 是否进入该子目录项：先看跳过词表，再决定点目录是否放行。 */
export const shouldWalkSkillDirectoryEntry = (entryName: string): boolean => {
  if (SKILL_SCAN_EXCLUDED_DIRECTORY_NAMES.has(entryName)) return false;
  return entryName.startsWith(".") ? DOT_DIRECTORY_ALLOWED.has(entryName) : true;
};
