// SPDX-License-Identifier: Apache-2.0
// 工具路径比较用的规范化。
//
// 两个平台分支刻意不同：
// - win32 分支先把 Git Bash 风格的 `/c/...` 展开成盘符形式、再剥掉 extended 前缀、最后把盘符大写；
// - 非 win32 分支用的是**宿主** `normalize`（不是 `path.posix.normalize`），因此显式传入非宿主平台时
//   结果仍随宿主变化。这是既存事实（known-differences.md K1），重写时不得改成 posix。
//
// 最后统一做 NFC 归一，保证同一文件名的不同 Unicode 写法比较结果一致。

import path, { normalize } from "node:path";
import { platform as currentPlatform } from "node:process";

export type ToolPathPlatform = NodeJS.Platform;
export type ToolPathApi = typeof path.posix | typeof path.win32;

const WINDOWS_PLATFORM = "win32";
const EXTENDED_PREFIX = "\\\\?\\";
const EXTENDED_UNC_PREFIX = "\\\\?\\UNC\\";
const GIT_BASH_DRIVE_PREFIX = /^\/([A-Za-z])\//;
const DRIVE_LETTER_PREFIX = /^([a-zA-Z]):/;
// `\\\\?\\C:\\...` 至少 7 个字符，盘符后的冒号在第 6 个位置（下标 5）。
const EXTENDED_DRIVE_MIN_LENGTH = 7;
const EXTENDED_DRIVE_COLON_INDEX = 5;

export function getToolPathApi(platform: ToolPathPlatform): ToolPathApi {
  return platform === WINDOWS_PLATFORM ? path.win32 : path.posix;
}

export function normalizeToolPathForComparison(
  filePath: string,
  platform: ToolPathPlatform = currentPlatform,
): string {
  const comparable =
    platform === WINDOWS_PLATFORM ? toWindowsComparablePath(filePath) : normalize(filePath);
  return comparable.normalize("NFC");
}

// Windows 侧的三步：展开盘符别名 → 平台归一 → 去 extended 前缀 → 盘符大写。
function toWindowsComparablePath(filePath: string): string {
  const withDriveLetter = expandGitBashDriveAlias(filePath);
  const platformNormalized = path.win32.normalize(withDriveLetter);
  return uppercaseDriveLetter(stripExtendedPrefix(platformNormalized));
}

// Git Bash 风格路径（`/c/Users/...`）统一转成 drive-letter 形式，避免各工具重复实现。
function expandGitBashDriveAlias(filePath: string): string {
  const alias = GIT_BASH_DRIVE_PREFIX.exec(filePath);
  if (alias === null) return filePath;
  const drive = alias[1]!.toUpperCase();
  const remainder = filePath.slice(2).replaceAll("/", "\\");
  return `${drive}:${remainder}`;
}

// 只剥离 extended UNC 与 extended drive path；Volume/GLOBALROOT 等设备命名空间原样保留。
function stripExtendedPrefix(filePath: string): string {
  if (filePath.startsWith(EXTENDED_UNC_PREFIX)) {
    return `\\\\${filePath.slice(EXTENDED_UNC_PREFIX.length)}`;
  }
  const isExtendedDrivePath =
    filePath.startsWith(EXTENDED_PREFIX) &&
    filePath.length >= EXTENDED_DRIVE_MIN_LENGTH &&
    filePath[EXTENDED_DRIVE_COLON_INDEX] === ":";
  return isExtendedDrivePath ? filePath.slice(EXTENDED_PREFIX.length) : filePath;
}

function uppercaseDriveLetter(filePath: string): string {
  const drive = DRIVE_LETTER_PREFIX.exec(filePath);
  if (drive === null) return filePath;
  const rest = filePath.slice(drive[0].length);
  return `${drive[1]!.toUpperCase()}:${rest}`;
}
