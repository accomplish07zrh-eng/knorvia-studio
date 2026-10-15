// SPDX-License-Identifier: Apache-2.0
// read-state 效果的辅助件：trace 构造、mtime 读取、过期提示文案、
// 记录组装与「哪些结果不参与效果」的统一裁决。
import type { BashOutput, FileSystemStatResult, TraceContext } from "@knorvia/contracts";
import { relative } from "node:path";
import { normalizeReadFileStateMtimeMs } from "../../read-file-state.js";
import type { ReadFileStateEntry, ToolExecutionContext } from "../../types.js";
import { isBashProviderErrorStatus } from "../bash-semantics.js";

const HINT_PATH_QUOTA = 5;

export function effectsBlocked(output: BashOutput): boolean {
  return (
    output.backgroundTaskId !== undefined ||
    output.isImage === true ||
    output.interrupted === true ||
    isBashProviderErrorStatus(output)
  );
}

export function statMtimeValue(metadata: FileSystemStatResult): number | undefined {
  return normalizeReadFileStateMtimeMs(metadata.revision?.mtimeMs ?? metadata.mtimeMs);
}

export function composeStaleHint(changedPaths: string[], workingDirectory: string): string {
  const shown = changedPaths
    .slice(0, HINT_PATH_QUOTA)
    .map((path) => relative(workingDirectory, path) || path);
  const elidedCount = changedPaths.length - HINT_PATH_QUOTA;
  const elidedNote = elidedCount > 0 ? ` and ${elidedCount} more` : "";
  const noun = changedPaths.length === 1 ? "file" : "files";
  const listed = shown.join(", ");
  return `[This command modified ${changedPaths.length} ${noun} you've previously read: ${listed}${elidedNote}. Call Read before editing.]`;
}

// 回填记录：offset/limit 原样带入（整文件读保持 offset undefined），
// 但显式 offset=1 的 Read 也仍算整文件读。
export function buildReadStateRecord(
  absolutePath: string,
  visibleSlice: { content: string; offset?: number; limit?: number },
  revisionId: string | undefined,
  mtimeMs: number | undefined,
  sizeBytes: number | undefined,
): ReadFileStateEntry {
  const record: Record<string, unknown> = {
    path: absolutePath,
    content: visibleSlice.content,
    offset: visibleSlice.offset,
    limit: visibleSlice.limit,
    isPartialView: false,
    readAt: new Date(),
    revisionId,
    mtimeMs,
    sizeBytes,
  };
  return record as unknown as ReadFileStateEntry;
}

export function buildStateTrace(ctx: ToolExecutionContext): TraceContext {
  const trace = {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: ctx.parentSpanId,
    sessionId: ctx.sessionId,
    turnId: ctx.turnId,
  };
  return trace as unknown as TraceContext;
}
