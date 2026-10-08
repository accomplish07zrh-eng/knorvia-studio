import { createHash, randomUUID } from "node:crypto";
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
