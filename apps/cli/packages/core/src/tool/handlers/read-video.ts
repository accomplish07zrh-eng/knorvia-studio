// Direct video Read projection; no transcoder or new dependency.
// Repository transition licence and source review remain unchanged.
import { CoreErrorType, createCoreError, type ReadVideoOutput } from "@knorvia/contracts";
import type { ToolExecutionContext } from "../types.js";
import type { VideoInputMimeType } from "../../runtime/helpers/attachment-video.js";
import {
  beginBinaryRead,
  requireReadFileSystem,
  throwBinaryReadError,
} from "./read-binary-input.js";

export async function readVideoFile(
  filePath: string,
  mimeType: VideoInputMimeType,
  context: ToolExecutionContext,
): Promise<ReadVideoOutput> {
  const port = requireReadFileSystem(context);
  try {
    const { pending } = beginBinaryRead("video", filePath, context, port);
    const read = await pending;
    if (read.bytesRead === 0) {
      // 保留已有空视频拒绝，避免向模型交付会被丢弃的空 data URL。
      throw createCoreError(CoreErrorType.ToolExecutionFailed, "Cannot read an empty video file.", {
        context: {
          code: "read_video_input_empty",
          filePath,
          toolCallId: context.toolCallId,
          toolName: "Read",
        },
        recoverable: true,
      });
    }
    return {
      type: "video",
      base64: Buffer.from(read.content).toString("base64"),
      mimeType,
      originalSize: read.sizeBytes,
    };
  } catch (error) {
    throwBinaryReadError(error, "video", filePath, context);
  }
}
