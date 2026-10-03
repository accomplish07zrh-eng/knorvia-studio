// Write-specific admission and single conditional commit; specs/knorvia-write-transaction.md.
// Existing source exposure and transition licensing remain recorded.
import {
  CoreErrorType,
  WriteInputSchema,
  createCoreError,
  isFileSystemPortError,
  type FileSystemReadTextResult,
  type TraceContext,
  type WriteInput,
} from "@knorvia/contracts";
import type { ReadFileStateEntry, ReadFileStateMap, ToolHandler } from "../types.js";
import {
  createReadFileStateKey,
  findLatestReadFileState,
  normalizeReadFileStateMtimeMs,
} from "../read-file-state.js";
import { createReadFileStateMetadataFromEntry } from "../read-file-state-metadata.js";
import { resolveWorkspacePath } from "../path-policy.js";
import { stampMemoryOriginSessionId } from "../../memory/origin-session.js";
import { createStructuredPatch } from "../diff.js";
import {
  attachToolExecutionTelemetry,
  elapsedMsSince,
  fileByteCount,
  workspaceKind,
} from "./tool-perf.js";

function rejectRead(path: string, stale: boolean): never {
  throw createCoreError(
    CoreErrorType.ToolExecutionFailed,
    stale
      ? "File has been modified since read, either by the user or by a linter. Read it again before attempting to write it."
      : "File has not been read yet. Read it first before writing to it.",
    {
      context: { code: stale ? "write_file_stale" : "write_file_not_read", filePath: path },
      recoverable: true,
    },
  );
}
function admitExisting(
  path: string,
  read: FileSystemReadTextResult,
  states?: ReadFileStateMap,
): void {
  const prior = findLatestReadFileState(states, path);
  if (!prior || prior.isPartialView) rejectRead(path, false);
  const full = (prior.offset ?? 1) <= 1 && prior.limit === undefined;
  const identicalFull = full && prior.content === read.content;
  const oldTime = prior.mtimeMs;
  const newTime = read.revision?.mtimeMs;
  const differentRevision = Boolean(
    prior.revisionId && read.revision?.id && prior.revisionId !== read.revision.id,
  );
  const bothTimes = oldTime !== undefined && newTime !== undefined;
  const changed =
    differentRevision ||
    (bothTimes
      ? Math.floor(newTime) > Math.floor(oldTime) || prior.sizeBytes !== read.sizeBytes
      : (prior.sizeBytes !== undefined && prior.sizeBytes !== read.sizeBytes) ||
        (full && prior.content !== read.content));
  // Write 的 revision-first 规则比 Edit 更严格；不能复用后者的 mtime-first 判定。
  if (changed && !identicalFull) rejectRead(path, true);
}

export const executeWrite: ToolHandler = async (input, context) => {
  const request = WriteInputSchema.parse(input) as WriteInput;
  const port = context.fileSystemPort;
  if (!port)
    throw createCoreError(
      CoreErrorType.ConfigurationError,
      "FileSystemPort is not configured for Write tool",
      { context: { toolCallId: context.toolCallId, toolName: "Write" }, recoverable: false },
    );
  const path = resolveWorkspacePath({
    inputPath: request.file_path,
    operation: "write",
    workingDirectory: context.workingDirectory,
    workspaceRoot: context.workspaceRoot,
  });
  const trace = (): TraceContext =>
    ({
      traceId: context.traceId,
      spanId: context.spanId,
      parentSpanId: context.parentSpanId,
      sessionId: context.sessionId,
      turnId: context.turnId,
    }) as unknown as TraceContext;
  const readStart = Date.now();
  let previous: FileSystemReadTextResult | undefined;
  try {
    const read = await port.readTextFile({ path, trace: trace() }, { signal: context.abortSignal });
    admitExisting(path, read, context.readFileState);
    previous = read;
  } catch (error) {
    if (!isFileSystemPortError(error) || error.code !== "not_found") throw error;
  }
  const readMs = elapsedMsSince(readStart);
  const content = stampMemoryOriginSessionId({
    content: request.content,
    filePath: path,
    memoryRoot: context.memoryRoot,
    sessionId: context.sessionId,
  });
  const writeStart = Date.now();
  const written = await port.writeTextFile(
    {
      path,
      content,
      encoding: previous?.encoding,
      lineEndings: previous?.lineEndings,
      createParents: true,
      atomic: true,
      expectedRevision: previous?.revision,
      trace: trace(),
    },
    { signal: context.abortSignal },
  );
  const writeMs = elapsedMsSince(writeStart);

  let snapshot: ReadFileStateEntry | undefined;
  if (context.readFileState) {
    snapshot = {
      path,
      content,
      offset: undefined,
      limit: undefined,
      isPartialView: false,
      readAt: new Date(),
      sourceTool: "Write",
      revisionId: written.revision?.id,
      mtimeMs: normalizeReadFileStateMtimeMs(written.revision?.mtimeMs),
      sizeBytes: written.revision?.sizeBytes ?? Buffer.byteLength(content, "utf8"),
    };
    context.readFileState.set(createReadFileStateKey(path, 1, undefined), snapshot);
  }
  if (context.recordReadFileStateMetadata) {
    const metadata = createReadFileStateMetadataFromEntry({
      completedAt: snapshot?.readAt ?? new Date(),
      entry: snapshot,
      toolName: "Write",
    });
    if (metadata) context.recordReadFileStateMetadata(metadata);
  }

  const original = previous?.content;
  const output = {
    type: original ? "update" : "create",
    filePath: request.file_path,
    content,
    structuredPatch: original
      ? createStructuredPatch({
          filePath: request.file_path,
          oldContent: original,
          newContent: content,
        })
      : [],
    originalFile: original || null,
    userModified: false,
  };
  const bytes = fileByteCount(content);
  return attachToolExecutionTelemetry(output, {
    detail: {
      kind: "filesystem",
      filesystem: {
        readMs,
        writeMs,
        fileCount: 1,
        totalBytes: bytes,
        maxFileBytes: bytes,
        workspaceKind: workspaceKind(context),
      },
    },
  });
};
