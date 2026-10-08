// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  workspaceImageFixture,
  workspaceImageRasterFiles,
  syntheticRasterPng,
  syntheticDeclaredJpeg,
  jpegWithoutEntropy,
} from "./studio-workspace-image-fixture.js";

test("Host refuses CRC, checksum, missing/short/truncated/extra rows and invalid PNG filters before returning bytes", async (t) => {
  const files = workspaceImageRasterFiles().filter((file) => file.path.endsWith("-raster.png"));
  const f = await workspaceImageFixture(t, files);
  for (const file of files) {
    assert.deepEqual(
      (await f.read(file.path)).imagePreview?.after,
      {
        kind: "unsupported",
        reason: "invalid-format",
      },
      file.path,
    );
    assert.deepEqual(await readFile(join(f.source, file.path)), file.before);
  }
});

test("complete transparent, Adam7, low-bit grayscale/indexed and 16-bit RGB PNG rows remain previewable", async (t) => {
  const files = workspaceImageRasterFiles().filter((file) => !file.path.endsWith("-raster.png"));
  files.push(
    {
      ...files[0]!,
      path: "gray.png",
      after: syntheticRasterPng(Buffer.alloc(4), { colorType: 0, bitDepth: 1 }),
    },
    {
      ...files[0]!,
      path: "indexed.png",
      after: syntheticRasterPng(Buffer.alloc(4), {
        colorType: 3,
        bitDepth: 1,
        palette: Buffer.from([255, 0, 0]),
      }),
    },
    {
      ...files[0]!,
      path: "rgb16.png",
      after: syntheticRasterPng(Buffer.alloc(38), { colorType: 2, bitDepth: 16 }),
    },
  );
  const f = await workspaceImageFixture(t, files);
  for (const file of files) {
    const side = (await f.read(file.path)).imagePreview?.after;
    assert.equal(side?.kind, "image", file.path);
    if (side?.kind === "image")
      assert.deepEqual(Buffer.from(side.dataBase64, "base64"), file.after);
  }
});

test("JPEG SOS without any entropy bytes is refused instead of a recoverable blank preview", async (t) => {
  const f = await workspaceImageFixture(t, [
    {
      path: "empty-scan.jpg",
      before: null,
      after: jpegWithoutEntropy(syntheticDeclaredJpeg(3, 2)),
    },
  ]);
  assert.deepEqual((await f.read()).imagePreview?.after, {
    kind: "unsupported",
    reason: "invalid-format",
  });
});
