// SPDX-License-Identifier: Apache-2.0
// 模型图片准备：解码 → 直通快路径（原始/WebP）→ 压缩阶梯 → 结果归一化。
import { Jimp } from "jimp";
import {
  createImageProcessorError,
  type ImagePrepareForModelRequest,
  type ImagePrepareForModelResult,
} from "@knorvia/contracts";
import { createImageBudget, fitsImageBudget, validatePrepareRequest } from "./image-budget.js";
import { detectImageMediaType, normalizeMediaType, throwIfAborted } from "./jimp-media.js";
import { selectEncoding, type EncodedCandidate } from "./ladder.js";
import { prepareWebpPassthrough } from "./webp-passthrough.js";

type PrepareRequest = ImagePrepareForModelRequest;
type PrepareResult = ImagePrepareForModelResult;

interface Size {
  height: number;
  width: number;
}

const WEBP_MEDIA_TYPE = "image/webp";
const EMPTY_MESSAGE = "Image file is empty (0 bytes)";
const DECODE_FAILURE_MESSAGE = "Unable to decode image data";

function emptyFileError(): Error {
  return createImageProcessorError({ code: "empty", message: EMPTY_MESSAGE });
}

function tooLargeError(byteLength: number): Error {
  return createImageProcessorError({
    code: "too_large",
    message: `Unable to compress image (${byteLength} bytes) within the requested model image budget`,
  });
}

async function decodeOrFail(bytes: Buffer) {
  try {
    return await Jimp.read(bytes);
  } catch (cause) {
    throw createImageProcessorError({
      code: "processing_failed",
      message: DECODE_FAILURE_MESSAGE,
      cause,
    });
  }
}

/** 原图直通：尺寸与字节都在预算内，不做任何重编码。 */
function passthroughResult(bytes: Buffer, mediaType: string, size: Size): PrepareResult {
  const result = { mediaType } as PrepareResult;
  result.data = bytes;
  result.originalSizeBytes = bytes.byteLength;
  result.transformedSizeBytes = bytes.byteLength;
  result.originalWidth = size.width;
  result.originalHeight = size.height;
  result.width = size.width;
  result.height = size.height;
  result.resized = false;
  result.compressed = false;
  result.strategy = "original";
  return result;
}

/** 阶梯命中后的结果：resized 看尺寸是否变化，compressed 看字节或 MIME 是否变化。 */
function encodedResult(
  bytes: Buffer,
  chosen: EncodedCandidate,
  sourceMediaType: string,
  original: Size,
): PrepareResult {
  const mediaType = normalizeMediaType(chosen.mediaType);
  const result = { mediaType } as PrepareResult;
  result.data = chosen.data;
  result.originalSizeBytes = bytes.byteLength;
  result.transformedSizeBytes = chosen.data.byteLength;
  result.originalWidth = original.width;
  result.originalHeight = original.height;
  result.width = chosen.width;
  result.height = chosen.height;
  result.resized = chosen.width !== original.width || chosen.height !== original.height;
  result.compressed = chosen.data.byteLength < bytes.byteLength || mediaType !== sourceMediaType;
  result.strategy = chosen.strategy;
  return result;
}

export async function prepareJimpImageForModel(
  request: PrepareRequest,
  runtime: { signal?: AbortSignal } = {},
): Promise<PrepareResult> {
  const gate = runtime.signal;
  throwIfAborted(gate);
  validatePrepareRequest(request);
  const bytes = Buffer.from(request.data);
  if (bytes.byteLength === 0) throw emptyFileError();

  const detectedType = detectImageMediaType(bytes) ?? normalizeMediaType(request.mediaType);
  if (detectedType === WEBP_MEDIA_TYPE) return prepareWebpPassthrough(bytes, request);

  const decoded = await decodeOrFail(bytes);
  throwIfAborted(gate);
  const original: Size = { height: decoded.bitmap.height, width: decoded.bitmap.width };
  const limits = createImageBudget(request);
  const sourceMediaType = normalizeMediaType(detectedType);
  const withinDimension =
    original.width <= request.maxDimension && original.height <= request.maxDimension;
  if (withinDimension && fitsImageBudget(bytes, limits)) {
    return passthroughResult(bytes, sourceMediaType, original);
  }

  const chosen = await selectEncoding({
    budget: limits,
    height: original.height,
    image: decoded as never,
    maxDimension: request.maxDimension,
    signal: gate,
    sourceMediaType,
    width: original.width,
  });
  if (chosen === undefined) throw tooLargeError(bytes.byteLength);
  return encodedResult(bytes, chosen, sourceMediaType, original);
}
