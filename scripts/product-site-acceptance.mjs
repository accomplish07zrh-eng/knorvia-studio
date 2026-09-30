import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(new URL("../packages/desktop/package.json", import.meta.url));
const { chromium } = require("playwright-core");
const html = await readFile(new URL("../product-site/index.html", import.meta.url));
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const server = createServer((req, res) => {
  res.writeHead(req.url === "/favicon.ico" ? 204 : 200, {
    "Content-Type": "text/html; charset=utf-8",
  });
  res.end(req.url === "/favicon.ico" ? undefined : html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = process.env.KNORVIA_SITE_URL || `http://127.0.0.1:${server.address().port}/`;
const output = process.env.KNORVIA_SITE_REPORT_DIR || join(tmpdir(), "knorvia-site-acceptance");
await mkdir(output, { recursive: true });
let browser;
const results = [];
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  for (const width of [390, 768, 1440, 1920]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator('#skSw button[data-n="无"]').waitFor();
    const dimensions = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      images: [...document.images]
        .filter((image) => !image.complete || !image.naturalWidth)
        .map((image) => image.alt),
    }));
    assert.ok(
      dimensions.scroll <= dimensions.width + 1,
      `Horizontal overflow at ${width}: ${dimensions.scroll}`,
    );
    assert.deepEqual(dimensions.images, [], "All embedded images decode");
    // 仅设置媒体查询环境不会证明页面遵守偏好；实际观察装饰层和转场，防止新稿回退。
    const motion = await page.evaluate(() => {
      const grain = document.querySelector(".grain");
      const reveal = document.querySelector(".reveal");
      return {
        grainDisplay: grain ? getComputedStyle(grain).display : null,
        revealSeconds: reveal
          ? getComputedStyle(reveal).transitionDuration.split(",").map(Number.parseFloat)
          : null,
        hasTrail: !!document.querySelector("#trail"),
      };
    });
    assert.equal(motion.grainDisplay, "none", "Reduced motion hides the animated grain");
    assert.ok(
      motion.revealSeconds?.every((duration) => duration <= 0.001),
      "Reduced motion removes the long reveal transition",
    );
    assert.equal(motion.hasTrail, false, "Reduced motion does not start the pointer trail");
    const downloads = await page
      .locator('#download a[href*="/releases/"]')
      .evaluateAll((links) => links.map((link) => link.href));
    for (const suffix of ["setup.exe", "setup.exe.sha256"]) {
      assert.ok(
        downloads.some((href) => href.endsWith(`Knorvia-Studio-${version}-win-x64-${suffix}`)),
        suffix,
      );
    }
    assert.ok(
      downloads.every((href) => !href.includes("-portable.zip")),
      "Portable is distributed only on GitHub",
    );
    assert.ok(
      downloads.some((href) => href.endsWith(`/tag/v${version}`)),
      "Release notes match version",
    );
    await page.locator('#skMode [data-m="dark"]').click();
    await page.waitForFunction(() =>
      document.querySelector('#skMode [data-m="dark"]').classList.contains("on"),
    );
    await page.locator("#skGlass").click();
    assert.equal(await page.locator("#skGlass").getAttribute("aria-pressed"), "false");
    await page.locator('#skSw button[data-n="无"]').click();
    assert.equal(await page.locator("#skBgName").textContent(), "无");
    await page.locator('#skMode [data-m="light"]').click();
    await page.locator("#snd").click();
    assert.equal(await page.locator("#snd").getAttribute("aria-pressed"), "true");
    await page.locator("#snd").click();
    await page.locator("#computer").scrollIntoViewIfNeeded();
    assert.equal(await page.locator("#cuSteps li").count(), 6);
    assert.deepEqual(errors, [], "No uncaught page errors");
    await page.screenshot({ path: join(output, `site-${width}.png`), fullPage: false });
    results.push({ width, ...dimensions, motion, downloads: downloads.length, errors });
    await page.close();
  }
  await writeFile(join(output, "result.json"), JSON.stringify({ url, version, results }, null, 2));
  console.log(
    JSON.stringify({
      passed: results.length,
      viewports: results.map((result) => result.width),
      output,
    }),
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
