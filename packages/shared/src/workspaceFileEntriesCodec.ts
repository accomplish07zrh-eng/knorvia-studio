// SPDX-License-Identifier: Apache-2.0

import type { WorkspaceFileEntry } from "./protocol.js";

// 单次通信传输的文件条目文本块大小上限（4MB）
export const WORKSPACE_FILE_ENTRIES_CHUNK_SIZE = 4_000_000;

// 制表符分隔协议中的特殊字符转义表
const ESCAPES: Record<string, string> = {
  "\\": "\\\\",
  "\t": "\\t",
  "\n": "\\n",
};

const UNESCAPES: Record<string, string> = {
  "\\": "\\",
  t: "\t",
  n: "\n",
};

function encodePath(rawPath: string): string {
  return rawPath.replace(/[\\\t\n]/g, (char) => ESCAPES[char] ?? char);
}

function decodePath(escapedPath: string): string {
  return escapedPath.replace(/\\(.)/g, (_full, char: string) => UNESCAPES[char] ?? char);
}

// 格式化一条记录为 TSV 行
function serializeEntry(entry: WorkspaceFileEntry): string {
  return `${entry.type}\t${encodePath(entry.relativePath)}`;
}

export function packWorkspaceFileEntries(entries: WorkspaceFileEntry[]): string {
  return entries.map(serializeEntry).join("\n");
}

function normalizeRootPrefix(rootPath: string, sep: string): string {
  if (rootPath.endsWith("/") || rootPath.endsWith("\\")) {
    return rootPath;
  }
  return `${rootPath}${sep}`;
}

function resolveLeafName(relativePath: string): string {
  const lastSlash = relativePath.lastIndexOf("/");
  if (lastSlash < 0) {
    return relativePath;
  }
  return relativePath.slice(lastSlash + 1);
}

export function unpackWorkspaceFileEntries(packed: string, rootPath: string): WorkspaceFileEntry[] {
  if (!packed) {
    return [];
  }

  const isWindows = rootPath.includes("\\");
  const sep = isWindows ? "\\" : "/";
  const prefix = normalizeRootPrefix(rootPath, sep);

  const lines = packed.split("\n");
  const result: WorkspaceFileEntry[] = [];

  for (const line of lines) {
    if (!line) {
      continue;
    }
    const tabIndex = line.indexOf("\t");
    if (tabIndex < 0) {
      continue;
    }

    const typeStr = line.slice(0, tabIndex);
    const relPath = decodePath(line.slice(tabIndex + 1));
    const fullSubPath = isWindows ? relPath.split("/").join("\\") : relPath;

    result.push({
      name: resolveLeafName(relPath),
      path: `${prefix}${fullSubPath}`,
      relativePath: relPath,
      type: typeStr === "directory" ? "directory" : "file",
    });
  }

  return result;
}
