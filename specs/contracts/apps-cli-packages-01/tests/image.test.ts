// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01 合同测试：image/*（B88–B94）。
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./entry.mjs";
import { pngBytes, webpBytes } from "./png.mjs";

const imageIndex = await load("image/index");
const compression = await load("image/jimp-compression");
const budget = await load("image/image-budget");
const media = await load("image/jimp-media");
const webp = await load("image/webp-passthrough");

const { createJimpImageProcessorAdapter } = imageIndex;
const { createImageBudget, fitsImageBudget, validatePrepareRequest } = budget;

function request(overrides = {}) {
  return {
    data: pngBytes(1, 1),
    mediaType: "image/png",
    maxBase64Bytes: 1_000_000,
    maxDimension: 512,
    maxRawBytes: 1_000_000,
    ...overrides,
  };
}

test("B88 resizeToFit 的尺寸与直通语义", async () => {
  const adapter = createJimpImageProcessorAdapter();
  await assert.rejects(
    () => adapter.resizeToFit({ data: pngBytes(1, 1), mediaType: "image/png", maxDimension: 0 }),
    (error) =>
      error.constructor === Error &&
      error.message === "Image resize maxDimension must be a positive finite number",
  );
  await assert.rejects(
    () =>
      adapter.resizeToFit({
        data: pngBytes(1, 1),
        mediaType: "image/png",
        maxDimension: Number.NaN,
      }),
    (error) => error.message === "Image resize maxDimension must be a positive finite number",
  );
  const webpInput = webpBytes(32);
  const passedThrough = await adapter.resizeToFit({
    data: webpInput,
    mediaType: "image/webp",
    maxDimension: 4,
  });
  assert.equal(passedThrough.mediaType, "image/webp");
  assert.equal(passedThrough.resized, false);
  assert.deepEqual(Buffer.from(passedThrough.data), webpInput);
  assert.notEqual(passedThrough.data, webpInput);
  const small = await adapter.resizeToFit({
    data: pngBytes(1, 1),
    mediaType: "image/png",
    maxDimension: 8,
  });
  assert.equal(small.resized, false);
  assert.equal(small.width, 1);
  assert.equal(small.height, 1);
  const resized = await adapter.resizeToFit({
    data: pngBytes(4, 2),
    mediaType: "image/png",
    maxDimension: 2,
  });
  assert.equal(resized.resized, true);
  assert.equal(resized.width, 2);
  assert.equal(resized.height, 1);
  assert.equal(resized.originalWidth, 4);
  assert.equal(resized.originalHeight, 2);
});

test("B89 prepareForModel 的入口校验与空数据", async () => {
  const adapter = createJimpImageProcessorAdapter();
  await assert.rejects(
    () => adapter.prepareForModel(request({ maxRawBytes: 0 })),
    (error) =>
      error.code === "invalid_request" &&
      error.message === "Image maxRawBytes must be a positive finite number",
  );
  await assert.rejects(
    () => adapter.prepareForModel(request({ maxDimension: 0 })),
    (error) =>
      error.code === "invalid_request" &&
      error.message === "Image resize maxDimension must be a positive finite number",
  );
  await assert.rejects(
    () => adapter.prepareForModel(request({ maxBase64Bytes: 0 })),
    (error) =>
      error.code === "invalid_request" &&
      error.message === "Image maxBase64Bytes must be a positive finite number",
  );
  await assert.rejects(
    () => adapter.prepareForModel(request({ data: Buffer.alloc(0) })),
    (error) => error.code === "empty" && error.message === "Image file is empty (0 bytes)",
  );
  await assert.rejects(
    () => adapter.prepareForModel(request({ data: Buffer.from([1, 2, 3, 4, 5, 6]) })),
    (error) =>
      error.code === "processing_failed" && error.message === "Unable to decode image data",
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => adapter.prepareForModel(request({ maxRawBytes: 0 }), { signal: controller.signal }),
    (error) => error.message === "Image resize was cancelled",
  );
  assert.throws(
    () => validatePrepareRequest(request({ maxDimension: -1 })),
    (error) => error.code === "invalid_request",
  );
});

test("B90 原图直通与 WebP 直通", async () => {
  const adapter = createJimpImageProcessorAdapter();
  const original = pngBytes(1, 1);
  const result = await adapter.prepareForModel(request({ data: original }));
  assert.equal(result.strategy, "original");
  assert.equal(result.compressed, false);
  assert.equal(result.resized, false);
  assert.equal(result.mediaType, "image/png");
  assert.deepEqual(Buffer.from(result.data), original);
  assert.equal(result.originalSizeBytes, original.byteLength);
  const webpInput = webpBytes(32);
  const webpResult = await adapter.prepareForModel(
    request({ data: webpInput, mediaType: "image/webp" }),
  );
  assert.equal(webpResult.strategy, "original");
  assert.equal(webpResult.resized, false);
  assert.equal(webpResult.mediaType, "image/webp");
  assert.deepEqual(Buffer.from(webpResult.data), webpInput);
  assert.notEqual(webpResult.data, webpInput);
  assert.equal(
    webp.prepareWebpPassthrough(webpInput, request({ data: webpInput, mediaType: "image/webp" }))
      .data,
    webpInput,
  );
  await assert.rejects(
    () =>
      adapter.prepareForModel(
        request({ data: webpInput, mediaType: "image/webp", maxRawBytes: 1 }),
      ),
    (error) =>
      error.code === "unsupported" &&
      error.message ===
        "WebP image exceeds the model image budget and the current image adapter cannot transcode WebP",
  );
  assert.equal(webp.prepareWebpPassthrough === undefined, false);
});

