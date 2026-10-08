import { createHash, randomUUID } from "node:crypto";
import { crc32 } from "node:zlib";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import type { StudioImageInput } from "../../src/studio-runtime/contract.js";
export function syntheticImage(format: "png" | "jpeg" = "png", red = 127): StudioImageInput {
  const pixels = Buffer.from([red, 11, 31, 255, 33, 77, 201, 255]);
  const bytes =
    format === "png"
      ? PNG.sync.write({ width: 2, height: 1, data: pixels })
      : jpeg.encode({ width: 2, height: 1, data: pixels }, 90).data;
  return {
    id: randomUUID(),
    filename: `合成-${red}.${format}`,
    mimeType: format === "png" ? "image/png" : "image/jpeg",
    sizeBytes: bytes.length,
    width: 2,
    height: 1,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    dataBase64: bytes.toString("base64"),
  };
}
export function syntheticOrientedJpeg(jpg: Buffer): Buffer {
  const exif = Buffer.from([
    69, 120, 105, 102, 0, 0, 77, 77, 0, 42, 0, 0, 0, 8, 0, 1, 1, 18, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0,
    0, 0, 0, 0,
  ]);
  return Buffer.concat([jpg.subarray(0, 2), Buffer.from([255, 225, 0, 34]), exif, jpg.subarray(2)]);
}
export function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type),
    length = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
export function imageWithBytes(image: StudioImageInput, bytes: Buffer): StudioImageInput {
  return {
    ...image,
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    dataBase64: bytes.toString("base64"),
  };
}
/** 合成动画声明：普通 PNG 标签和合法 CRC，静态解码器会忽略 acTL。 */
export function syntheticApng(): StudioImageInput {
  const image = syntheticImage(),
    bytes = Buffer.from(image.dataBase64, "base64");
  const control = Buffer.alloc(8);
  control.writeUInt32BE(1);
  return imageWithBytes(
    image,
    Buffer.concat([bytes.subarray(0, 33), pngChunk("acTL", control), bytes.subarray(33)]),
  );
}
export function syntheticLargePng(seed: number): StudioImageInput {
  const pixels = Buffer.alloc(800 * 800 * 4);
  let state = seed;
  for (let index = 0; index < pixels.length; index++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    pixels[index] = index % 4 === 3 ? 255 : state & 255;
  }
  const bytes = PNG.sync.write({ width: 800, height: 800, data: pixels }, { colorType: 2 });
  return {
    ...imageWithBytes(syntheticImage(), bytes),
    filename: `合成大图-${seed}.png`,
    width: 800,
    height: 800,
  };
}
