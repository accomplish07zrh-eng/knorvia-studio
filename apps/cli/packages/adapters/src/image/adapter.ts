// SPDX-License-Identifier: Apache-2.0
// 图片适配器实现：resizeToFit 的尺寸语义 + prepareForModel 的转发。
import type {
  ImagePrepareForModelRequest,
  ImagePrepareForModelResult,
  ImageProcessorPort,
  ImageResizeRequest,
  ImageResizeResult,
} from "@knorvia/contracts";
import { Jimp, ResizeStrategy } from "jimp";
import { prepareJimpImageForModel } from "./prepare.js";
import { jimpOutputMediaType, throwIfAborted } from "./jimp-media.js";

const WEBP_MEDIA_TYPE = "image/webp";
const INVALID_LIMIT_MESSAGE = "Image resize maxDimension must be a positive finite number";

interface Size {
  height: number;
  width: number;
}

/** 未缩放的结果：不预留尺寸字段（WebP 直通）或带上原尺寸（尺寸已满足限制）。 */
function unchanged(data: Buffer, mediaType: string, size?: Size): ImageResizeResult {
  const result = { data, mediaType, resized: false } as ImageResizeResult;
  if (size) {
    result.originalWidth = size.width;
    result.originalHeight = size.height;
    result.width = size.width;
    result.height = size.height;
  }
  return result;
}

/** 缩放后的结果：保留原始尺寸与目标尺寸两组值。 */
function scaled(data: Buffer, mediaType: string, original: Size, target: Size): ImageResizeResult {
  const result = { data, mediaType, resized: true } as ImageResizeResult;
  result.originalWidth = original.width;
  result.originalHeight = original.height;
  result.width = target.width;
  result.height = target.height;
  return result;
}

async function resizeToFit(
  request: ImageResizeRequest,
  runtime: { signal?: AbortSignal } = {},
): Promise<ImageResizeResult> {
  throwIfAborted(runtime.signal);
  const edgeLimit = request.maxDimension;
  if (!Number.isFinite(edgeLimit) || edgeLimit <= 0) throw new Error(INVALID_LIMIT_MESSAGE);

  // 输入先复制：返回值不复用调用方的 buffer，避免下游编码改动上游数据。
  const sourceData = Buffer.from(request.data);
  if (request.mediaType === WEBP_MEDIA_TYPE) return unchanged(sourceData, request.mediaType);

  const decoded = await Jimp.read(sourceData);
  throwIfAborted(runtime.signal);
  const original: Size = { height: decoded.bitmap.height, width: decoded.bitmap.width };
  if (original.width <= edgeLimit && original.height <= edgeLimit) {
    return unchanged(sourceData, request.mediaType, original);
  }

  decoded.scaleToFit({ h: edgeLimit, mode: ResizeStrategy.BICUBIC, w: edgeLimit });
  throwIfAborted(runtime.signal);
  const targetType = jimpOutputMediaType(request.mediaType, decoded.mime);
  const encodedData = await decoded.getBuffer(targetType);
  throwIfAborted(runtime.signal);
  return scaled(encodedData, targetType, original, {
    height: decoded.bitmap.height,
    width: decoded.bitmap.width,
  });
}

export function createJimpImageProcessorAdapter(): ImageProcessorPort {
  const port: ImageProcessorPort = {
    resizeToFit,
    prepareForModel(
      request: ImagePrepareForModelRequest,
      runtime: { signal?: AbortSignal } = {},
    ): Promise<ImagePrepareForModelResult> {
      return prepareJimpImageForModel(request, runtime);
    },
  };
  return port;
}
