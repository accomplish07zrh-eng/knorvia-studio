// SPDX-License-Identifier: Apache-2.0
// 回合内文件变更汇总（B23）。
// 回合级变更映射（路径 → 变更条目）由调用方按工具执行顺序写入：首次记录建条目，重复记录
// 累加写入计数与兜底行数、合并工具集合（累加是期望语义，不是重复副作用）。汇总时若已有
// 「改后内容」就用 diff 库按「改前 → 最后一次改后」重算增删行（5 秒超时），否则用累计的
// 兜底计数；结果按路径字典序排序并给出总增/删/文件数。空映射返回 undefined；diff 库超时
// 返回空 hunks 时退化为 0/0，不抛异常。
import { structuredPatch } from "diff";
import type { DiffHunk, TurnFileChangeSummary } from "../../deps.js";
import type { RuntimeTurnFileChangeEntry, RuntimeTurnFileChangeMap } from "../../types.js";

// diff 重算超时（毫秒）：拿不到 hunks 就退化 0/0。 //5s 上限，行为契约
const DIFF_TIMEOUT_MS = 5_000;
const DIFF_OPTIONS = { timeout: DIFF_TIMEOUT_MS };

// 增删行计数。
interface LineStat {
  additions: number;
  deletions: number;
}

// 一次写入的记录面：字段名是兼容接口（调用方按名传参）。
export interface TurnFileWriteRecord {
  afterContent?: /* 有值时汇总按「改前→改后」重算 */ string;
  beforeContent: /* 改前内容；新建文件记 null */ string | null;
  path: /* 变更文件路径 */ string;
  structuredPatch: /* 本次写入的补丁 hunks，兜底计数来源 */ DiffHunk[];
  toolName: /* 发起写入的工具名 */ string;
}

// 兜底行数：按补丁行前缀计，`+` 记增、`-` 记删（同一行只会命中一个前缀）。
function countHunkLines(hunks: DiffHunk[]): LineStat {
  const flat = hunks.flatMap((hunk) => hunk.lines);
  const totals = {
    additions: flat.filter((line) => line.startsWith("+")).length,
    deletions: flat.filter((line) => line.startsWith("-")).length,
  };
  return totals;
}

// 用 diff 库重算「改前 → 改后」的增删行；hunk 划分与该库实现一致（行为契约）。
function recountDiffLines(beforeText: string, afterText: string, pathLabel: string): LineStat {
  const patch = structuredPatch(
    pathLabel,
    pathLabel,
    beforeText,
    afterText,
    undefined,
    undefined,
    DIFF_OPTIONS,
  );
  return countHunkLines(patch?.hunks ?? []);
}

// 单条目的行数口径：有改后内容就重算，没有就用累计兜底。
function statForEntry(entry: RuntimeTurnFileChangeEntry): LineStat {
  if (entry.afterContent === undefined) {
    return { additions: entry.fallbackAdditions, deletions: entry.fallbackDeletions };
  }
  return recountDiffLines(entry.beforeContent ?? "", entry.afterContent, entry.path);
}

// 合并同路径的重复记录：计数累加、兜底行数累加、工具集合并入，改后内容取最后一次。
function mergeIntoEntry(
  entry: RuntimeTurnFileChangeEntry,
  write: TurnFileWriteRecord,
  tally: LineStat,
): void {
  entry.afterContent = write.afterContent ?? entry.afterContent;
  entry.fallbackAdditions += tally.additions;
  entry.fallbackDeletions += tally.deletions;
  entry.toolNames.add(write.toolName);
  entry.writeCount += 1;
}

export const recordTurnFileChange = (
  changes: RuntimeTurnFileChangeMap,
  write: TurnFileWriteRecord,
): void => {
  const tally = countHunkLines(write.structuredPatch);
  const current = changes.get(write.path);
  if (!current) {
    changes.set(write.path, {
      afterContent: write.afterContent,
      beforeContent: write.beforeContent,
      fallbackAdditions: tally.additions,
      fallbackDeletions: tally.deletions,
      path: write.path,
      toolNames: new Set([write.toolName]),
      writeCount: 1, // 首次记录：写入计数从 1 起
    });
    return; // 首次记录后收工
  }
  mergeIntoEntry(current, write, tally);
};

export const buildTurnFileChangeSummary = (
  changes: RuntimeTurnFileChangeMap,
): TurnFileChangeSummary | undefined => {
  const rows = Array.from(changes.values(), (source) => {
    const lines = statForEntry(source);
    const item = {
      additions: lines.additions,
      deletions: lines.deletions,
      path: source.path,
      toolNames: [...source.toolNames].sort(),
      writeCount: source.writeCount,
    };
    return item;
  });
  if (rows.length === 0) return undefined;

  rows.sort((left, right) => left.path.localeCompare(right.path));
  const summary = {
    additions: rows.reduce((sum, item) => sum + item.additions, 0),
    deletions: rows.reduce((sum, item) => sum + item.deletions, 0),
    files: rows.length,
    items: rows,
  };
  return summary;
};
