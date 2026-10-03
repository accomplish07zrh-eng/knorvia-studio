export interface LineChangeStat {
  added: number;
  removed: number;
}

function logicalLines(content: string | null): string[] {
  if (!content) {
    return [];
  }

  const lines = content.split("\n");
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

export function computeLineChangeStat(
  beforeContent: string | null,
  afterContent: string,
): LineChangeStat {
  const before = logicalLines(beforeContent);
  const after = logicalLines(afterContent);
  let start = 0;
  let beforeEnd = before.length;
  let afterEnd = after.length;

  while (start < beforeEnd && start < afterEnd && before[start] === after[start]) {
    start += 1;
  }
  while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  const removedSpan = beforeEnd - start;
  const addedSpan = afterEnd - start;
  if (removedSpan === 0) {
    return { added: addedSpan, removed: 0 };
  }
  if (addedSpan === 0) {
    return { added: 0, removed: removedSpan };
  }

  // 先排除相同首尾，再限制比较量；超大变更保守计数，避免阻塞界面。
  if (removedSpan * addedSpan > 400000) {
    return { added: addedSpan, removed: removedSpan };
  }

  // 卡片与汇总共用真实增删行数：有序公共行不计入变更，重复行按出现次数匹配。
  // 每轮仅保留一个动态规划行，左上角的旧值由局部变量携带。
  const matches = Array.from({ length: addedSpan + 1 }, () => 0);
  for (let row = 0; row < removedSpan; row += 1) {
    let diagonal = 0;
    for (let column = 1; column <= addedSpan; column += 1) {
      const previousRow = matches[column]!;
      if (before[start + row] === after[start + column - 1]) {
        matches[column] = diagonal + 1;
      } else {
        matches[column] = Math.max(previousRow, matches[column - 1]!);
      }
      diagonal = previousRow;
    }
  }

  const sharedCount = matches[addedSpan] ?? 0;
  return {
    added: addedSpan - sharedCount,
    removed: removedSpan - sharedCount,
  };
}
