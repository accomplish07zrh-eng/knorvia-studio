// SPDX-License-Identifier: Apache-2.0
import { handoffRelativePath } from "@knorvia/shared";
import type {
  StudioWorkspaceImageRequest,
  StudioWorkspaceImageSide,
} from "../workspaceImageTypes.js";
import type { StudioReviewFileVersion } from "../workspaceReviewTypes.js";
import { studioWorkspaceSecretPath } from "./workspaceSecrets.js";

export const STUDIO_IMAGE_PREVIEW_BYTES = 25 * 1024 * 1024;
// 与背景图既有 48 MP 接纳值对齐，但必须在浏览器解码前由头部守住；长边另限极端长条。
export const STUDIO_IMAGE_PREVIEW_MAX_PIXELS = 48_000_000;
export const STUDIO_IMAGE_PREVIEW_MAX_DIMENSION = 16_384;
export const studioImagePath = (path: string) => /\.(png|jpe?g)$/i.test(path);
export function sameImageVersion(a: StudioReviewFileVersion, b: StudioReviewFileVersion) {
  return (
    a.beforeHash === b.beforeHash && a.afterHash === b.afterHash && a.sourceHash === b.sourceHash
  );
}
export function validateImageRequest(request: StudioWorkspaceImageRequest) {
  if (
    !request ||
    typeof request.path !== "string" ||
    handoffRelativePath(request.path) !== request.path ||
    studioWorkspaceSecretPath(request.path)
  )
    throw new Error("Unsafe image preview path");
  const version = request.version;
  if (
    !version ||
    ![version.beforeHash, version.afterHash, version.sourceHash].every(
      (hash) => hash === null || (typeof hash === "string" && /^[0-9a-f]{64}$/.test(hash)),
    )
  )
    throw new Error("Invalid reviewed file version");
  if (version.beforeHash === version.afterHash)
    throw new Error("Reviewed file has no isolated changes");
}
export function validateReviewedVersions(
  paths: string[],
  versions?: StudioWorkspaceImageRequest[],
) {
  if (versions === undefined) return;
  if (
    !Array.isArray(versions) ||
    versions.length > paths.length ||
    new Set(versions.map((entry) => entry?.path)).size !== versions.length
  )
    throw new Error("Invalid reviewed versions");
  for (const entry of versions) {
    validateImageRequest(entry);
    if (!paths.includes(entry.path)) throw new Error("Reviewed version is outside selected paths");
  }
}

type Format =
  | { kind: "image"; mediaType: "image/png" | "image/jpeg" }
  | Extract<StudioWorkspaceImageSide, { kind: "unsupported" }>;
const invalid = (): Format => ({ kind: "unsupported", reason: "invalid-format" });
const exceedsDisplayBudget = (width: number, height: number) =>
  width > STUDIO_IMAGE_PREVIEW_MAX_DIMENSION ||
  height > STUDIO_IMAGE_PREVIEW_MAX_DIMENSION ||
  width * height > STUDIO_IMAGE_PREVIEW_MAX_PIXELS;
const uint32 = (bytes: Uint8Array, offset: number) =>
  bytes[offset]! * 0x1000000 +
  (bytes[offset + 1]! << 16) +
  (bytes[offset + 2]! << 8) +
  bytes[offset + 3]!;
function pngFormat(bytes: Uint8Array): Format {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || !signature.every((byte, index) => bytes[index] === byte))
    return invalid();
  let offset = 8;
  let header = false;
  let pixels = false;
  const compressionHeader: number[] = [];
  while (offset + 12 <= bytes.length) {
    const length = uint32(bytes, offset);
    const end = offset + length + 12;
    if (end > bytes.length) return invalid();
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{4}$/.test(type)) return invalid();
    if (!header) {
      if (type !== "IHDR" || length !== 13) return invalid();
      const width = uint32(bytes, offset + 8);
      const height = uint32(bytes, offset + 12);
      if (!width || !height) return invalid();
      if (exceedsDisplayBudget(width, height))
        return { kind: "unsupported", reason: "display-budget" };
      header = true;
    } else if (type === "IHDR") return invalid();
    if (type === "acTL") return { kind: "unsupported", reason: "animated" };
    if (type === "IDAT") {
      pixels = true;
      for (let i = 0; i < length && compressionHeader.length < 2; i++)
        compressionHeader.push(bytes[offset + 8 + i]!);
    }
    if (type === "IEND")
      // Chromium 可把无效压缩头恢复成空白图；静态 PNG 接纳必须先核对 zlib 头。
      return length === 0 &&
        pixels &&
        end === bytes.length &&
        compressionHeader.length === 2 &&
        (compressionHeader[0]! & 15) === 8 &&
        compressionHeader[0]! >>> 4 <= 7 &&
        (compressionHeader[1]! & 32) === 0 &&
        ((compressionHeader[0]! << 8) + compressionHeader[1]!) % 31 === 0
        ? { kind: "image", mediaType: "image/png" }
        : invalid();
    offset = end;
  }
  return invalid();
}
function jpegFormat(bytes: Uint8Array): Format {
  if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216) return invalid();
  let offset = 2;
  let frame = false;
  let scan = false;
  let quantization = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 255) return invalid();
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === undefined) return invalid();
    if (marker === 217)
      return frame && scan && quantization && offset === bytes.length
        ? { kind: "image", mediaType: "image/jpeg" }
        : invalid();
    if (marker === 216 || marker === 0) return invalid();
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (offset + 2 > bytes.length) return invalid();
    const length = bytes[offset]! * 256 + bytes[offset + 1]!;
    if (length < 2 || offset + length > bytes.length) return invalid();
    // 独立 JPEG 缺少量化表时浏览器也可能恢复空白帧，不能将其当作有效快照图。
    if (marker === 219 && length >= 67) quantization = true;
    if (
      marker === 226 &&
      length >= 6 &&
      String.fromCharCode(...bytes.subarray(offset + 2, offset + 6)) === "MPF\0"
    )
      return { kind: "unsupported", reason: "multiple-images" };
    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
      if (length < 8) return invalid();
      const height = bytes[offset + 3]! * 256 + bytes[offset + 4]!;
      const width = bytes[offset + 5]! * 256 + bytes[offset + 6]!;
      if (!width || !height) return invalid();
      // 检查每个 SOF，不能让后续大帧绕过前一个小帧的接纳结果。
      if (exceedsDisplayBudget(width, height))
        return { kind: "unsupported", reason: "display-budget" };
      frame = true;
    }
    offset += length;
    if (marker === 218) {
      scan = true;
      while (offset < bytes.length) {
        if (bytes[offset] !== 255) {
          offset++;
          continue;
        }
        const next = bytes[offset + 1];
        if (next === 0 || (next !== undefined && next >= 208 && next <= 215)) {
          offset += 2;
          continue;
        }
        break;
      }
    }
  }
  return invalid();
}
/** Structural admission only: browser decode proves displayability; no re-encoding or ICC changes. */
export function workspaceImageFormat(path: string, bytes: Uint8Array): Format {
  return /\.png$/i.test(path) ? pngFormat(bytes) : jpegFormat(bytes);
}
