// Exact UTF-16 distance, distinct from the Read suggestion threshold predicate.
export function editLineDistance(left: string, right: string): number {
  let start = 0;
  let leftEnd = left.length,
    rightEnd = right.length;
  while (start < leftEnd && start < rightEnd && left.charCodeAt(start) === right.charCodeAt(start))
    start++;
  while (
    leftEnd > start &&
    rightEnd > start &&
    left.charCodeAt(leftEnd - 1) === right.charCodeAt(rightEnd - 1)
  ) {
    leftEnd--;
    rightEnd--;
  }
  let a = left.slice(start, leftEnd),
    b = right.slice(start, rightEnd);
  if (a.length < b.length) {
    const swap = a;
    a = b;
    b = swap;
  }
  if (!b.length) return a.length;
  const row = new Uint32Array(b.length + 1);
  for (let column = 0; column < row.length; column++) row[column] = column;
  for (let index = 0; index < a.length; index++) {
    let diagonal = row[0]!;
    row[0] = index + 1;
    for (let column = 1; column <= b.length; column++) {
      const above = row[column]!;
      row[column] = Math.min(
        above + 1,
        row[column - 1]! + 1,
        diagonal + (a.charCodeAt(index) === b.charCodeAt(column - 1) ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return row[b.length]!;
}
