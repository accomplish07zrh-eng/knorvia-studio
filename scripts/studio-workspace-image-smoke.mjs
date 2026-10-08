// SPDX-License-Identifier: Apache-2.0
// Real review card + compiled product CSS -> existing RPC-shaped query/apply -> SQLite/snapshot owner.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import {
  compileWorkspaceImageBrowser,
  syntheticBrowserJpeg,
  verifyWorkspaceImageRasters,
} from "./studio-workspace-image-browser-fixture.mjs";
import { chromium } from "playwright-core";
import {
  workspaceImageFixture,
  syntheticPng,
  pngChunk,
  syntheticDeclaredPng,
  syntheticDeclaredJpeg,
  workspaceImageRasterFiles,
  jpegWithoutEntropy,
} from "../packages/services/test/studio-workspace-image-fixture.ts";

const cleanup = [];
const browser = await chromium.launch({
  executablePath: process.argv[2] ?? "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
let server;
let page;
let delayed;
let delayNext = false;
const previewRequests = [];
try {
  const seed = await browser.newPage();
  const jpeg = (width, height, color) => syntheticBrowserJpeg(seed, width, height, color);
  const oriented = (bytes) => {
    const exif = Buffer.alloc(32);
    exif.write("Exif\0\0II", 0, "binary");
    exif.writeUInt16LE(42, 8);
    exif.writeUInt32LE(8, 10);
    exif.writeUInt16LE(1, 14);
    exif.writeUInt16LE(0x112, 16);
    exif.writeUInt16LE(3, 18);
    exif.writeUInt32LE(1, 20);
    exif.writeUInt16LE(6, 24);
    const marker = Buffer.from([255, 225, 0, exif.length + 2]);
    return Buffer.concat([bytes.subarray(0, 2), marker, exif, bytes.subarray(2)]);
  };
  const valid = syntheticPng();
  const broken = Buffer.concat([
    valid.subarray(0, 33),
    pngChunk("IDAT", Buffer.from("not zlib pixels")),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  const emptyScan = await jpeg(3, 2, "#884422");
  const files = [
    { path: "images/sample.png", before: valid, after: syntheticPng(5, 4, [10, 80, 180]) },
    {
      path: "other/sample.png",
      before: syntheticPng(512, 128),
      after: syntheticPng(640, 64, [10, 80, 180]),
    },
    { path: "huge.png", before: valid, after: syntheticDeclaredPng(0xffffffff, 1) },
    { path: "huge.jpg", before: null, after: syntheticDeclaredJpeg(65535, 65535) },
    { path: "added.png", before: null, after: syntheticPng(4, 7) },
    { path: "deleted.png", before: syntheticPng(8, 3), after: null },
    { path: "broken.png", before: valid, after: broken },
    { path: "decode-error.png", before: valid, after: syntheticPng(5, 4) },
    {
      path: "broken.jpg",
      before: await jpeg(3, 2, "#884422"),
      after: Buffer.from([
        255, 216, 255, 192, 0, 17, 8, 0, 2, 0, 3, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0, 255, 218, 0, 12,
        3, 1, 0, 2, 0, 3, 0, 0, 63, 0, 0, 0, 255, 217,
      ]),
    },
    { path: "animated.png", before: valid, after: syntheticPng(4, 3, [1, 2, 3], 0, true) },
    {
      path: "oriented.jpg",
      before: oriented(await jpeg(3, 2, "#884422")),
      after: oriented(await jpeg(6, 4, "#224488")),
    },
    ...workspaceImageRasterFiles(),
    { path: "empty-scan.jpg", before: emptyScan, after: jpegWithoutEntropy(emptyScan) },
  ];
  await seed.close();
  const one = await workspaceImageFixture({ after: (fn) => cleanup.push(fn) }, files);
  const two = await workspaceImageFixture({ after: (fn) => cleanup.push(fn) }, [
    { ...files[0], after: syntheticPng(17, 9) },
  ]);
  const three = await workspaceImageFixture({ after: (fn) => cleanup.push(fn) }, [files[0]]);
  const secondWorking = await one.workspaces.prepare({
    runId: "image-second",
    stepId: "image-step",
    sourcePath: one.source,
    mode: "isolated",
  });
  await fs.writeFile(join(secondWorking, files[0].path), syntheticPng(13, 7));
  one.db.transaction(() => {
    one.db.write(
      "run",
      "second-run",
      { ...one.db.read("run", "original"), id: "second-run" },
      "review",
    );
    one.db.write(
      "workspace",
      "second-run:step",
      { runId: "image-second", stepId: "image-step", sourcePath: one.source, path: secondWorking },
      "second-run",
    );
  });
  const initial = {
    one: {
      original: await one.service.workspaceChanges({ runId: "original", stepId: "step" }),
      "second-run": await one.service.workspaceChanges({ runId: "second-run", stepId: "step" }),
    },
    two: { original: await two.service.workspaceChanges({ runId: "original", stepId: "step" }) },
    three: {
      original: await three.service.workspaceChanges({ runId: "original", stepId: "step" }),
    },
  };
  const { source, css } = await compileWorkspaceImageBrowser();
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.pathname === "/") {
        response.setHeader("Content-Type", "text/html");
        response.end(
          '<!doctype html><html class="knorvia-dark"><head><link rel="stylesheet" href="/style.css"></head><body style="margin:20px"><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>',
        );
        return;
      }
      if (url.pathname === "/bundle.js") {
        response.setHeader("Content-Type", "text/javascript");
        response.end(source);
        return;
      }
      if (url.pathname === "/style.css") {
        response.setHeader("Content-Type", "text/css");
        response.end(css);
        return;
      }
      response.setHeader("Content-Type", "application/json");
      if (url.pathname === "/initial") {
        response.end(JSON.stringify(initial));
        return;
      }
      const f =
        url.searchParams.get("host") === "two"
          ? two
          : url.searchParams.get("host") === "three"
            ? three
            : one;
      let body = "";
      for await (const chunk of request) body += chunk;
      const params = JSON.parse(body);
      if (url.pathname === "/changes") {
        const value = await f.service.workspaceChanges(params);
        if (params.imagePreview) {
          previewRequests.push({
            host: url.searchParams.get("host"),
            runId: params.runId,
            path: params.imagePreview.path,
          });
          if (delayNext) {
            delayNext = false;
            await new Promise((release) => {
              delayed = release;
            });
          }
        }
        // Deliberately corrupt only this synthetic transport response after the real Host read.
        // This exercises browser failure independent of Chromium's partial-file recovery.
        if (params.imagePreview?.path === "decode-error.png") {
          const image = value[0].imagePreview.after;
          image.dataBase64 = Buffer.alloc(image.totalBytes).toString("base64");
        }
        response.end(JSON.stringify(value));
      } else if (url.pathname === "/apply") {
        await f.service.applyWorkspaceChanges(params);
        response.end("null");
      } else {
        response.statusCode = 404;
        response.end("null");
      }
    } catch (error) {
      response.statusCode = 409;
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const card = page.locator('[data-workspace-review-path="images/sample.png"]');
  const expand = async (path = "images/sample.png") => {
    const toggle = page.getByRole("button", {
      name: new RegExp(`^${path.replaceAll(".", "\\.")} ·`),
    });
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  };
  const awaitDelayed = async () => {
    for (let attempt = 0; attempt < 1000 && !delayed; attempt++)
      await new Promise((done) => setTimeout(done, 5));
    assert.ok(delayed, "Expected the selected image request to reach its Host");
  };
  const ready = () =>
    page.locator('[data-image-side="after"] img[data-image-display="ready"]').waitFor();
  const choose = async (path) => {
    await page.getByRole("button", { name: path, exact: true }).click();
    await expand(path);
  };
  assert.equal(previewRequests.length, 0);
  await choose("images/sample.png");
  await ready();
  assert.equal(await card.locator("img[data-image-display=ready]").count(), 2);
  assert.match(await card.locator('[data-image-side="before"]').innerText(), /3 × 2/);
  assert.match(await card.locator('[data-image-side="after"]').innerText(), /5 × 4/);
  await choose("other/sample.png");
  await ready();
  await page.locator('[data-image-side="before"] img[data-image-display="ready"]').waitFor();
  if (process.argv[3])
    await page.locator('[data-workspace-review-path="other/sample.png"]').screenshot({
      path: process.argv[3],
    });
  const geometry = await page.locator('[data-image-side="after"] img').evaluate((image) => {
    const actual = image.getBoundingClientRect();
    const container = image.parentElement.getBoundingClientRect();
    return {
      width: actual.width,
      height: actual.height,
      containerWidth: container.width,
      containerHeight: container.height,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    };
  });
  assert.ok(geometry.width < geometry.naturalWidth && geometry.height < geometry.containerHeight);
  assert.ok(Math.abs(geometry.width / geometry.height - 10) < 0.4);
  await page.getByRole("button", { name: "Actual display size", exact: true }).click();
  assert.equal(
    await page
      .locator('[data-image-side="after"] img')
      .evaluate((image) => image.getBoundingClientRect().width),
    642,
  );
  assert.ok(
    await page
      .locator('[data-image-side="after"] img')
      .evaluate(
        (image) =>
          image.getBoundingClientRect().left >= image.parentElement.getBoundingClientRect().left,
      ),
    "Original-size image must remain scrollable from its left edge",
  );
  await choose("added.png");
  await ready();
  assert.match(await page.locator('[data-image-side="before"]').innerText(), /does not exist/);
  await choose("deleted.png");
  await page.locator('[data-image-side="before"] img[data-image-display="ready"]').waitFor();
  assert.match(await page.locator('[data-image-side="after"]').innerText(), /does not exist/);
  await choose("broken.png");
  await page.getByRole("alert").filter({ hasText: "not a valid static" }).waitFor();
  await choose("broken.jpg");
  await page.getByRole("alert").filter({ hasText: "not a valid static" }).waitFor();
  await choose("decode-error.png");
  await page.getByRole("alert").filter({ hasText: "Unable to decode" }).waitFor();
  assert.ok(
    await page.evaluate(() =>
      window.__brokenImages.some((image) => image.complete && !image.width && !image.height),
    ),
  );
  await choose("animated.png");
  await page.getByRole("alert").filter({ hasText: "Animated image" }).waitFor();
  assert.equal(await page.locator('[data-image-side="after"] img').count(), 0);
  for (const path of ["huge.png", "huge.jpg"]) {
    await choose(path);
    await page.getByRole("alert").filter({ hasText: "Preview dimensions exceed" }).waitFor();
    assert.equal(await page.locator('[data-image-side="after"] img').count(), 0);
  }
  await verifyWorkspaceImageRasters(page, choose, ready);
  await choose("oriented.jpg");
  await ready();
  assert.match(await page.locator('[data-image-side="before"]').innerText(), /2 × 3/);
  assert.match(await page.locator('[data-image-side="after"]').innerText(), /4 × 6/);
  await choose("images/sample.png");
  await ready();
  const toggle = page.getByRole("button", { name: /^images\/sample\.png ·/ });
  for (let iteration = 0; iteration < 3; iteration++) {
    await toggle.click();
    assert.equal(await page.locator("[data-image-compare]").count(), 0);
    await toggle.click();
    await ready();
  }
  await toggle.click();
  delayNext = true;
  await toggle.click();
  await awaitDelayed();
  await choose("other/sample.png");
  await ready();
  delayed();
  delayed = undefined;
  await page.waitForTimeout(50);
  assert.match(await page.locator('[data-image-side="after"]').innerText(), /640 × 64/);
  assert.equal(await page.locator('[data-workspace-review-path="images/sample.png"]').count(), 0);
  await choose("images/sample.png");
  await ready();
  await toggle.click();
  delayNext = true;
  await toggle.click();
  await awaitDelayed();
  await page.getByRole("button", { name: "Second run", exact: true }).click();
  await ready();
  assert.match(await page.locator('[data-image-side="after"]').innerText(), /13 × 7/);
  delayed();
  delayed = undefined;
  await page.waitForTimeout(50);
  assert.match(await page.locator('[data-image-side="after"]').innerText(), /13 × 7/);
  await toggle.click();
  delayNext = true;
  await toggle.click();
  await awaitDelayed();
  await page.getByRole("button", { name: "Other Host", exact: true }).click();
  await ready();
  assert.match(await page.locator('[data-image-side="after"]').innerText(), /17 × 9/);
  delayed();
  delayed = undefined;
  await page.waitForTimeout(50);
  assert.match(await page.locator('[data-image-side="after"]').innerText(), /17 × 9/);
  await page.getByRole("button", { name: "Original run", exact: true }).click();
  await ready();
  const previousRequests = previewRequests.length;
  await page.getByRole("button", { name: "Matching Host", exact: true }).click();
  await ready();
  assert.ok(previewRequests.length > previousRequests);
  assert.equal(previewRequests.at(-1).host, "three");
  await page.getByRole("button", { name: "Original run", exact: true }).click();
  await ready();
  await fs.writeFile(join(one.working, files[0].path), syntheticPng(9, 8));
  await page.getByRole("button", { name: "Apply this file", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: /Reviewed file version changed/ })
    .waitFor();
  assert.deepEqual(await fs.readFile(join(one.source, files[0].path)), files[0].before);
  await fs.writeFile(join(one.working, files[0].path), files[0].after);
  await page.getByRole("button", { name: "Apply this file", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('p[role="alert"]'));
  assert.deepEqual(await fs.readFile(join(one.source, files[0].path)), files[0].after);
  assert.equal(one.calls.length + two.calls.length + three.calls.length, 0);
  assert.deepEqual(errors, []);
  console.log(
    "Workspace image browser smoke passed: precise pair, single-sided images, actual image bounds, EXIF display size, invalid decode/broken complete, animation/dimension-budget/incomplete-raster refusal before image creation, complete transparency/Adam7, repeated close, stale file/run/Host responses, identical-version Host switch and reviewed apply",
  );
} catch (error) {
  if (page)
    console.error(
      JSON.stringify(
        await page.evaluate(() => ({
          text: document.body.innerText.slice(-1600),
          images: [...document.querySelectorAll("img")].map((image) => ({
            complete: image.complete,
            width: image.naturalWidth,
            height: image.naturalHeight,
            phase: image.dataset.imageDisplay,
          })),
          broken: window.__brokenImages,
        })),
      ),
    );
  throw error;
} finally {
  delayed?.();
  await browser.close();
  if (server) await new Promise((done) => server.close(done));
  for (const fn of cleanup.reverse()) await fn();
}
