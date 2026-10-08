// SPDX-License-Identifier: Apache-2.0
import jpeg from "jpeg-js";
import {
  STUDIO_IMAGE_PREVIEW_BYTES,
  STUDIO_IMAGE_PREVIEW_MAX_PIXELS,
  workspaceJpegDimensions,
} from "../domain/workspaceImage.js";

/** Strict JPEG decode is admission only; the decoded RGB never leaves this call. */
export function validWorkspaceJpegRaster(bytes: Buffer): boolean {
  if (bytes.length > STUDIO_IMAGE_PREVIEW_BYTES) return false;
  const header = workspaceJpegDimensions(bytes);
  if (!header) return false;
  // 非空熵数据也可能截断；必须用严格解码验证，不能用浏览器恢复成功当完整证明。
  // 库对≤4分量分配系数(16 B/px)、行样本(4)、中间数据(4)、RGB输出(3)。
  // 32 B覆盖这些显式分配；128像素余量覆盖采样字段/MCU补齐，4倍输入覆盖量化表。
  // 按实际已接纳尺寸核算，不沿用贴图的128 MiB限制，也不降低48 MP预览预算。
  const maxMemoryUsageInMB = Math.ceil(
    (32 * (header.width + 128) * (header.height + 128) + 4 * bytes.length) / 1024 ** 2,
  );
  try {
    const decoded = jpeg.decode(bytes, {
      useTArray: true,
      formatAsRGBA: false,
      tolerantDecoding: false,
      maxResolutionInMP: STUDIO_IMAGE_PREVIEW_MAX_PIXELS / 1_000_000,
      maxMemoryUsageInMB,
    });
    return (
      decoded.width === header.width &&
      decoded.height === header.height &&
      decoded.data.length === header.width * header.height * 3
    );
  } catch {
    return false;
  }
}
