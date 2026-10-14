// SPDX-License-Identifier: Apache-2.0
// 两个字符串的精确 UTF-16 编辑距离（插入、删除、替换各计 1）。纯函数。
// 与 Read 建议阈值的判定无关：这里只算距离，不做阈值比较。

function sharedPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left.charCodeAt(index) === right.charCodeAt(index)) index += 1;
  return index;
}

function sharedSuffixLength(left: string, right: string, prefixLength: number): number {
  const limit = Math.min(left.length, right.length) - prefixLength;
  let index = 0;
  while (
    index < limit &&
    left.charCodeAt(left.length - 1 - index) === right.charCodeAt(right.length - 1 - index)
  ) {
    index += 1;
  }
  return index;
}

// 两行滚动的编辑距离：previous 是上一行，current 是正在填的一行。
function middleEditDistance(longer: string, shorter: string): number {
  const width = shorter.length;
  if (width === 0) return longer.length;

  let previous = new Uint32Array(width + 1);
  let current = new Uint32Array(width + 1);
  for (let column = 0; column <= width; column += 1) previous[column] = column;

  for (let row = 1; row <= longer.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= width; column += 1) {
      const substitution = longer.charCodeAt(row - 1) === shorter.charCodeAt(column - 1) ? 0 : 1;
      current[column] = Math.min(
        previous[column]! + 1,
        current[column - 1]! + 1,
        previous[column - 1]! + substitution,
      );
    }
    const recycled = previous;
    previous = current;
    current = recycled;
  }
  return previous[width]!;
}

export function editLineDistance(left: string, right: string): number {
  const prefixLength = sharedPrefixLength(left, right);
  const suffixLength = sharedSuffixLength(left, right, prefixLength);
  const leftMiddle = left.slice(prefixLength, left.length - suffixLength);
  const rightMiddle = right.slice(prefixLength, right.length - suffixLength);
  return leftMiddle.length >= rightMiddle.length
    ? middleEditDistance(leftMiddle, rightMiddle)
    : middleEditDistance(rightMiddle, leftMiddle);
}
