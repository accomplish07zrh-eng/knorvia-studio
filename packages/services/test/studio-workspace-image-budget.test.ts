// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceImageFormat } from "../src/studio-runtime/domain/workspaceImage.js";
import {
  syntheticPng,
  syntheticDeclaredPng,
  syntheticDeclaredJpeg,
  workspaceImageFixture,
} from "./studio-workspace-image-fixture.js";

test("small PNG/JPEG with extreme declared dimensions are refused by Host before returning image bytes", async (t) => {
  const files = [
    { path: "huge.png", before: syntheticPng(), after: syntheticDeclaredPng(0xffffffff, 1) },
    { path: "huge.jpg", before: null, after: syntheticDeclaredJpeg(65535, 65535) },
  ];
  const f = await workspaceImageFixture(t, files);
  for (const file of files) {
    assert.ok(file.after.length < 200);
    assert.deepEqual((await f.read(file.path)).imagePreview?.after, {
      kind: "unsupported",
      reason: "display-budget",
    });
  }
  assert.equal(f.calls.length, 0);
});

test("PNG/JPEG header admission includes the normal, pixel and edge boundaries without decoding large fixtures", () => {
  for (const [path, make] of [
    ["sample.png", syntheticDeclaredPng],
    ["sample.jpg", syntheticDeclaredJpeg],
  ] as const) {
    for (const [width, height] of [
      [3, 2],
      [8000, 6000],
      [16384, 1],
      [1, 16384],
    ]) {
      const bytes = make(width!, height!);
      assert.ok(bytes.length < 200);
      assert.equal(workspaceImageFormat(path, bytes).kind, "image");
    }
    for (const [width, height] of [
      [8000, 6001],
      [6001, 8000],
      [16385, 1],
      [1, 16385],
    ])
      assert.deepEqual(workspaceImageFormat(path, make(width!, height!)), {
        kind: "unsupported",
        reason: "display-budget",
      });
  }
});
