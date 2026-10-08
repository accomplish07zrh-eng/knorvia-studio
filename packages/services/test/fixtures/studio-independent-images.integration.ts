import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { crc32, deflateSync } from "node:zlib";

interface IndependentImage {
  mime: "image/png" | "image/jpeg";
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  dataBase64: string;
}

/** Pillow independently encoded these synthetic pixels; no user screenshots or profiles. */
export async function independentImages(): Promise<Record<string, IndependentImage>> {
  return JSON.parse(
    await readFile(
      new URL("./studio-independent-images.integration.json", import.meta.url),
      "utf8",
    ),
  );
}

export function independentImageInput(
  image: IndependentImage,
  id: string,
  filename = `${id}.${image.mime === "image/png" ? "png" : "jpg"}`,
) {
  return {
    id,
    filename,
    mimeType: image.mime,
    sizeBytes: image.bytes,
    width: image.width,
    height: image.height,
    sha256: image.sha256,
    dataBase64: image.dataBase64,
  };
}

function chunk(name: string, bytes: Buffer) {
  const result = Buffer.alloc(bytes.length + 12);
  result.writeUInt32BE(bytes.length);
  result.write(name, 4, "ascii");
  bytes.copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, result.length - 4)), result.length - 4);
  return result;
}

/** Real 800×800 RGB PNGs cross the receipt-character boundary inside the image-byte budget. */
export function independentBudgetImage(seed: number, id: string) {
  const width = 800;
  const height = 800;
  const rows = Buffer.alloc((width * 3 + 1) * height);
  let value = seed >>> 0;
  for (let y = 0; y < height; y++) {
    const start = y * (width * 3 + 1);
    for (let x = 1; x <= width * 3; x++) {
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      rows[start + x] = value >>> 24;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 0 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return independentImageInput(
    {
      mime: "image/png",
      width,
      height,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      dataBase64: bytes.toString("base64"),
    },
    id,
  );
}
