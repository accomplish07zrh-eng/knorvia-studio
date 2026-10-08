// SPDX-License-Identifier: Apache-2.0
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { crc32, createInflate } from "node:zlib";
import { workspaceImageFormat } from "../domain/workspaceImage.js";

interface Rows {
  stride: number;
  count: number;
}
function rowLayout(bytes: Buffer): Rows[] | null {
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const depth = bytes[24]!;
  const color = bytes[25]!;
  const channels = [1, undefined, 3, 1, 2, undefined, 4][color];
  const depths = color === 0 ? [1, 2, 4, 8, 16] : color === 3 ? [1, 2, 4, 8] : [8, 16];
  if (!channels || !depths.includes(depth) || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28]! > 1)
    return null;
  const passes =
    bytes[28] === 0
      ? [[0, 0, 1, 1]]
      : [
          [0, 0, 8, 8],
          [4, 0, 8, 8],
          [0, 4, 4, 8],
          [2, 0, 4, 4],
          [0, 2, 2, 4],
          [1, 0, 2, 2],
          [0, 1, 1, 2],
        ];
  return passes.flatMap(([x, y, dx, dy]) => {
    const w = Math.ceil(Math.max(0, width - x!) / dx!);
    const h = Math.ceil(Math.max(0, height - y!) / dy!);
    return w && h ? [{ stride: 1 + Math.ceil((w * channels * depth) / 8), count: h }] : [];
  });
}
function compressedLength(bytes: Buffer): number | null {
  let offset = 8;
  let dataState = 0;
  let paletteEntries = 0;
  let transparency = false;
  let total = 0;
  const color = bytes[25]!;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + length + 12;
    if (
      end > bytes.length ||
      crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)
    )
      return null;
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") {
      if (dataState === 2 || (color === 3 && !paletteEntries)) return null;
      dataState = 1;
      total += length;
    } else {
      if (dataState === 1) dataState = 2;
      if (type === "PLTE") {
        if (
          dataState ||
          paletteEntries ||
          color === 0 ||
          color === 4 ||
          !length ||
          length % 3 ||
          length > 768
        )
          return null;
        paletteEntries = length / 3;
        if (color === 3 && paletteEntries > 2 ** bytes[24]!) return null;
      } else if (type === "tRNS") {
        if (
          dataState ||
          transparency ||
          !(color === 0
            ? length === 2
            : color === 2
              ? length === 6
              : color === 3 && length > 0 && length <= paletteEntries)
        )
          return null;
        transparency = true;
      } else if (type === "IEND") {
        return dataState && length === 0 && end === bytes.length ? total : null;
      } else if (type === "IHDR") {
        if (offset !== 8) return null;
      } else if (/^[A-Z]/.test(type) || type === "fcTL" || type === "fdAT") return null;
    }
    offset = end;
  }
  return null;
}
function* idatChunks(bytes: Buffer) {
  for (let offset = 8; offset + 12 <= bytes.length; ) {
    const length = bytes.readUInt32BE(offset);
    if (length && bytes.toString("ascii", offset + 4, offset + 8) === "IDAT")
      yield bytes.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
  }
}
/** Bounded integrity check, not pixel reconstruction, resizing or color conversion. */
export async function validWorkspacePngRaster(bytes: Buffer): Promise<boolean> {
  if (workspaceImageFormat("preview.png", bytes).kind !== "image") return false;
  const layout = rowLayout(bytes);
  const compressedBytes = compressedLength(bytes);
  if (!layout?.length || !compressedBytes) return false;
  const expected = layout.reduce((sum, rows) => sum + rows.stride * rows.count, 0);
  const inflate = createInflate({ chunkSize: 64 * 1024 });
  try {
    // Chromium 会把缺行 PNG 恢复为空白成功图；必须先验证完整流和逐行长度，不能看透明度。
    const valid = await pipeline(
      Readable.from(idatChunks(bytes)),
      inflate,
      async (source: AsyncIterable<Buffer>) => {
        let total = 0,
          pass = 0,
          row = 0,
          position = 0;
        for await (const chunk of source) {
          total += chunk.length;
          if (total > expected) throw new Error("PNG raster exceeds declared rows");
          for (let cursor = 0; cursor < chunk.length; ) {
            const rows = layout[pass];
            if (!rows || (position === 0 && chunk[cursor]! > 4))
              throw new Error("Invalid PNG filter");
            const count = Math.min(chunk.length - cursor, rows.stride - position);
            position += count;
            cursor += count;
            if (position === rows.stride) {
              position = 0;
              if (++row === rows.count) {
                row = 0;
                pass++;
              }
            }
          }
        }
        return total === expected && pass === layout.length && position === 0;
      },
    );
    return valid && inflate.bytesWritten === compressedBytes;
  } catch {
    return false;
  }
}
