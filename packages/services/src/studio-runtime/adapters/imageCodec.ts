import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import type { StudioImageCodec } from "../app/imagePort.js";
import { studioImageDimensions, validateStudioImageInputs } from "../domain/imageInput.js";

export const studioImageCodec: StudioImageCodec = {
  validate(input) {
    validateStudioImageInputs([input]);
    const bytes = Buffer.from(input.dataBase64, "base64");
    if (
      bytes.length !== input.sizeBytes ||
      bytes.toString("base64") !== input.dataBase64 ||
      createHash("sha256").update(bytes).digest("hex") !== input.sha256
    )
      throw new Error("图片字节或哈希不一致，请重新添加");
    const header = studioImageDimensions(bytes, input.mimeType);
    // pngjs 的非交错路径限制 inflate 输出；交错路径用原生 inflate，先做有界验证再交给解码器。
    if (input.mimeType === "image/png" && bytes[28] === 1) {
      const chunks: Buffer[] = [];
      let offset = 8;
      while (offset + 12 <= bytes.length) {
        const length = bytes.readUInt32BE(offset);
        if (length > bytes.length - offset - 12) throw new Error("PNG 数据块损坏");
        if (bytes.toString("ascii", offset + 4, offset + 8) === "IDAT")
          chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
        offset += length + 12;
      }
      try {
        inflateSync(Buffer.concat(chunks), {
          maxOutputLength: header.width * header.height * 8 + header.height * 2 + 64,
        });
      } catch {
        throw new Error("交错 PNG 解压内容损坏或超过像素预算");
      }
    }
    let decoded: { width: number; height: number };
    try {
      decoded =
        input.mimeType === "image/png"
          ? PNG.sync.read(bytes, { checkCRC: true })
          : jpeg.decode(bytes, {
              useTArray: true,
              tolerantDecoding: false,
              maxResolutionInMP: 17,
              maxMemoryUsageInMB: 128,
            });
    } catch {
      throw new Error("图片无法完整解码，请重新添加 PNG/JPEG");
    }
    if (
      decoded.width !== header.width ||
      decoded.height !== header.height ||
      decoded.width !== input.width ||
      decoded.height !== input.height
    )
      throw new Error("图片实际尺寸与提交内容不一致");
  },
};
