// Image Read projection; specs/knorvia-read-binary-media.md.
// Existing contracts and repository transition licence remain in effect.
import {
  CoreErrorType,
  READ_IMAGE_MAX_BASE64_BYTES,
  READ_IMAGE_MAX_DIMENSION,
  READ_IMAGE_MAX_INPUT_BYTES,
  READ_IMAGE_TARGET_BYTES,
  READ_IMAGE_TOKEN_TO_BASE64_CHAR_RATIO,
  READ_MAX_OUTPUT_TOKENS,
  createCoreError,
  isImageProcessorPortError,
  type FileSystemReadBytesResult,
  type ReadImageOutput,
  type TraceContext,
} from "@knorvia/contracts";
import type { ToolExecutionContext } from "../types.js";
import {
  beginBinaryRead,
  requireReadFileSystem,
  throwBinaryReadError,
} from "./read-binary-input.js";

type SupportedReadImageMime = ReadImageOutput["mimeType"];
const IMAGE_EXTENSIONS = new Map<string, SupportedReadImageMime>([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
]);
const IMAGE_MIMES: ReadonlySet<string> = new Set(IMAGE_EXTENSIONS.values());

export function inferImageMimeFromPath(path: string): SupportedReadImageMime | undefined {
  return IMAGE_EXTENSIONS.get(path.slice(path.lastIndexOf(".")).toLowerCase());
}

export async function readImageFile(
  filePath: string,
  mimeType: SupportedReadImageMime,
  context: ToolExecutionContext,
): Promise<ReadImageOutput> {
  const port = requireReadFileSystem(context);
  if (!context.imageProcessorPort) {
    throw createCoreError(
      CoreErrorType.ConfigurationError,
      "ImageProcessorPort is not configured for image Read",
      {
        context: { toolCallId: context.toolCallId, toolName: "Read" },
        recoverable: false,
      },
    );
  }
  let read: FileSystemReadBytesResult;
  let trace: TraceContext;
  try {
    const request = beginBinaryRead("image", filePath, context, port);
    trace = request.trace;
    read = await request.pending;
  } catch (error) {
    throwBinaryReadError(error, "image", filePath, context);
  }
  try {
    // 读取结束后才选择 processor，保持已有 context 端口替换语义；trace 仍是同一份读取上下文。
    const prepared = await context.imageProcessorPort.prepareForModel(
      {
        data: read.content,
        mediaType: mimeType,
        maxBase64Bytes: READ_IMAGE_MAX_BASE64_BYTES,
        maxDimension: READ_IMAGE_MAX_DIMENSION,
        maxRawBytes: READ_IMAGE_TARGET_BYTES,
        maxTokens: READ_MAX_OUTPUT_TOKENS,
        tokenToBase64CharRatio: READ_IMAGE_TOKEN_TO_BASE64_CHAR_RATIO,
        trace,
      },
      { signal: context.abortSignal },
    );
    const outputMime = IMAGE_MIMES.has(prepared.mediaType)
      ? (prepared.mediaType as SupportedReadImageMime)
      : mimeType;
    return {
      type: "image",
      base64: Buffer.from(prepared.data).toString("base64"),
      mimeType: outputMime,
      originalSize: read.sizeBytes,
      transformedSize: prepared.transformedSizeBytes,
      resized: prepared.resized,
      compressed: prepared.compressed,
      compressionStrategy: prepared.strategy,
      dimensions: {
        originalWidth: prepared.originalWidth,
        originalHeight: prepared.originalHeight,
        displayWidth: prepared.width,
        displayHeight: prepared.height,
      },
    };
  } catch (error) {
    if (!isImageProcessorPortError(error)) throw error;
    throw createCoreError(CoreErrorType.ToolExecutionFailed, error.message, {
      cause: error,
      recoverable: true,
      context: {
        code: `read_image_${error.code}`,
        filePath,
        maxBase64Bytes: READ_IMAGE_MAX_BASE64_BYTES,
        maxDimension: READ_IMAGE_MAX_DIMENSION,
        maxInputBytes: READ_IMAGE_MAX_INPUT_BYTES,
        maxRawBytes: READ_IMAGE_TARGET_BYTES,
        maxTokens: READ_MAX_OUTPUT_TOKENS,
        toolCallId: context.toolCallId,
        toolName: "Read",
      },
    });
  }
}
