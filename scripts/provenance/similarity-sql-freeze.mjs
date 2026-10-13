// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 冻结 SQL 清单解析：从 schema.md 里按「文件 + 代码块」收集必须逐字节保留的 SQL 行。
//
// 清单格式（与 interface.md 同思路）：
//   ### `path/to/file.ts`
//   ```sql
//   <逐字保留的 SQL 行>
//   ```
// 计分时按「精确行匹配」剔除这些行；剔除只影响计分，不改动候选文件。

/** 解析 markdown：返回 文件路径 → 冻结行集合（按 trimEnd 归一，忽略行尾空白差异）。 */
export function extractFrozenSqlLines(markdownText) {
  const byFile = new Map();
  let currentFile = null;
  let inBlock = false;
  for (const rawLine of markdownText.split(/\r?\n/u)) {
    const heading = /^#{2,4}\s+`?([^`\s]+)`?\s*$/u.exec(rawLine.trim());
    if (heading) {
      currentFile = heading[1];
      continue;
    }
    if (rawLine.trim().startsWith("```")) {
      if (inBlock) {
        inBlock = false;
        continue;
      }
      const info = rawLine.trim().slice(3).trim().toLowerCase();
      inBlock = info === "sql" && currentFile !== null;
      continue;
    }
    if (!inBlock || currentFile === null) continue;
    const line = rawLine.trimEnd();
    if (line.trim().length === 0) continue;
    const set = byFile.get(currentFile) ?? new Set();
    set.add(line);
    byFile.set(currentFile, set);
  }
  return byFile;
}

/** 合并多个清单文件的结果。 */
export function mergeFrozenSqlLines(parsedList) {
  const merged = new Map();
  for (const parsed of parsedList) {
    for (const [file, lines] of parsed) {
      const set = merged.get(file) ?? new Set();
      for (const line of lines) set.add(line);
      merged.set(file, set);
    }
  }
  return merged;
}

/**
 * 按清单剔除候选文件里的冻结 SQL 行（精确行匹配）。
 * 返回剔除后的文本与被剔除的行数。
 */
export function stripFrozenSqlLines(text, frozenLines) {
  if (!frozenLines || frozenLines.size === 0) return { text, strippedLines: 0 };
  const kept = [];
  let stripped = 0;
  for (const line of text.split(/\r?\n/u)) {
    if (frozenLines.has(line.trimEnd())) {
      stripped += 1;
      continue;
    }
    kept.push(line);
  }
  return { text: kept.join("\n"), strippedLines: stripped };
}