test("B91 图片预算计算与判定", () => {
  const computed = createImageBudget(
    request({ maxBase64Bytes: 10.9, maxRawBytes: 3.7, tokenToBase64CharRatio: undefined }),
  );
  assert.deepEqual(computed, {
    maxBase64Bytes: 10,
    maxRawBytes: 3,
    maxTokens: undefined,
    tokenToBase64CharRatio: 0.125,
  });
  assert.equal(
    fitsImageBudget(Buffer.alloc(3), {
      maxBase64Bytes: 4,
      maxRawBytes: 3,
      tokenToBase64CharRatio: 0.125,
    }),
    true,
  );
  assert.equal(
    fitsImageBudget(Buffer.alloc(3), {
      maxBase64Bytes: 3,
      maxRawBytes: 3,
      tokenToBase64CharRatio: 0.125,
    }),
    false,
  );
  assert.equal(
    fitsImageBudget(Buffer.alloc(4), {
      maxBase64Bytes: 8,
      maxRawBytes: 4,
      tokenToBase64CharRatio: 0.125,
    }),
    true,
  );
  assert.equal(
    fitsImageBudget(Buffer.alloc(4), {
      maxBase64Bytes: 8,
      maxRawBytes: 4,
      maxTokens: 1,
      tokenToBase64CharRatio: 0.125,
    }),
    true,
  );
  assert.equal(
    fitsImageBudget(Buffer.alloc(4), {
      maxBase64Bytes: 8,
      maxRawBytes: 4,
      maxTokens: 0,
      tokenToBase64CharRatio: 0.125,
    }),
    false,
  );
});

test("B92 媒体类型工具与取消语义", () => {
  assert.equal(media.normalizeMediaType("IMAGE/JPG"), "image/jpeg");
  assert.equal(media.normalizeMediaType("image/bmp"), "image/png");
  assert.equal(media.normalizeMediaType(""), "image/png");
  assert.equal(media.jimpOutputMediaType("image/tiff", "image/png"), "image/tiff");
  assert.equal(media.jimpOutputMediaType("image/avif", "image/gif"), "image/gif");
  assert.equal(media.jimpOutputMediaType("image/avif", "image/avif"), "image/png");
  assert.equal(typeof media.detectImageMediaType, "function");
  const controller = new AbortController();
  controller.abort();
  assert.throws(
    () => media.throwIfAborted(controller.signal),
    (error) => error.message === "Image resize was cancelled",
  );
  assert.equal(media.throwIfAborted(undefined), undefined);
});

test("B93 压缩策略选择与结果语义", async () => {
  const adapter = createJimpImageProcessorAdapter();
  const noisy = pngBytes(120, 120, { noise: true });
  const generous = await adapter.prepareForModel(request({ data: noisy }));
  assert.equal(generous.strategy, "original");
  const compressionRequest = request({
    data: noisy,
    maxBase64Bytes: 1_000_000,
    maxRawBytes: 20_000,
  });
  const compressed = await adapter.prepareForModel(compressionRequest);
  assert.equal(
    fitsImageBudget(Buffer.from(compressed.data), createImageBudget(compressionRequest)),
    true,
  );
  assert.equal(
    ["png-optimized", "jpeg-quality", "preserve-format", "resized", "jpeg-fallback"].includes(
      compressed.strategy,
    ),
    true,
  );
  assert.equal(compressed.originalSizeBytes, noisy.byteLength);
  assert.equal(compressed.transformedSizeBytes, Buffer.from(compressed.data).byteLength);
  await assert.rejects(
    () => adapter.prepareForModel(request({ data: noisy, maxRawBytes: 50 })),
    (error) =>
      error.code === "too_large" &&
      error.message ===
        `Unable to compress image (${noisy.byteLength} bytes) within the requested model image budget`,
  );
  const bounded = await adapter.prepareForModel(
    request({ data: noisy, maxDimension: 40, maxRawBytes: 20_000 }),
  );
  assert.equal(bounded.width <= 40 && bounded.height <= 40, true);
  await assert.rejects(
    () => compression.prepareJimpImageForModel(request({ data: noisy, maxRawBytes: 50 })),
    (error) => error.code === "too_large",
  );
});

test("B94 image 导出面", async () => {
  assert.deepEqual(Object.keys(imageIndex), ["createJimpImageProcessorAdapter"]);
  assert.deepEqual(Object.keys(compression), ["prepareJimpImageForModel"]);
  assert.deepEqual(Object.keys(webp), ["prepareWebpPassthrough"]);
  assert.deepEqual(Object.keys(budget).sort(), [
    "createImageBudget",
    "fitsImageBudget",
    "validatePrepareRequest",
  ]);
  assert.deepEqual(Object.keys(media).sort(), [
    "detectImageMediaType",
    "jimpOutputMediaType",
    "normalizeMediaType",
    "throwIfAborted",
  ]);
  assert.equal(compression.selectEncoding, undefined);
  assert.equal(compression.EncodedChoice, undefined);
  assert.equal(compression.QUALITY_LEVELS, undefined);
  assert.equal(media.normalizeMediaType("image/jpg"), "image/jpeg");
  assert.equal(budget.fitsImageBudget(Buffer.alloc(3), createImageBudget(request())), true);
});
