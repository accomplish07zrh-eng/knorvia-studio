// SPDX-License-Identifier: Apache-2.0

import type { WorkspaceFileEntry } from "./protocol.js";

// 工作区文件列表单批次序列化大小上限（4MB 字符量级）
export const WORKSPACE_FILE_ENTRIES_CHUNK_SIZE = 4_000_000;

// 特殊字符转义与逆转义映射
const PROTOCOL_ESCAPE_TABLE = {
  "\\": "\\\\",
  "\t": "\\t",
  "\n": "\\n",
} as const;

const PROTOCOL_RESTORE_TABLE = {
  "\\": "\\",
  t: "\t",
  n: "\n",
} as const;

// 针对相对路径内反斜杠、制表符与换行符进行转义保护
function escapeProtocolRelativePath(sourceText: string): string {
  return sourceText.replace(/[\\\t\n]/g, (char) => PROTOCOL_ESCAPE_TABLE[char as keyof typeof PROTOCOL_ESCAPE_TABLE] ?? char);
}

// 还原经由 escapeProtocolRelativePath 编码的特殊字符
function restoreProtocolRelativePath(encodedText: string): string {
  return encodedText.replace(/\\(.)/g, (_seq, symbol: string) => PROTOCOL_RESTORE_TABLE[symbol as keyof typeof PROTOCOL_RESTORE_TABLE] ?? symbol);
}

// 将文件条目数组打包成制表符与换行符连接的扁平字符串（行格式：<type>\t<escapedRelativePath>）
export function packWorkspaceFileEntries(entries: WorkspaceFileEntry[]): string {
  return entries
    .map((record) => `${record.type}\t${escapeProtocolRelativePath(record.relativePath)}`)
    .join("\n");
}

// 从编码文本还原工作区文件条目列表
export function unpackWorkspaceFileEntries(
  packed: string,
  rootPath: string,
): WorkspaceFileEntry[] {
  if (!packed) {
    return /* 空数据直接返回空数组 */ [];
  }

  const isWindowsCwd = rootPath.includes("\\");
  const pathSep = isWindowsCwd ? "\\" : "/";
  const directoryPrefix =
    rootPath.endsWith("/") || rootPath.endsWith("\\") ? rootPath : `${rootPath}${pathSep}`;

  const rows = packed.split("\n");
  const parsedEntries: WorkspaceFileEntry[] = [];

  for (const rawLine of rows) {
    if (!rawLine) {
      continue;
    }

    const tabOffset = rawLine.indexOf("\t");
    if (tabOffset === -1) {
      continue;
    }

    const kindText = rawLine.slice(0, tabOffset);
    const decodedRel = restoreProtocolRelativePath(rawLine.slice(tabOffset + 1));
    const finalSlash = decodedRel.lastIndexOf("/");
    const displayName = finalSlash === -1 ? decodedRel : decodedRel.slice(finalSlash + 1);

    const crossPlatformPath = isWindowsCwd ? decodedRel.split("/").join("\\") : decodedRel;

    parsedEntries.push({
      name: displayName,
      path: `${directoryPrefix}${crossPlatformPath}`,
      relativePath: decodedRel,
      type: kindText === "directory" ? "directory" : "file",
    });
  }

  return parsedEntries;
}
