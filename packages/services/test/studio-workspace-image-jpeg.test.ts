// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { workspaceImageFixture, jpegWithoutEntropy } from "./studio-workspace-image-fixture.js";

const image = (name: string) =>
  readFile(new URL(`./fixtures/workspace-jpeg/${name}.jpg`, import.meta.url));

test("Host refuses the exact integration JPEG retaining only 1/2/4 entropy bytes", async (t) => {
  const baseline = await image("baseline");
  const scanEnd = jpegWithoutEntropy(baseline).length - 2;
  const files = [1, 2, 4].map((retained) => ({
    path: `truncated-${retained}.jpg`,
    before: baseline,
    after: Buffer.concat([baseline.subarray(0, scanEnd + retained), Buffer.from([255, 217])]),
  }));
  const f = await workspaceImageFixture(t, files);
  const sides = await Promise.all(
    files.map(async (file) => (await f.read(file.path)).imagePreview!.after),
  );
  assert.deepEqual(
    sides,
    files.map(() => ({ kind: "unsupported", reason: "invalid-format" })),
  );
});

test("complete independent baseline/progressive, grayscale and CMYK JPEG preserve their original bytes", async (t) => {
  const files = await Promise.all(
    ["baseline", "progressive", "gray", "cmyk"].map(async (name) => ({
      path: `${name}.jpg`,
      before: null,
      after: await image(name),
    })),
  );
  const f = await workspaceImageFixture(t, files);
  for (const file of files) {
    const side = (await f.read(file.path)).imagePreview!.after;
    assert.equal(side?.kind, "image", file.path);
    if (side?.kind === "image")
      assert.deepEqual(Buffer.from(side.dataBase64, "base64"), file.after);
  }
});

test("complete JPEG at the 16384 edge and an 18 MP image retain the comparison budget rather than B input limits", async (t) => {
  const files = await Promise.all(
    ["edge", "large-gray"].map(async (name) => ({
      path: `${name}.jpg`,
      before: null,
      after: await image(name),
    })),
  );
  const f = await workspaceImageFixture(t, files);
  for (const file of files)
    assert.equal((await f.read(file.path)).imagePreview!.after?.kind, "image", file.path);
});
