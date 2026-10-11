// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  BASELINE_SCHEMA,
  imageFileName,
  imageMetaFileName,
  readCapture,
  readRepoCommit,
  sha256,
  writeCapture,
} from "../lib/baseline.mjs";
import { encodePng } from "../lib/png.mjs";

function fakeImage(width = 3, height = 2, fill = 200) {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = fill;
    data[index + 1] = fill;
    data[index + 2] = fill;
    data[index + 3] = 255;
  }
  return { width, height, data };
}

function record(overrides = {}) {
  const image = fakeImage();
  return {
    page: "chat-single",
    pageTitle: "主界面 · 单聊（内置内核）",
    theme: "light",
    width: 1360,
    height: 900,
    image: encodePng(image),
    geometry: {
      "v4-composer": { matches: 1, visibleMatches: 1, box: { x: 1, y: 2, width: 3, height: 4 } },
    },
    signals: { bodyTextSha256: "abc", consoleErrors: [] },
    screenshotMs: 12,
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const commit = {
  head: "a".repeat(40),
  headSubject: "test",
  branch: "b",
  mainTip: null,
  mainBase: null,
};

test("写出的产物可以用 readCapture 原样读回", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ui-baseline-test-"));
  try {
    const manifest = await writeCapture({
      out: directory,
      pagesFile: "scripts/ui-baseline/pages.json",
      pagesSha256: "deadbeef",
      themes: ["light"],
      viewports: [{ width: 1360, height: 900 }],
      environment: { platform: process.platform, arch: process.arch, chromium: { version: "1" } },
      commit,
      records: [record()],
    });
    assert.equal(manifest.schema, BASELINE_SCHEMA);
    assert.equal(manifest.images.length, 1);
    assert.equal(manifest.images[0].file, "chat-single/light-1360.png");
    assert.equal(manifest.images[0].commit, commit.head);

    const reopened = await readCapture(directory);
    assert.equal(reopened.entries.length, 1);
    const entry = reopened.entries[0];
    assert.equal(entry.imagePath, join(directory, "chat-single", imageFileName("light", 1360)));
    assert.equal(entry.meta.page, "chat-single");
    assert.deepEqual(entry.meta.geometry["v4-composer"].box, { x: 1, y: 2, width: 3, height: 4 });
    // 每张图都要能追到生成时的提交。
    assert.equal(entry.meta.commit.head, commit.head);
    const buffered = await readFile(entry.imagePath);
    assert.equal(sha256(buffered), entry.image.imageSha256);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("sidecar 文件名与图片名一一对应", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ui-baseline-test-"));
  try {
    await writeCapture({
      out: directory,
      pagesFile: "p",
      pagesSha256: "x",
      themes: ["dark"],
      viewports: [{ width: 390, height: 844 }],
      environment: {},
      commit,
      records: [record({ theme: "dark", width: 390, height: 844 })],
    });
    await readFile(join(directory, "chat-single", imageMetaFileName("dark", 390)));
    await assert.rejects(readFile(join(directory, "chat-single", imageMetaFileName("light", 390))));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("清单 schema 或 sidecar 缺失时报错，而不是静默比较", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ui-baseline-test-"));
  try {
    await assert.rejects(readCapture(directory), /读取基线清单失败/);
    await mkdir(join(directory, "chat-single"), { recursive: true });
    await writeFile(join(directory, "manifest.json"), JSON.stringify({ schema: 99, images: [] }));
    await assert.rejects(readCapture(directory), /schema 不匹配/);
    await writeFile(
      join(directory, "manifest.json"),
      JSON.stringify({
        schema: BASELINE_SCHEMA,
        images: [{ page: "chat-single", theme: "light", width: 1360, height: 900, file: "x.png" }],
      }),
    );
    await assert.rejects(readCapture(directory), /ENOENT|no such file/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("仓库提交信息可以从当前仓库读出", () => {
  const info = readRepoCommit(join(import.meta.dirname, "..", "..", ".."));
  assert.match(info.head ?? "", /^[0-9a-f]{40}$/u);
  assert.equal(info.headSubject?.length > 0, true);
});
