import { isAbsolute, relative } from "node:path";
import { resolveWorkspacePath } from "../tool/path-policy.js";

const protectedSegments = new Set([
  ".git",
  "hooks",
  ".husky",
  ".githooks",
  "node_modules",
  ".vscode",
  ".idea",
  "head",
  "config",
  "objects",
  "refs",
  ".knorvia-studio",
  "skills",
  "commands",
  "agents",
  ".cargo",
  ".devcontainer",
  ".yarn",
  ".mvn",
]);

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
  return memoryFileRelativePath(input.rootDir, resolved) === undefined
    ? undefined
    : resolved;
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

  for (const segment of localPath.split(/[\\/]+/u)) {
    const beforeColon = segment
      .toLowerCase()
      .replace(/[\u200c-\u200f\u202a-\u202e\u206a-\u206f\ufeff]/gu, "")
      .split(":", 1)[0] ?? "";
    const comparison = beforeColon.replace(/[. ]+$/u, "");
    if (protectedSegments.has(comparison)) return undefined;
  }
  return resolved;
}

export function memoryFileRelativePath(
  rootDir: string,
  filePath: string,
): string | undefined {
  const localPath = relative(rootDir, filePath);
  if (
    localPath === "" ||
    localPath === ".." ||
    localPath.startsWith("../") ||
    localPath.startsWith("..\\") ||
    isAbsolute(localPath)
  ) {
    return undefined;
  }
  return localPath;
}
