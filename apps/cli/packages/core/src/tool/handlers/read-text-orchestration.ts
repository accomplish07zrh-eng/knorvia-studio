// Source-exposed text orchestration; retained contracts/prose and attribution remain applicable.
import type {
  FileSystemPort,
  FileSystemStatResult,
  ReadOutput,
  ReadTextOutput,
  TraceContext,
} from "@knorvia/contracts";
import type { ReadFileStateEntry, ReadFileStateMap, ToolExecutionContext } from "../types.js";
import { createReadFileStateKey } from "../read-file-state.js";
import { readTextFileForModel } from "./read-text.js";

interface TextReadFrame {
  context: ToolExecutionContext;
  fileSystemPort: FileSystemPort;
  filePath: string;
  offset?: number;
  limit?: number;
  trace: TraceContext;
  toolInput: unknown;
}
type RangeReadOptions = Parameters<typeof readTextFileForModel>[0];
const RANGE_OPTION_FIELDS = [
  "abortSignal",
  "filePath",
  "fileSystemPort",
  "limit",
  "onRead",
  "offset",
  "trace",
] as const satisfies readonly (keyof RangeReadOptions)[];

function rangeArguments(
  frame: TextReadFrame,
  onRead: RangeReadOptions["onRead"],
): RangeReadOptions {
  const values = RANGE_OPTION_FIELDS.map((field) => [
    field,
    field === "abortSignal"
      ? frame.context.abortSignal
      : field === "onRead"
        ? onRead
        : frame[field],
  ]);
  return Object.fromEntries(values) as unknown as RangeReadOptions;
}
interface TextReadHistory {
  snapshot(context: ToolExecutionContext): ReadFileStateMap;
  normalizeOffset(offset: number | undefined): number;
  fresh(entry: ReadFileStateEntry, stat: FileSystemStatResult): boolean;
  update(
    state: ReadFileStateMap,
    key: string,
    input: {
      output: ReadTextOutput;
      path: string;
      stat: FileSystemStatResult;
      rangeReadRevision?: FileSystemStatResult["revision"];
      offset?: number;
      limit?: number;
    },
  ): void;
  complete(
    context: ToolExecutionContext,
    input: {
      output: ReadOutput;
      readFileState: ReadFileStateMap;
      toolInput: unknown;
    },
  ): void;
}

type TextReadEffect = () => Promise<FileSystemStatResult | ReadTextOutput>;

export function* planReadTextOrchestration(
  frame: TextReadFrame,
  history: TextReadHistory,
): Generator<TextReadEffect, ReadOutput, FileSystemStatResult | ReadTextOutput> {
  const { context, fileSystemPort, filePath, offset, limit, trace, toolInput } = frame;
  // 保留 stat 方法 getter 先于 signal，stat 完成后才取唯一 snapshot owner。
  const stat = (yield () =>
    fileSystemPort.stat(
      { path: filePath, trace },
      { signal: context.abortSignal },
    )) as FileSystemStatResult;
  const readFileState = history.snapshot(context);
  const cacheKey = createReadFileStateKey(filePath, history.normalizeOffset(offset), limit);
  const cached = readFileState.get(cacheKey);
  let output: ReadOutput;
  if (cached && history.fresh(cached, stat)) {
    output = { type: "file_unchanged", filePath };
  } else {
    let rangeReadRevision: FileSystemStatResult["revision"] | undefined;
    output = (yield () =>
      readTextFileForModel(
        rangeArguments(frame, (read) => {
          rangeReadRevision = read.revision;
        }),
      )) as ReadTextOutput;
    history.update(readFileState, cacheKey, {
      output,
      path: filePath,
      stat,
      rangeReadRevision,
      offset,
      limit,
    });
  }
  // hit 和成功 read 在此汇合；update 与 complete 之间不增加 await 或第二份状态。
  history.complete(context, { output, readFileState, toolInput });
  return output;
}
