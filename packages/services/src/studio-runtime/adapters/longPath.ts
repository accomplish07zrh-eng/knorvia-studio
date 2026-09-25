import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, parse, posix, relative, resolve, win32 } from "node:path";

/**
 * 判断某一级路径的 realpath 是否仍是声明位置本身。
 * Windows 的 TEMP、用户目录常以 8.3 短名出现（如 `C:\Users\RUNNER~1`），realpath 会展开为长名；
 * 逐字比较会把长用户名机器上的正常路径误判为重定向。这里只接受「父目录与上一级已确认的
 * 真实路径相同、且本级名字相同或为短名」的情况，指向其他父目录的 junction 等重定向仍被拒绝。
 */
export function sameLocation(
  canonicalParent: string,
  segment: string,
  real: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const pathApi = platform === "win32" ? win32 : posix;
  const fold = (value: string) => (platform === "win32" ? value.toLowerCase() : value);
  if (fold(pathApi.dirname(real)) !== fold(canonicalParent)) return false;
  if (fold(pathApi.basename(real)) === fold(segment)) return true;
  return platform === "win32" && /^[^.~]{1,6}~\d+(?:\.[^.]{1,3})?$/i.test(segment);
}

/**
 * 只把 Windows 8.3 短名展开为长名，不跟随任何链接：遇到链接、缺失项或真实重定向即停止展开，
 * 其余部分原样保留，交给调用方原有的链接／重定向校验。POSIX 上原样返回。
 */
export async function expandShortNames(path: string): Promise<string> {
  if (process.platform !== "win32" || !isAbsolute(path)) return path;
  const absolute = resolve(path);
  const root = parse(absolute).root;
  const segments = relative(root, absolute).split(/[\\/]/).filter(Boolean);
  let canonical = root;
  for (const [index, segment] of segments.entries()) {
    const current = join(canonical, segment);
    const rest = segments.slice(index + 1);
    const info = await lstat(current).catch(() => null);
    if (!info || info.isSymbolicLink()) return join(current, ...rest);
    const real = await realpath(current);
    if (!sameLocation(canonical, segment, real)) return join(current, ...rest);
    canonical = real;
  }
  return canonical;
}
