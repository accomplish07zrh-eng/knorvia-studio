import {
  STUDIO_IMAGE_LIMITS,
  studioImageDimensions,
  validateStudioImageInputs,
  type StudioImageInput,
} from "@knorvia/services";
import {
  createChatComposerAttachment,
  serializeChatComposerAttachment,
  revokeChatComposerAttachment,
} from "@/lib/chatAttachments.js";

/** 先读取并复制实际字节；中文文件名保留，路径与修改时间不进入发送载荷。 */
export async function captureStudioImage(file: File): Promise<StudioImageInput> {
  if (!file.size || file.size > STUDIO_IMAGE_LIMITS.perImageBytes)
    throw new Error("每张图片须小于等于 2 MiB / Each image must be at most 2 MiB");
  const mimeType =
    file.type ||
    (/\.png$/i.test(file.name) ? "image/png" : /\.jpe?g$/i.test(file.name) ? "image/jpeg" : "");
  if (mimeType !== "image/png" && mimeType !== "image/jpeg")
    throw new Error("仅支持 PNG/JPEG / Only PNG/JPEG images are supported");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size) throw new Error("文件读取期间改变 / File changed while reading");
  const dimensions = studioImageDimensions(bytes, mimeType);
  const frozen = new File([bytes], file.name, { type: mimeType });
  const bitmap = await createImageBitmap(frozen);
  try {
    // 浏览器按 JPEG EXIF 旋转显示，Host 解码器记录原始尺寸；两者仍来自同一冻结字节。
    const direct = bitmap.width === dimensions.width && bitmap.height === dimensions.height;
    const oriented =
      mimeType === "image/jpeg" &&
      bitmap.width === dimensions.height &&
      bitmap.height === dimensions.width;
    if (!direct && !oriented) throw new Error("图片尺寸不一致 / Image dimensions changed");
  } finally {
    bitmap.close();
  }
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, "0")).join("");
  const attachment = createChatComposerAttachment(frozen);
  try {
    const serialized = await serializeChatComposerAttachment(attachment);
    if (serialized.kind !== "image" || !serialized.dataBase64)
      throw new Error("图片内容缺失 / Image content missing");
    const input: StudioImageInput = {
      id: crypto.randomUUID(),
      filename: file.name,
      mimeType,
      sizeBytes: bytes.length,
      ...dimensions,
      sha256,
      dataBase64: serialized.dataBase64,
    };
    validateStudioImageInputs([input]);
    return Object.freeze(input);
  } finally {
    revokeChatComposerAttachment(attachment);
  }
}
