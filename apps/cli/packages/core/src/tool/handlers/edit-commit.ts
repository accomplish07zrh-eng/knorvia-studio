// Single conditional write and post-commit projection. Transition licence retained.
import {
  CoreErrorType,
  createCoreError,
  type EditOutput,
  type FileSystemReadTextResult,
  type TraceContext,
} from "@knorvia/contracts";
import type { ToolExecutionContext, ReadFileStateEntry } from "../types.js";
import { createReadFileStateKey, normalizeReadFileStateMtimeMs } from "../read-file-state.js";
import { createReadFileStateMetadataFromEntry } from "../read-file-state-metadata.js";
import { stampMemoryOriginSessionId } from "../../memory/origin-session.js";
import { createStructuredPatch } from "../diff.js";
import {
  attachToolExecutionTelemetry,
  elapsedMsSince,
  fileByteCount,
  workspaceKind,
} from "./tool-perf.js";
import type { EditPlan } from "./edit-plan.js";

export function editTrace(context: ToolExecutionContext): TraceContext {
  return {
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
    sessionId: context.sessionId,
    turnId: context.turnId,
  } as unknown as TraceContext;
}
export function requireEditPort(context: ToolExecutionContext) {
  if (context.fileSystemPort) return context.fileSystemPort;
  throw createCoreError(
    CoreErrorType.ConfigurationError,
    "FileSystemPort is not configured for Edit tool",
    { context: { toolCallId: context.toolCallId, toolName: "Edit" }, recoverable: false },
  );
}
function lineEndings(text: string): "LF" | "CRLF" {
  let balance = 0;
  for (
    let position = text.indexOf("\n");
    position >= 0;
    position = text.indexOf("\n", position + 1)
  )
    balance += text[position - 1] === "\r" ? 1 : -1;
  return balance > 0 ? "CRLF" : "LF";
}
export async function commitEdit(input: {
  context: ToolExecutionContext;
  path: string;
  inputPath: string;
  plan: EditPlan;
  read?: FileSystemReadTextResult;
  replaceAll: boolean;
  readMs: number;
  matchMs: number;
}): Promise<EditOutput> {
  const { context, plan, read } = input;
  const port = requireEditPort(context);
  const content = stampMemoryOriginSessionId({
    content: plan.content,
    filePath: input.path,
    memoryRoot: context.memoryRoot,
    sessionId: context.sessionId,
  });
  const started = Date.now();
  const written = await port.writeTextFile(
    {
      path: input.path,
      content,
      encoding: read?.encoding,
      lineEndings: read?.lineEndings ?? lineEndings(plan.original),
      createParents: true,
      atomic: true,
      expectedRevision: read?.revision,
      trace: editTrace(context),
    },
    { signal: context.abortSignal },
  );
  const writeMs = elapsedMsSince(started);
  let snapshot: ReadFileStateEntry | undefined;
  if (context.readFileState) {
    snapshot = {
      path: input.path,
      content,
      offset: undefined,
      limit: undefined,
      isPartialView: false,
      readAt: new Date(),
      sourceTool: "Edit",
      revisionId: written.revision?.id,
      mtimeMs: normalizeReadFileStateMtimeMs(written.revision?.mtimeMs),
      sizeBytes: written.revision?.sizeBytes ?? Buffer.byteLength(content, "utf8"),
    };
    context.readFileState.set(createReadFileStateKey(input.path, 1, undefined), snapshot);
  }
  if (context.recordReadFileStateMetadata) {
    const metadata = createReadFileStateMetadataFromEntry({
      completedAt: snapshot?.readAt ?? new Date(),
      entry: snapshot,
      toolName: "Edit",
    });
    if (metadata) context.recordReadFileStateMetadata(metadata);
  }
  const structuredPatch = createStructuredPatch({
    filePath: input.inputPath,
    oldContent: plan.original,
    newContent: content,
  });
  const bytes = fileByteCount(content);
  return attachToolExecutionTelemetry(
    {
      filePath: input.inputPath,
      oldString: plan.search,
      newString: plan.replacement,
      originalFile: plan.original,
      structuredPatch,
      userModified: false,
      replaceAll: input.replaceAll,
      matchStrategy: plan.strategy,
      matchCandidateCount: plan.candidates,
    } satisfies EditOutput,
    {
      detail: {
        kind: "patch",
        filesystem: {
          readMs: input.readMs,
          writeMs,
          fileCount: 1,
          totalBytes: bytes,
          maxFileBytes: bytes,
          workspaceKind: workspaceKind(context),
        },
        patch: {
          matchMs: input.matchMs,
          hunkCount: structuredPatch.length,
          matchAttempts: plan.attempts,
        },
      },
    },
  );
}
