// SPDX-License-Identifier: Apache-2.0
// Source-exposed independent candidate, 2026-10-03; @pierre/diffs and prior notices remain.
import { trimPatchContext } from "@pierre/diffs";

const MAX_DIFF_LCS_CELLS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function findStringField(value: unknown, keys: readonly string[]): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return undefined;
}

export function extractBeforeAfter(value: unknown): { before: string; after: string } | null {
  if (!isRecord(value)) {
    return null;
  }

  const before = findStringField(value, ["before", "old_string", "oldText", "oldContent"]);
  const after = findStringField(value, ["after", "new_string", "newText", "newContent"]);
  if (before !== undefined && after !== undefined) {
    return { before, after };
  }

  return null;
}

function* structuredDiffInputs(value: unknown): Generator<unknown> {
  yield value;
  // 直接 diff 被接受后不会读取 content；仅其无效时继续按原数组顺序适配。
  if (isRecord(value) && Array.isArray(value.content)) yield* value.content;
}

export function extractStructuredDiff(
  value: unknown,
): { path?: string; oldText: string; newText: string } | null {
  for (const entry of structuredDiffInputs(value)) {
    if (!isRecord(entry) || entry.type !== "diff" || typeof entry.newText !== "string") continue;
    return {
      path: typeof entry.path === "string" && entry.path.trim() ? entry.path : undefined,
      oldText: entry.oldText == null ? "" : String(entry.oldText),
      newText: entry.newText,
    };
  }
  return null;
}

interface DiffSegment {
  kind: "segment";
  beforeStart: number;
  beforeEnd: number;
  afterStart: number;
  afterEnd: number;
}

interface LineMatch {
  beforeIndex: number;
  afterIndex: number;
}

type DiffWork = DiffSegment | { kind: "equal"; line: string };

function uniquePositions(
  lines: readonly string[],
  start: number,
  end: number,
): Map<string, number> {
  const positions = new Map<string, number>();
  for (let index = start; index < end; index += 1) {
    const line = lines[index]!;
    positions.set(line, positions.has(line) ? -1 : index);
  }
  return positions;
}

/** 双方仅出现一次的行是候选，严格递增的 after 坐标保证锚点不能交叉。 */
function segmentAnchors(
  before: readonly string[],
  after: readonly string[],
  segment: DiffSegment,
): LineMatch[] {
  const left = uniquePositions(before, segment.beforeStart, segment.beforeEnd);
  const right = uniquePositions(after, segment.afterStart, segment.afterEnd);
  const candidates: LineMatch[] = [];
  for (const [line, beforeIndex] of left) {
    const afterIndex = right.get(line);
    if (beforeIndex >= 0 && afterIndex !== undefined && afterIndex >= 0) {
      candidates.push({ beforeIndex, afterIndex });
    }
  }
  const chain = new Int32Array(candidates.length).fill(-1);
  const ends: number[] = [];
  candidates.forEach((candidate, index) => {
    let low = 0;
    let high = ends.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (candidates[ends[mid]!]!.afterIndex < candidate.afterIndex) low = mid + 1;
      else high = mid;
    }
    chain[index] = low === 0 ? -1 : ends[low - 1]!;
    ends[low] = index;
  });
  const result: LineMatch[] = [];
  for (let index = ends.at(-1) ?? -1; index >= 0; index = chain[index]!) {
    result.push(candidates[index]!);
  }
  return result.reverse();
}

function appendSegmentWithLcs(
  output: string[],
  before: readonly string[],
  after: readonly string[],
  segment: DiffSegment,
): void {
  const rows = segment.beforeEnd - segment.beforeStart;
  const columns = segment.afterEnd - segment.afterStart;
  const stride = columns + 1;
  const suffixScores = new Uint32Array((rows + 1) * stride);
  for (let row = rows - 1; row >= 0; row -= 1) {
    const base = row * stride;
    for (let column = columns - 1; column >= 0; column -= 1) {
      suffixScores[base + column] =
        before[segment.beforeStart + row] === after[segment.afterStart + column]
          ? suffixScores[base + stride + column + 1]! + 1
          : Math.max(suffixScores[base + stride + column]!, suffixScores[base + column + 1]!);
    }
  }
  let row = 0;
  let column = 0;
  while (row < rows || column < columns) {
    if (
      row < rows &&
      column < columns &&
      before[segment.beforeStart + row] === after[segment.afterStart + column]
    ) {
      output.push(` ${before[segment.beforeStart + row]}`);
      row += 1;
      column += 1;
    } else if (
      column < columns &&
      (row === rows ||
        suffixScores[row * stride + column + 1]! >= suffixScores[(row + 1) * stride + column]!)
    ) {
      // 相同 LCS score 时先添加，保留已保存 patch 的行序与预览语义。
      output.push(`+${after[segment.afterStart + column]}`);
      column += 1;
    } else {
      output.push(`-${before[segment.beforeStart + row]}`);
      row += 1;
    }
  }
}

