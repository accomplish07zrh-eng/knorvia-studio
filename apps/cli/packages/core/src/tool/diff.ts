// SPDX-License-Identifier: Apache-2.0
// 结构化补丁：把两份文本变成 hunk，并统计增删行数。
//
// 上下文行数与超时是模块级常量：调用点只给内容，不再各自决定补丁参数。
// 统计按行首字符分类，类别集中在一张表里，新增类别只改表。

import { structuredPatch } from "diff";
import type { DiffHunk } from "@knorvia/contracts";

const HUNK_CONTEXT_LINES = 3;
const PATCH_TIMEOUT_MS = 5_000;

interface PatchLineKind {
  readonly prefix: string;
  readonly counter: "additions" | "deletions";
}

const PATCH_LINE_KINDS: readonly PatchLineKind[] = [
  { prefix: "+", counter: "additions" },
  { prefix: "-", counter: "deletions" },
];

interface StructuredPatchInput {
  filePath: string;
  newContent: string;
  oldContent: string;
}

export const createStructuredPatch = (input: StructuredPatchInput): DiffHunk[] => {
  const { filePath, newContent, oldContent } = input;
  const patchOptions = { context: HUNK_CONTEXT_LINES, timeout: PATCH_TIMEOUT_MS };
  const from = oldContent;
  const to = newContent;
  // diff 库的旧版签名需要重复文件名的两个位置参数，这里沿用同一名字。
  const patch = structuredPatch(filePath, filePath, from, to, undefined, undefined, patchOptions);
  const hunks = patch?.hunks;
  return hunks ?? [];
};

export const countPatchLines = (hunks: DiffHunk[]): { additions: number; deletions: number } => {
  const tally = { additions: 0, deletions: 0 };
  const lines = hunks.flatMap((hunk) => hunk.lines);
  for (const line of lines) {
    const kind = PATCH_LINE_KINDS.find((entry) => line.startsWith(entry.prefix));
    if (kind) tally[kind.counter] += 1;
  }
  return tally;
};
