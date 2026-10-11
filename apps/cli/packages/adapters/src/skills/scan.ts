// SPDX-License-Identifier: Apache-2.0
// 技能目录扫描入口：异步与同步两条路径分别转发给 scan-async / scan-sync。
import { collectSkillFiles } from "./scan-async.js";
import { collectSkillFilesSync } from "./scan-sync.js";

interface ScanSkillFilesOptions {
  followSymbolicLinks?: boolean;
}

const FOLLOW_BY_DEFAULT = true;

type ScanOptions = ScanSkillFilesOptions;

/** 缺省跟随软链接（插件来源由调用方显式关闭）。 */
function dereferenceOf(options: ScanOptions): boolean {
  return options.followSymbolicLinks ?? FOLLOW_BY_DEFAULT;
}

export async function scanSkillFilesUnderRoot(
  rootPath: string,
  options: ScanOptions = {},
): Promise<string[]> {
  return await collectSkillFiles(rootPath, dereferenceOf(options));
}

export function scanSkillFilesUnderRootSync(rootPath: string, opts: ScanOptions = {}): string[] {
  return collectSkillFilesSync(rootPath, dereferenceOf(opts));
}