function appendDiffSegments(
  output: string[],
  before: readonly string[],
  after: readonly string[],
  initial: DiffSegment,
): void {
  const pending: DiffWork[] = [initial];
  while (pending.length) {
    const work = pending.pop()!;
    if (work.kind === "equal") {
      output.push(` ${work.line}`);
      continue;
    }
    const leftCount = work.beforeEnd - work.beforeStart;
    const rightCount = work.afterEnd - work.afterStart;
    if (leftCount === 0 || rightCount === 0) {
      for (let index = work.beforeStart; index < work.beforeEnd; index += 1)
        output.push(`-${before[index]}`);
      for (let index = work.afterStart; index < work.afterEnd; index += 1)
        output.push(`+${after[index]}`);
      continue;
    }
    if (leftCount * rightCount <= MAX_DIFF_LCS_CELLS) {
      appendSegmentWithLcs(output, before, after, work);
      continue;
    }
    const anchors = segmentAnchors(before, after, work);
    if (!anchors.length) {
      // 大区间没有稳定唯一行时才能退化；不能把远隔的两个小改动涂成整页红绿。
      for (let index = work.beforeStart; index < work.beforeEnd; index += 1)
        output.push(`-${before[index]}`);
      for (let index = work.afterStart; index < work.afterEnd; index += 1)
        output.push(`+${after[index]}`);
      continue;
    }
    let beforeStart = work.beforeStart;
    let afterStart = work.afterStart;
    const ordered: DiffWork[] = [];
    for (const anchor of anchors) {
      ordered.push({
        kind: "segment",
        beforeStart,
        afterStart,
        beforeEnd: anchor.beforeIndex,
        afterEnd: anchor.afterIndex,
      });
      ordered.push({ kind: "equal", line: before[anchor.beforeIndex]! });
      beforeStart = anchor.beforeIndex + 1;
      afterStart = anchor.afterIndex + 1;
    }
    ordered.push({ ...work, beforeStart, afterStart });
    // 显式 work stack 保持左到右输出，不复制行数组或增加递归 owner。
    for (let index = ordered.length - 1; index >= 0; index -= 1) pending.push(ordered[index]!);
  }
}

function changedWindow(before: readonly string[], after: readonly string[]): DiffSegment {
  let start = 0;
  const sharedLength = Math.min(before.length, after.length);
  while (start < sharedLength && before[start] === after[start]) start += 1;
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  return { kind: "segment", beforeStart: start, afterStart: start, beforeEnd, afterEnd };
}

function patchRange(start: number, count: number): string {
  return `${count === 0 ? start : start + 1},${count}`;
}

export function buildUnifiedDiff(
  before: string,
  after: string,
  fileLabel: string,
  options?: { contextLines?: number },
): string | null {
  const left = before === "" ? [] : before.split("\n");
  const right = after === "" ? [] : after.split("\n");
  const requestedContext = options?.contextLines;
  const limited =
    typeof requestedContext === "number" &&
    Number.isFinite(requestedContext) &&
    requestedContext >= 0;
  const context = limited ? Math.floor(requestedContext) : Infinity;
  const changed = changedWindow(left, right);
  const prefix = Math.min(context, changed.beforeStart);
  const suffix = Math.min(context, left.length - changed.beforeEnd);
  const start = changed.beforeStart - prefix;
  const oldCount = prefix + changed.beforeEnd - changed.beforeStart + suffix;
  const newCount = prefix + changed.afterEnd - changed.afterStart + suffix;
  const output = [
    // Git 边界防止删除 SQL 的 -- 注释被 @pierre/diffs 当成第二个文件头。
    `diff --git a/${fileLabel} b/${fileLabel}`,
    left.length === 0 && right.length > 0 ? "--- /dev/null" : `--- a/${fileLabel}`,
    right.length === 0 && left.length > 0 ? "+++ /dev/null" : `+++ b/${fileLabel}`,
    `@@ -${patchRange(start, oldCount)} +${patchRange(start, newCount)} @@`,
  ];
  // 先选可见上下文窗口，再交现有第三方规整 hunk，避免拼接整份公共边缘。
  for (let index = start; index < changed.beforeStart; index += 1) output.push(` ${left[index]}`);
  appendDiffSegments(output, left, right, changed);
  for (let index = changed.beforeEnd; index < changed.beforeEnd + suffix; index += 1)
    output.push(` ${left[index]}`);
  const patch = output.join("\n");
  return limited ? trimPatchContext(patch, context) : patch;
}
