// One read-only port request per invocation; public tool declarations remain in their entry files.
import {
  CoreErrorType,
  GlobInputSchema,
  GrepInputSchema,
  createCoreError,
  isFileSystemPortError,
  type GlobInput,
  type GrepInput,
  type TraceContext,
  type FileSystemSearchTextResult,
} from "@knorvia/contracts";
import type { ToolHandler, ToolExecutionContext } from "../types.js";
import { resolveToolWorkingDirectory, resolveWorkspacePath } from "../path-policy.js";
import { displaySearchPath, projectTextSearch } from "./file-search-output.js";

const GLOB_MAX_RESULTS = 100;
function prepareSearch(context: ToolExecutionContext, name: "Glob" | "Grep", requested?: string) {
  const port = context.fileSystemPort;
  if (!port)
    throw createCoreError(
      CoreErrorType.ConfigurationError,
      `FileSystemPort is not configured for ${name} tool`,
      { context: { toolCallId: context.toolCallId, toolName: name }, recoverable: false },
    );
  const scope = {
    operation: "read" as const,
    workingDirectory: context.workingDirectory,
    workspaceRoot: context.workspaceRoot,
  };
  const path = requested
    ? resolveWorkspacePath({ ...scope, inputPath: requested })
    : resolveToolWorkingDirectory(undefined, scope);
  const trace = {
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
    sessionId: context.sessionId,
    turnId: context.turnId,
  } as unknown as TraceContext;
  return { port, path, trace };
}

export const executeGlob: ToolHandler = async (input, context) => {
  const request = GlobInputSchema.parse(input) as GlobInput;
  const { port, path, trace } = prepareSearch(context, "Glob", request.path);
  const result = await port.searchFiles(
    { path, pattern: request.pattern, maxResults: GLOB_MAX_RESULTS, trace },
    { signal: context.abortSignal },
  );
  const filenames = result.files.map((file) => displaySearchPath(file, context.workingDirectory));
  return {
    durationMs: result.durationMs,
    numFiles: filenames.length,
    filenames,
    truncated: result.truncated,
  };
};

export const executeGrep: ToolHandler = async (input, context) => {
  const request = GrepInputSchema.parse(input) as GrepInput;
  const { port, path, trace } = prepareSearch(context, "Grep", request.path);
  const surrounding = request.context ?? request["-C"];
  const query = {
    path,
    pattern: request.pattern,
    glob: request.glob,
    outputMode: request.output_mode,
    beforeContext: request["-B"] ?? surrounding,
    afterContext: request["-A"] ?? surrounding,
    context: surrounding,
    showLineNumbers: request["-n"],
    onlyMatching: request["-o"],
    ignoreCase: request["-i"],
    type: request.type,
    headLimit: request.head_limit,
    offset: request.offset,
    multiline: request.multiline,
    trace,
  };
  let result: FileSystemSearchTextResult;
  try {
    result = await port.searchText(query, { signal: context.abortSignal });
  } catch (error) {
    if (!isFileSystemPortError(error) || error.code !== "cancelled") throw error;
    throw createCoreError(CoreErrorType.ToolCancelled, "Grep was cancelled", {
      cause: error,
      context: { path, toolCallId: context.toolCallId, toolName: "Grep" },
      recoverable: true,
    });
  }
  return projectTextSearch(result, context.workingDirectory, request["-n"] ?? true);
};
