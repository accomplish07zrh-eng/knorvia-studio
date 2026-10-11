// SPDX-License-Identifier: Apache-2.0
// 命令目录扫描：显式栈 DFS（帧对象）+ 根校验；深度上限与符号链接规则在这里收口。
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CustomCommandDiagnostic } from "@knorvia/contracts";
import { warnInvalid } from "./diagnostics.js";

const MAX_DEPTH = 12;
const SCAN_FAILED = "custom_command_scan_failed";
const ROOT_FALLBACK = "Failed to scan command root: ";
const DIRECTORY_FALLBACK = "Failed to scan command directory: ";

interface DirectoryFrame {
  entries: Awaited<ReturnType<typeof readdir>>;
  position: number;
  depth: number;
  path: string;
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function describe(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function filesUnderRoot(
  rootPath: string,
  diagnostics: CustomCommandDiagnostic[],
): Promise<string[]> {
  const rootInfo = await stat(rootPath).catch((error: unknown) => {
    if (!isMissing(error)) {
      warnInvalid(diagnostics, SCAN_FAILED, rootPath, describe(error, ROOT_FALLBACK + rootPath));
    }
    return undefined;
  });
  if (rootInfo === undefined || !rootInfo.isDirectory()) return [];

  const rootEntries = await readdir(rootPath, { withFileTypes: true }).catch((error: unknown) => {
    warnInvalid(diagnostics, SCAN_FAILED, rootPath, describe(error, DIRECTORY_FALLBACK + rootPath));
    return undefined;
  });
  if (rootEntries === undefined) return [];

  const found: string[] = [];
  const stack: DirectoryFrame[] = [{ depth: 0, entries: rootEntries, path: rootPath, position: 0 }];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    if (frame.position >= frame.entries.length) {
      stack.pop();
      continue;
    }
    const entry = frame.entries[frame.position++]!;
    const absolute = resolve(join(frame.path, entry.name));
    const linkInfo = entry.isSymbolicLink()
      ? await stat(absolute).catch(() => undefined)
      : undefined;
    const isDirectory = linkInfo?.isDirectory() ?? entry.isDirectory();
    const isFile = linkInfo?.isFile() ?? entry.isFile();
    if (isDirectory) {
      if (frame.depth + 1 > MAX_DEPTH) continue;
      const entries = await readdir(absolute, { withFileTypes: true }).catch((error: unknown) => {
        warnInvalid(
          diagnostics,
          SCAN_FAILED,
          absolute,
          describe(error, DIRECTORY_FALLBACK + absolute),
        );
        return undefined;
      });
      if (entries !== undefined)
        stack.push({ depth: frame.depth + 1, entries, path: absolute, position: 0 });
      continue;
    }
    if (isFile && entry.name.toLowerCase().endsWith(".md")) found.push(absolute);
  }
  return found;
}
