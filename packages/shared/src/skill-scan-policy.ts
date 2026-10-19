// SPDX-License-Identifier: Apache-2.0

/*
 * 技能目录扫描策略（纯逻辑，无 IO、无 node:* 依赖）。
 *
 * 桌面端递归扫描与 CLI 单层扫描共用同一份判定，避免两端对
 * 「哪些目录该进」产生分歧；引入 node 内建模块会破坏 web bundle。
 */

/** 扫描契约的数值/名字先登记，再分别投影成对外常量。 */
const SKILL_SCAN_CONTRACT = {
  fileName: "SKILL.md",
  maxDepth: 8,
} as const;

/**
 * 内容目录与构建产物目录：不会放用户技能，但整棵递归会把 node_modules
 * 之类全吃进去（Windows 上尤其慢），所以一律跳过。
 */
const SKIPPED_DIRECTORY_CATALOG =
  "__pycache__ .cache .next .turbo .venv build coverage dist node_modules out target vendor";

export const SKILL_FILE_NAME = SKILL_SCAN_CONTRACT.fileName;
export const MAX_SKILL_SCAN_DEPTH = SKILL_SCAN_CONTRACT.maxDepth;

/** 对外暴露的只读集合；内容与上面的词表同源。 */
export const SKILL_SCAN_EXCLUDED_DIRECTORY_NAMES: ReadonlySet<string> = new Set(
  SKIPPED_DIRECTORY_CATALOG.split(" "),
);

/** 点目录默认不下钻（.agents/.cursor 等 vendored 副本会重复列出技能）。 */
const DOT_DIRECTORY_ALLOWED = new Set([".system"]);

/** 是否进入该子目录项：先看跳过词表，再决定点目录是否放行。 */
export const shouldWalkSkillDirectoryEntry = (entryName: string): boolean => {
  if (SKILL_SCAN_EXCLUDED_DIRECTORY_NAMES.has(entryName)) return false;
  return entryName.startsWith(".") ? DOT_DIRECTORY_ALLOWED.has(entryName) : true;
};
