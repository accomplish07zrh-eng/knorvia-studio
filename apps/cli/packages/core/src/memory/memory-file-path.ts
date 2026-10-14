import { isAbsolute, relative } from "node:path";
import { resolveWorkspacePath } from "../tool/path-policy.js";

// 记忆目录里不允许出现的路径段：版本库内部目录、工具链缓存、以及本产品自己的草稿/技能目录。
// 用空格分隔的清单一次声明，判段时按小写比较（Windows 大小写不敏感）。
const protectedSegments = new Set(
  ".git hooks .husky .githooks node_modules .vscode .idea head config objects refs .knorvia-studio skills commands agents .cargo .devcontainer .yarn .mvn".split(
    " ",
  ),
);
// 判段前先剥掉不可见控制字符（零宽、方向控制、BOM），再砍掉 NTFS 数据流冒号后的部分，
// 最后去掉尾随的点与空格——Windows 上 "git." 与 "git " 指向同一个目录名。
const invisibleSegmentChars = /[\u200c-\u200f\u202a-\u202e\u206a-\u206f\ufeff]/gu;
const trailingDotsOrSpaces = /[. ]+$/u;

export function resolveContainedMemoryFilePath(input: {
  filePath: string;
  rootDir: string;
  workingDirectory: string;
  workspaceRoot: string;
}): string | undefined {
  const resolved = resolveWorkspacePath({
    inputPath: input.filePath,
    operation: "write",
    workingDirectory: input.workingDirectory,
    workspaceRoot: input.workspaceRoot,
  });
  return memoryFileRelativePath(input.rootDir, resolved) === undefined ? undefined : resolved;
}

export function resolveSafeMemoryFilePath(input: {
  filePath: string;
  rootDir: string;
  workingDirectory: string;
  workspaceRoot: string;
}): string | undefined {
  const resolved = resolveContainedMemoryFilePath(input);
  if (!resolved) return undefined;

  const localPath = memoryFileRelativePath(input.rootDir, resolved);
  if (localPath === undefined) return undefined;

  if (hasProtectedSegment(localPath)) return undefined;
  return resolved;
}

// 相对路径必须真的落在 rootDir 之内：空串、父目录本身、以 .. 开头、或跨盘符（relative 返回绝对路径）都判否。
export function memoryFileRelativePath(rootDir: string, filePath: string): string | undefined {
  const localPath = relative(rootDir, filePath);
  if (isOutsideRoot(localPath)) return undefined;
  return localPath;
}

function isOutsideRoot(localPath: string): boolean {
  if (localPath === "" || localPath === "..") return true;
  if (localPath.startsWith("../") || localPath.startsWith("..\\")) return true;
  return isAbsolute(localPath);
}

// 逐段检查保护名单；命中任意一段即判否。
function hasProtectedSegment(localPath: string): boolean {
  for (const segment of localPath.split(/[\\/]+/u)) {
    const normalized = normalizeSegment(segment);
    if (protectedSegments.has(normalized)) return true;
  }
  return false;
}

function normalizeSegment(segment: string): string {
  const lowered = segment.toLowerCase().replace(invisibleSegmentChars, "");
  const beforeColon = lowered.split(":", 1)[0] ?? "";
  return beforeColon.replace(trailingDotsOrSpaces, "");
}
