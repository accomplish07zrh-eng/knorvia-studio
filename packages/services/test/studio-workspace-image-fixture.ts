// SPDX-License-Identifier: Apache-2.0
import type { TestContext } from "node:test";
import fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { workspaceReviewFixture } from "./studio-workspace-feedback-fixture.js";

const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function pngChunk(type: string, data: Buffer) {
  const name = Buffer.from(type);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([name, data])) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, name, data, checksum]);
}
/** Procedurally generated RGBA PNG; no user or upstream image bytes. */
export function syntheticPng(
  width = 3,
  height = 2,
  color = [160, 80, 20],
  padding = 0,
  animated = false,
) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 4 + 1) + 1 + x * 4;
      rows[offset] = color[0]!;
      rows[offset + 1] = color[1]!;
      rows[offset + 2] = color[2]!;
      rows[offset + 3] = 255;
    }
  const chunks = [pngChunk("IHDR", header)];
  if (animated) {
    const animation = Buffer.alloc(8);
    animation.writeUInt32BE(2);
    chunks.push(pngChunk("acTL", animation));
  }
  if (padding) chunks.push(pngChunk("npAD", Buffer.alloc(padding)));
  chunks.push(pngChunk("IDAT", deflateSync(rows)), pngChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
}
export const imageHash = (bytes: Buffer | null) =>
  bytes === null ? null : createHash("sha256").update(bytes).digest("hex");

export async function workspaceImageFixture(
  t: Pick<TestContext, "after">,
  files = [
    { path: "images/sample.png", before: syntheticPng(), after: syntheticPng(5, 4, [20, 80, 160]) },
  ] as {
    path: string;
    before: Buffer | null;
    after: Buffer | null;
  }[],
) {
  const f = await workspaceReviewFixture(t);
  for (const file of files) {
    await fs.mkdir(dirname(join(f.source, file.path)), { recursive: true });
    if (file.before !== null) await fs.writeFile(join(f.source, file.path), file.before);
  }
  const working = await f.workspaces.prepare({
    runId: "image-run",
    stepId: "image-step",
    sourcePath: f.source,
    mode: "isolated",
  });
  for (const file of files) {
    await fs.mkdir(dirname(join(working, file.path)), { recursive: true });
    if (file.after === null) await fs.rm(join(working, file.path));
    else await fs.writeFile(join(working, file.path), file.after);
  }
  f.db.transaction(() =>
    f.db.write(
      "workspace",
      "original:step",
      {
        runId: "image-run",
        stepId: "image-step",
        sourcePath: f.source,
        path: working,
      },
      "original",
    ),
  );
  const version = (path = files[0]!.path) => {
    const file = files.find((entry) => entry.path === path)!;
    return {
      beforeHash: imageHash(file.before),
      afterHash: imageHash(file.after),
      sourceHash: imageHash(file.before),
    };
  };
  const read = async (path = files[0]!.path) =>
    (
      await f.service.workspaceChanges({
        runId: "original",
        stepId: "step",
        imagePreview: { path, version: version(path) },
      })
    ).find((change) => change.path === path)!;
  return { ...f, working, files, version, read };
}
