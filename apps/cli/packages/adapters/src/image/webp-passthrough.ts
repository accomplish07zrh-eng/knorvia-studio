// SPDX-License-Identifier: Apache-2.0
// WebP 直通：当前适配器不能转码 WebP，只在预算内原样交给模型。
import {
  createImageProcessorError,
  type ImagePrepareForModelRequest,
  type ImagePrepareForModelResult,
} from "@knorvia/contracts";
import { createImageBudget, fitsImageBudget } from "./image-budget.js";

type PrepareRequest = ImagePrepareForModelRequest;
type PrepareResult = ImagePrepareForModelResult;

const WEBP_MEDIA_TYPE = "image/webp";
const OVER_BUDGET_MESSAGE =
  "WebP image exceeds the model image budget and the current image adapter cannot transcode WebP";

export function prepareWebpPassthrough(data: Buffer, request: PrepareRequest): PrepareResult {
  const budget = createImageBudget(request);
  if (!fitsImageBudget(data, budget)) {
    throw createImageProcessorError({ code: "unsupported", message: OVER_BUDGET_MESSAGE });
  }
  const result = {} as PrepareResult;
  result.data = data;
  result.mediaType = WEBP_MEDIA_TYPE;
  result.originalSizeBytes = data.byteLength;
  result.transformedSizeBytes = data.byteLength;
  result.resized = false;
  result.compressed = false;
  result.strategy = "original";
  return result;
}
