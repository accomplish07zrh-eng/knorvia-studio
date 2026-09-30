// Shared binary Read policy; specs/knorvia-read-binary-media.md.
// Repository transition licence remains applicable pending source review.
import {
  CoreErrorType,
  READ_IMAGE_MAX_INPUT_BYTES,
  READ_VIDEO_MAX_INPUT_BYTES,
  createCoreError,
  isFileSystemPortError,
  type FileSystemPort,
  type TraceContext,
} from "@knorvia/contracts";
import type { ToolExecutionContext } from "../types.js";

export type BinaryReadKind = "image" | "video";
const INPUT_LIMITS = {
  image: READ_IMAGE_MAX_INPUT_BYTES,
  video: READ_VIDEO_MAX_INPUT_BYTES,
} as const;

export function requireReadFileSystem(context: ToolExecutionContext): FileSystemPort {
  const port = context.fileSystemPort;
  if (port) return port;
  throw createCoreError(
    CoreErrorType.ConfigurationError,
    "FileSystemPort is not configured for Read tool",
    {
      context: { toolCallId: context.toolCallId, toolName: "Read" },
      recoverable: false,
    },
  );
}

export function beginBinaryRead(
  kind: BinaryReadKind,
  path: string,
  context: ToolExecutionContext,
  port: FileSystemPort,
) {
  const trace = {
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
    sessionId: context.sessionId,
    turnId: context.turnId,
  } as unknown as TraceContext;
  // 返回原端口 promise，不另加 await 层，保留调用方原有取消与后续处理顺序。
  return {
    trace,
    pending: port.readBinaryFile(
      { path, maxBytes: INPUT_LIMITS[kind], trace },
      { signal: context.abortSignal },
    ),
  };
}

export function throwBinaryReadError(
  error: unknown,
  kind: BinaryReadKind,
  filePath: string,
  context: ToolExecutionContext,
): never {
  if (!isFileSystemPortError(error) || error.code !== "too_large") throw error;
  throw createCoreError(CoreErrorType.ToolExecutionFailed, error.message, {
    cause: error,
    recoverable: true,
    context: {
      code: `read_${kind}_input_too_large`,
      filePath,
      maxBytes: INPUT_LIMITS[kind],
      toolCallId: context.toolCallId,
      toolName: "Read",
    },
  });
}
