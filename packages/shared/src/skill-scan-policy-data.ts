// SPDX-License-Identifier: Apache-2.0

/*
 * 技能目录扫描策略的纯数据表：技能文件名、递归深度上限、跳过的目录名与点目录白名单。
 * 判定逻辑在 skill-scan-policy.ts。
 */

/** 技能定义文件名。 */
export const SKILL_FILE_NAME = "SKILL.md";

/** 递归扫描的最大深度（相对扫描根，根自身为 0）。 */
export const MAX_SKILL_SCAN_DEPTH = 8;

/**
 * 内容目录与构建产物目录：不会放用户技能，但整棵递归会把 node_modules
 * 之类全吃进去（Windows 上尤其慢），所以一律跳过。
 */
export const SKILL_SCAN_EXCLUDED_DIRECTORY_NAMES = [
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
  "coverage",
  ".cache",
  ".next",
  ".turbo",
  ".venv",
  "__pycache__",
] as const;

/** 点目录默认不下钻，只放行这几个（.agents/.cursor 等 vendored 副本会重复列出技能）。 */
export const SKILL_SCAN_DOT_DIRECTORY_ALLOWLIST = [".system"] as const;
