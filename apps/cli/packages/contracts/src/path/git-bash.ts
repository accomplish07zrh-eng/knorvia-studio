// SPDX-License-Identifier: Apache-2.0
// Windows 路径与 Git Bash 路径的双向转换。
// 组织方式：两侧各一张规则表（挂载点前缀 / 盘符前缀），转换只做一次前缀解析再一次后缀拼接。

/** `X:`、`X:\`、`X:/` 三种写法都算盘符前缀。 */
const WINDOWS_DRIVE_PREFIX_PATTERN = /^([A-Za-z]):(?:[/\\]|$)/u;
/** Git Bash 在 Windows 上把盘符挂在 `/cygdrive/<盘符>` 下。 */
const GIT_BASH_CYGDRIVE_PREFIX_PATTERN = /^\/cygdrive\/([A-Za-z])(?:\/|$)/u;
/** 也接受 MSYS 风格的短写法 `/c/...`。 */
const GIT_BASH_DRIVE_PREFIX_PATTERN = /^\/([A-Za-z])(?:\/|$)/u;

/** 盘符前缀自身占几个字符：`X:` 是 2，`/cygdrive/X` 是 11。 */
const WINDOWS_DRIVE_PREFIX_LENGTH = 2;
const GIT_BASH_CYGDRIVE_PREFIX_LENGTH = 11;

const UNC_PREFIX = "\\\\";
const GIT_BASH_UNC_PREFIX = "//";

function toForwardSlashes(value: string): string {
  return value.replaceAll("\\", "/");
}

function toBackslashes(value: string): string {
  return value.replaceAll("/", "\\");
}

/** 盘符后的剩余部分 → `\rest`；没有剩余部分时补一个根分隔符。 */
function windowsDriveSuffix(rest: string): string {
  const converted = toBackslashes(rest.replace(/^\/+/u, ""));
  return converted.length > 0 ? `\\${converted}` : "\\";
}

/** 解析 Git Bash 侧的盘符前缀，返回盘符与剩余路径；不是盘符路径时返回 undefined。 */
function gitBashDrivePrefix(value: string): { drive: string; rest: string } | undefined {
  const cygdrive = GIT_BASH_CYGDRIVE_PREFIX_PATTERN.exec(value);
  if (cygdrive) {
    return { drive: cygdrive[1]!, rest: value.slice(GIT_BASH_CYGDRIVE_PREFIX_LENGTH) };
  }
  const short = GIT_BASH_DRIVE_PREFIX_PATTERN.exec(value);
  if (short) return { drive: short[1]!, rest: value.slice(WINDOWS_DRIVE_PREFIX_LENGTH) };
  return undefined;
}

/** Windows 路径 → Git Bash 路径：UNC 原样转斜杠，盘符变小写挂到根下。 */
export function windowsPathToGitBashPath(value: string): string {
  if (value.startsWith(UNC_PREFIX)) return toForwardSlashes(value);

  const drive = WINDOWS_DRIVE_PREFIX_PATTERN.exec(value);
  if (!drive) return toForwardSlashes(value);

  const rest = toForwardSlashes(value.slice(WINDOWS_DRIVE_PREFIX_LENGTH));
  const prefixedRest = rest.startsWith("/") ? rest : `/${rest}`;
  return `/${drive[1]!.toLowerCase()}${prefixedRest}`;
}

/** Git Bash 路径 → Windows 路径：UNC 原样转反斜杠，挂载点与短写法都还原成 `X:\`。 */
export function gitBashPathToWindowsPath(value: string): string {
  if (value.startsWith(GIT_BASH_UNC_PREFIX)) return toBackslashes(value);

  const prefix = gitBashDrivePrefix(value);
  if (!prefix) return toBackslashes(value);
  return `${prefix.drive.toUpperCase()}:${windowsDriveSuffix(prefix.rest)}`;
}
