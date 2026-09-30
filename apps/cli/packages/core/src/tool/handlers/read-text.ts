// Read text projection: specs/knorvia-read-text-budget.md.
// Existing output strings and repository licence remain pending source review.
import {
  CoreErrorType,
  READ_DEFAULT_MAX_LINES,
  READ_MAX_FILE_SIZE_BYTES,
  READ_MAX_OUTPUT_TOKENS,
  createCoreError,
  type FileSystemPort,
  type FileSystemReadTextRangeResult,
  type ReadTextOutput,
  type TraceContext,
} from "@knorvia/contracts";
import { estimateTokens } from "../../context/utils.js";
import { selectTextBudgetPrefix } from "./read-text-budget.js";

const PARTIAL_BUDGET_RATIO = 0.85;
const PARTIAL_TOKEN_BUDGET = Math.floor(READ_MAX_OUTPUT_TOKENS * PARTIAL_BUDGET_RATIO);
interface ReadTextFileForModelOptions {
  abortSignal?: AbortSignal;
  allowPartialFallback?: boolean;
  filePath: string;
  fileSystemPort: FileSystemPort;
  limit?: number;
  onRead?: (read: FileSystemReadTextRangeResult) => void;
  offset?: number;
  trace?: TraceContext;
}

export async function readTextFileForModel({
  abortSignal,
  allowPartialFallback,
  filePath,
  fileSystemPort,
  limit,
  onRead,
  offset,
  trace,
}: ReadTextFileForModelOptions): Promise<ReadTextOutput> {
  const initialOffset = offset === undefined || offset <= 1;
  const range = await fileSystemPort.readTextFileRange(
    {
      path: filePath,
      offsetLine: initialOffset ? 0 : offset - 1,
      limitLines: limit,
      maxBytes: limit === undefined ? READ_MAX_FILE_SIZE_BYTES : undefined,
      trace,
    },
    { signal: abortSignal },
  );
  onRead?.(range);
  const tokens = estimateTokens(range.content);
  const output: ReadTextOutput = {
    type: "text",
    filePath,
    content: range.content,
    numLines: range.lineCount,
    startLine: offset === 0 ? 0 : range.startLine,
    totalLines: range.totalLines,
    sizeBytes: range.sizeBytes,
    bytesRead: range.bytesRead,
    truncated: range.truncated,
  };
  if (tokens <= READ_MAX_OUTPUT_TOKENS) {
    if (
      !output.content &&
      output.numLines === 0 &&
      output.startLine === 1 &&
      output.totalLines === 0
    ) {
      output.numLines = 1;
      output.totalLines = 1;
    }
    return output;
  }
  const prefix =
    (allowPartialFallback ?? (initialOffset && limit === undefined))
      ? selectTextBudgetPrefix(range.content, PARTIAL_TOKEN_BUDGET)
      : undefined;
  if (!prefix) {
    throw createCoreError(
      CoreErrorType.ToolExecutionFailed,
      `File content (${tokens} tokens) exceeds maximum allowed tokens (${READ_MAX_OUTPUT_TOKENS}). Use offset and limit parameters to read specific portions of the file, or search for specific content instead of reading the whole file.`,
      {
        context: {
          code: "read_output_too_many_tokens",
          filePath,
          maxTokens: READ_MAX_OUTPUT_TOKENS,
          tokenCount: tokens,
        },
        recoverable: true,
      },
    );
  }
  const lead = `The file is too large to display in full (${tokens} estimated tokens, limit ${READ_MAX_OUTPUT_TOKENS}).`;
  const lastLine = range.startLine + prefix.numLines - 1;
  const details = prefix.firstLineOnly
    ? [
        "Showing a partial view of the first line because the first line alone exceeds the token budget.",
        "Use Read with a smaller range or use a search tool to find a specific section.",
      ]
    : [
        `Showing a partial view of lines ${range.startLine}-${lastLine} of ${range.totalLines}.`,
        `Use Read with offset ${lastLine + 1} and limit ${READ_DEFAULT_MAX_LINES} to continue, or use a search tool to find a specific section.`,
      ];
  return {
    ...output,
    content: prefix.content,
    numLines: prefix.numLines,
    startLine: range.startLine,
    truncated: true,
    truncatedByTokenCap: true,
    partialViewNotice: [lead, ...details].join(" "),
  };
}

function warning(body: string): string {
  return `<system-reminder>${body}</system-reminder>`;
}

export function addReadLineNumbers({
  content,
  startLine,
}: {
  content: string;
  startLine: number;
}): string {
  const numbered: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    // 每行从原始基数求值，避免累计自增在大数精度边界丢失旧的标签语义。
    numbered.push(`${numbered.length + startLine}\t${line}`);
  }
  return numbered.join("\n");
}

export function formatReadTextOutput(output: ReadTextOutput): string {
  const notices = output.partialViewNotice ? `${warning(output.partialViewNotice)}\n\n` : "";
  const body = output.content
    ? addReadLineNumbers({ content: output.content, startLine: output.startLine })
    : warning(
        output.totalLines === 0
          ? "Warning: the file exists but the contents are empty."
          : `Warning: the file exists but is shorter than the provided offset (${output.startLine}). The file has ${output.totalLines} lines.`,
      );
  return notices + body;
}
