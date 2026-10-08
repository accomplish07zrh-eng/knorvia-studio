import { STUDIO_IMAGE_LIMITS, type StudioImageInput, type StudioImageRef } from "../imageTypes.js";
import type { StudioKernelOptions } from "../kernelTypes.js";

export function studioImageRef(input: StudioImageInput): StudioImageRef {
  const { id, filename, mimeType, sizeBytes, width, height, sha256 } = input;
  return { id, filename, mimeType, sizeBytes, width, height, sha256 };
}
export function validateStudioImageRefs(images: readonly StudioImageRef[]): void {
  if (!Array.isArray(images) || images.length > STUDIO_IMAGE_LIMITS.count)
    throw new Error("最多添加 4 张图片");
  let total = 0;
  const ids = new Set<string>();
  // 引用只允许有界字段，防止额外载荷进入 overview/timeline 或被误当作账户配置。
  for (const image of images) {
    if (
      !image ||
      Object.keys(image).some(
        (key) =>
          ![
            "id",
            "filename",
            "mimeType",
            "sizeBytes",
            "width",
            "height",
            "sha256",
            "dataBase64",
          ].includes(key),
      ) ||
      typeof image.id !== "string" ||
      !/^[\w-]{1,128}$/.test(image.id) ||
      ids.has(image.id) ||
      typeof image.filename !== "string" ||
      !image.filename ||
      image.filename.length > 255 ||
      image.filename.includes("\0") ||
      /[\r\n/\\]/.test(image.filename) ||
      !["image/png", "image/jpeg"].includes(image.mimeType) ||
      !Number.isSafeInteger(image.sizeBytes) ||
      image.sizeBytes < 1 ||
      image.sizeBytes > STUDIO_IMAGE_LIMITS.perImageBytes ||
      typeof image.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(image.sha256)
    )
      throw new Error("无效的 PNG/JPEG 图片或图片超过 2 MiB");
    validateStudioImageDimensions(image.width, image.height);
    total += image.sizeBytes;
    ids.add(image.id);
  }
  if (total > STUDIO_IMAGE_LIMITS.totalBytes) throw new Error("图片总大小不能超过 4 MiB");
}
export function validateStudioImageInputs(images: readonly StudioImageInput[]): void {
  validateStudioImageRefs(images);
  for (const image of images) {
    if (
      typeof image.dataBase64 !== "string" ||
      image.dataBase64.length !== 4 * Math.ceil(image.sizeBytes / 3) ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.dataBase64)
    )
      throw new Error("图片内容缺失或编码无效");
  }
}
export function validateStudioImageDimensions(width: number, height: number): void {
  if (
    ![width, height].every(
      (v) => Number.isSafeInteger(v) && v > 0 && v <= STUDIO_IMAGE_LIMITS.edge,
    ) ||
    width * height > STUDIO_IMAGE_LIMITS.pixels
  )
    throw new Error("图片尺寸超过 8192 或 16 Mi 像素");
}
/** 解码前的尺寸上限防护；签名或 MIME 不一致立即拒绝，完整解码另由能力端完成。 */
export function studioImageDimensions(
  bytes: Uint8Array,
  mime: StudioImageRef["mimeType"],
): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0,
    height = 0;
  if (
    mime === "image/png" &&
    bytes.length >= 33 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) &&
    view.getUint32(8) === 13 &&
    view.getUint32(12) === 0x49484452
  ) {
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker !== undefined && marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker!) &&
        length >= 8
      ) {
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        break;
      }
      offset += length;
    }
  }
  validateStudioImageDimensions(width, height);
  return { width, height };
}
export function requireStudioImageModel(
  options: StudioKernelOptions | undefined,
  selected?: string,
): string {
  const id = selected || options?.defaultModel;
  const model = options?.models.find((item) => item.id === id);
  if (!model?.inputModalities)
    throw new Error("无法确认当前模型支持图片，请刷新模型目录并选择模型");
  if (!model.inputModalities.includes("image"))
    throw new Error(`模型 ${model.label} 不支持图片输入`);
  return model.id;
}
