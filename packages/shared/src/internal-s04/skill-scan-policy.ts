// SPDX-License-Identifier: Apache-2.0
/**
 * 技能目录递归扫描策略规范（纯逻辑，无任何 Node 原生 IO 依赖）。
 * 统一桌面端服务与 CLI 适配层在扫描 SKILL.md 时进入目录的判定边界。
 */

/** 技能清单标准文件名 */
export const SKILL_FILE_NAME = "SKILL.md";

/** 扫描下钻的最大递归层数上限（防死循环与超深软链） */
export const MAX_SKILL_SCAN_DEPTH = 8;

const EXCLUDED_DIRS_CSV =
  "node_modules,dist,build,out,target,vendor,coverage,.cache,.next,.turbo,.venv,__pycache__";

/** 扫描跳过的目录名称集合（12 个明确跳过的临时构建、依赖与缓存目录） */
export const SKILL_SCAN_EXCLUDED_DIRECTORY_NAMES: ReadonlySet<string> = new Set(
  EXCLUDED_DIRS_CSV.split(","),
);

const PERMITTED_DOT_DIR = ".system";

/**
 * 判定递归扫描器是否应当访问指定的子目录项。
 * 排除明确列出的构建/缓存目录；跳过除 .system 之外的隐藏目录（点前缀）。
 */
export function shouldWalkSkillDirectoryEntry(entryName: string): boolean {
  if (SKILL_SCAN_EXCLUDED_DIRECTORY_NAMES.has(entryName)) {
    return false;
  }
  return entryName.startsWith(".") ? entryName === PERMITTED_DOT_DIR : true;
}
