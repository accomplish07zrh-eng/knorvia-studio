// Bounded filename suggestions; specs/knorvia-read-file-suggestion.md.
// Existing source exposure and repository transition licence remain recorded.
import { basename, dirname, extname } from "node:path";
import type { TraceContext } from "@knorvia/contracts";
import type { ToolExecutionContext } from "../types.js";

const MAX_EDITS = 3;
const TOO_FAR = MAX_EDITS + 1;
const BAND_WIDTH = MAX_EDITS * 2 + 1;

/** UTF-16 edit-distance predicate; work and memory are bounded to the admissible band. */
export function withinReadSuggestionDistance(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > MAX_EDITS) return false;
  let previous = new Uint8Array(BAND_WIDTH).fill(TOO_FAR);
  let current = new Uint8Array(BAND_WIDTH).fill(TOO_FAR);
  let lower = 0;
  let upper = Math.min(right.length, MAX_EDITS);
  for (let column = lower; column <= upper; column++) previous[column] = column;
  for (let row = 1; row <= left.length; row++) {
    const nextLower = Math.max(0, row - MAX_EDITS);
    const nextUpper = Math.min(right.length, row + MAX_EDITS);
    current.fill(TOO_FAR);
    let minimum = TOO_FAR;
    for (let column = nextLower; column <= nextUpper; column++) {
      const index = column - nextLower;
      const above = column >= lower && column <= upper ? previous[column - lower]! : TOO_FAR;
      const diagonal =
        column - 1 >= lower && column - 1 <= upper ? previous[column - 1 - lower]! : TOO_FAR;
      const beside = index > 0 ? current[index - 1]! : TOO_FAR;
      const value =
        column === 0
          ? row
          : Math.min(
              TOO_FAR,
              above + 1,
              beside + 1,
              diagonal + (left.charCodeAt(row - 1) === right.charCodeAt(column - 1) ? 0 : 1),
            );
      current[index] = value;
      minimum = Math.min(minimum, value);
    }
    if (minimum > MAX_EDITS) return false;
    const swap = previous;
    previous = current;
    current = swap;
    lower = nextLower;
    upper = nextUpper;
  }
  return previous[right.length - lower]! <= MAX_EDITS;
}

export async function findReadFileSuggestion(
  filePath: string,
  context: ToolExecutionContext,
): Promise<string | undefined> {
  const port = context.fileSystemPort;
  if (!port) return undefined;
  try {
    const target = basename(filePath);
    const stem = basename(filePath, extname(filePath));
    const trace = {
      traceId: context.traceId,
      spanId: context.spanId,
      parentSpanId: context.parentSpanId,
      sessionId: context.sessionId,
      turnId: context.turnId,
    } as unknown as TraceContext;
    const listing = await port.listDirectory(
      { path: dirname(filePath), trace },
      { signal: context.abortSignal },
    );
    const names = listing.entries
      .filter((entry) => entry.kind === "file" || entry.kind === "symlink")
      .map((entry) => entry.name)
      .filter((name) => name !== target)
      .sort();
    const sameStem = names.find((name) => basename(name, extname(name)) === stem);
    // 必须先遍历所有同 stem 候选，再按字典序找距离<=3；不能误改成“最近一个”。
    return sameStem || names.find((name) => withinReadSuggestionDistance(name, target));
  } catch {
    // 建议只是原 not_found 的补充，列目录/取消错误不能盖掉读取的原始原因。
    return undefined;
  }
}
