// SPDX-License-Identifier: Apache-2.0
// 命令目录扫描：根校验 + 递归枚举（深度上限、符号链接、大小写不敏感的 .md）。
import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { CustomCommandDiagnostic } from "@knorvia/contracts";
import { warnInvalid } from "./diagnostics.js";

const MAX_DEPTH = 12;
const SCAN_FAILED = "custom_command_scan_failed";
const ROOT_FALLBACK = "Failed to scan command root: ";
const DIRECTORY_FALLBACK = "Failed to scan command directory: ";

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function reason(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function enumerate(
  directory: string,
  depth: number,
  diagnostics: CustomCommandDiagnostic[],
): Promise<string[]> {
  if (depth > MAX_DEPTH) return [];
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    warnInvalid(diagnostics, {
      code: SCAN_FAILED,
      message: reason(error, DIRECTORY_FALLBACK + directory),
      path: directory,
    });
    return undefined;
  });
  if (entries === undefined) return [];

  const files: string[] = [];
  for (const entry of entries) {
    const absolute = resolve(directory, entry.name);
    const linkTarget = entry.isSymbolicLink()
      ? await stat(absolute).catch(() => undefined)
      : undefined;
    if (entry.isSymbolicLink() && linkTarget === undefined) continue;
    const isDirectory = linkTarget?.isDirectory() ?? entry.isDirectory();
    const isFile = linkTarget?.isFile() ?? entry.isFile();
    if (isDirectory) files.push(...(await enumerate(absolute, depth + 1, diagnostics)));
    else if (isFile && entry.name.toLowerCase().endsWith(".md")) files.push(absolute);
  }
  return files;
}

export async function filesUnderRoot(
  rootPath: string,
  diagnostics: CustomCommandDiagnostic[],
): Promise<string[]> {
  const info = await stat(rootPath).catch((error: unknown) => {
    if (!isMissing(error)) {
      warnInvalid(diagnostics, {
        code: SCAN_FAILED,
        message: reason(error, ROOT_FALLBACK + rootPath),
        path: rootPath,
      });
    }
    return undefined;
  });
  if (info === undefined || !info.isDirectory()) return [];
  return await enumerate(rootPath, 0, diagnostics);
}
