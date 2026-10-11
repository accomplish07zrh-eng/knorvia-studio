// SPDX-License-Identifier: Apache-2.0
// M0-11：在固定夹具、固定时间、关闭动画的环境下抓取 UI 截图与关键元素几何，供替换前后对比。
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";
import { GEOMETRY_TOLERANCE, PIXEL_RATIO_LIMIT } from "./compare.mjs";
import {
  determinismScript,
  FIXED_CLOCK,
  launchArguments,
  resolveExecutablePath,
} from "./browser.mjs";
import { assertPages, captureRelativePath, geometryRelativePath } from "./pages.mjs";

// 页面清单与浏览器解析拆到 pages.mjs 与 browser.mjs（单文件行数上限 400）；
// 这里继续对外 re-export，保持 capture.mjs 作为该工具的唯一入口。
export {
  assertPages,
  captureRelativePath,
  geometryRelativePath,
  REQUIRED_TESTIDS_MAX,
} from "./pages.mjs";
export {
  determinismScript,
  FIXED_CLOCK,
  launchArguments,
  resolveExecutablePath,
} from "./browser.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const DEFAULT_PAGES = join(HERE, "pages.json");
const DEFAULT_THEMES = ["light", "dark"];
const DEFAULT_WIDTHS = [1360, 820, 390];
const DEFAULT_HEIGHT = 900;

async function runSteps(page, steps) {
  for (const step of steps) {
    if (step.click) await page.getByTestId(step.click).click();
    else if (step.waitFor) await page.getByTestId(step.waitFor).waitFor({ state: "visible" });
    else if (step.press) await page.keyboard.press(step.press);
    else if (step.fill) await page.getByTestId(step.fill.testid).fill(step.fill.value);
    else if (step.select)
      await page.getByTestId(step.select.testid).selectOption(step.select.value);
  }
}

async function readGeometry(page, testids) {
  return page.evaluate((ids) => {
    const boxes = {};
    const missing = [];
    for (const id of ids) {
      const element = document.querySelector(`[data-testid="${id}"]`);
      if (!element) {
        missing.push(id);
        continue;
      }
      const rect = element.getBoundingClientRect();
      boxes[id] = {
        x: Math.round(rect.x * 100) / 100,
        y: Math.round(rect.y * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
      };
    }
    return { boxes, missing };
  }, testids);
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return true;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Web server did not answer at ${url}: ${lastError?.message ?? "timeout"}`);
}

export async function capture({
  out,
  baseUrl,
  pages,
  themes = DEFAULT_THEMES,
  widths = DEFAULT_WIDTHS,
  height = DEFAULT_HEIGHT,
  commit,
  only = null,
  executablePath = resolveExecutablePath(),
}) {
  const selected = only ? pages.pages.filter((page) => only.includes(page.id)) : pages.pages;
  if (!selected.length) throw new Error("No pages selected for capture");
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: launchArguments(),
  });
  const entries = [];
  const failures = [];
  try {
    for (const page of selected) {
      for (const theme of themes) {
        for (const width of widths) {
          const context = await browser.newContext({
            viewport: { width, height },
            deviceScaleFactor: 1,
            colorScheme: theme,
            reducedMotion: "reduce",
            locale: "zh-CN",
            timezoneId: "UTC",
            bypassCSP: true,
          });
          await context.addInitScript(determinismScript(page.storage, theme));
          const tab = await context.newPage();
          try {
            await tab.goto(`${baseUrl}${page.route}`, { waitUntil: "domcontentloaded" });
            await tab.getByTestId(page.readyTestId).waitFor({ state: "visible", timeout: 30_000 });
            await runSteps(tab, page.steps);
            await tab.evaluate(() => document.fonts.ready);
            const geometry = await readGeometry(tab, page.testids);
            if (geometry.missing.length) {
              failures.push({ page: page.id, theme, width, missing: geometry.missing });
            }
            const png = await tab.screenshot({
              animations: "disabled",
              caret: "hide",
              scale: "css",
            });
            const entry = { id: page.id, theme, width };
            const pngPath = captureRelativePath(entry);
            const geometryPath = geometryRelativePath(entry);
            const absolutePng = resolve(out, ...pngPath.split("/"));
            await mkdir(dirname(absolutePng), { recursive: true });
            await writeFile(absolutePng, png);
            await writeFile(
              resolve(out, ...geometryPath.split("/")),
              `${JSON.stringify(geometry.boxes, null, 2)}\n`,
            );
            entries.push({
              ...entry,
              png: pngPath,
              geometry: geometryPath,
              sha256: createHash("sha256").update(png).digest("hex"),
            });
          } finally {
            await context.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
  const manifest = {
    schemaVersion: 1,
    commit,
    capturedAt: FIXED_CLOCK,
    node: process.version,
    platform: process.platform,
    chromium: executablePath,
    viewport: { height },
    themes,
    widths,
    pages: entries,
  };
  await writeFile(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, failures };
}

async function gitCommit() {
  const child = spawn("git", ["-C", ROOT, "rev-parse", "HEAD"], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const chunks = [];
  for await (const chunk of child.stdout) chunks.push(chunk);
  const code = await new Promise((accept) => child.on("close", accept));
  if (code !== 0) throw new Error("Unable to resolve the current commit");
  return Buffer.concat(chunks).toString().trim();
}

const HELP = [
  "UI baseline capture: node scripts/ui-baseline/capture.mjs --out <dir> (--base-url <url> | --serve <command>) [options]",
  "  --out <dir>          directory for png/geometry/manifest output",
  "  --base-url <url>     base URL of the running Web dev server",
  "  --serve <command>    start the Web dev server with this command and stop it afterwards",
  "  --pages <file>       page list (default: scripts/ui-baseline/pages.json)",
  "  --themes <list>      comma separated themes (default: light,dark)",
  "  --widths <list>      comma separated widths (default: 1360,820,390)",
  "  --height <px>        viewport height (default: 900)",
  "  --only <ids>         comma separated page ids",
  "  --commit <sha>       commit recorded in the manifest (default: git HEAD)",
  "  --verify             capture twice and require a zero difference",
  "Exit code 0 only when every declared data-testid was found.",
].join("\n");

export async function runCli(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      out: { type: "string" },
      "base-url": { type: "string" },
      serve: { type: "string" },
      pages: { type: "string" },
      themes: { type: "string" },
      widths: { type: "string" },
      height: { type: "string" },
      only: { type: "string" },
      commit: { type: "string" },
      verify: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help || !values.out || (!values["base-url"] && !values.serve)) {
    console.log(HELP);
    return values.help ? 0 : 2;
  }
  const pages = assertPages(
    JSON.parse(await readFile(resolve(values.pages ?? DEFAULT_PAGES), "utf8")),
  );
  const out = resolve(values.out);
  const height = values.height ? Number(values.height) : DEFAULT_HEIGHT;
  const themes = values.themes
    ? values.themes.split(",").map((value) => value.trim())
    : DEFAULT_THEMES;
  const widths = values.widths
    ? values.widths.split(",").map((value) => Number(value.trim()))
    : DEFAULT_WIDTHS;
  const only = values.only ? values.only.split(",").map((value) => value.trim()) : null;
  const commit = values.commit ?? (await gitCommit());

  let server = null;
  const baseUrl = values["base-url"];
  try {
    if (values.serve) {
      server = spawn(values.serve, { shell: true, stdio: "inherit", cwd: ROOT, windowsHide: true });
      if (!baseUrl) throw new Error("--serve also needs --base-url so readiness can be checked");
      await waitForServer(baseUrl, 120_000);
    }
    const result = await capture({ out, baseUrl, pages, themes, widths, height, commit, only });
    if (values.verify) {
      const verifyOut = `${out}-verify`;
      await rm(verifyOut, { recursive: true, force: true });
      const second = await capture({
        out: verifyOut,
        baseUrl,
        pages,
        themes,
        widths,
        height,
        commit,
        only,
      });
      const { readCaptureTree, compareCaptureTrees } = await import("./compare.mjs");
      const report = await compareCaptureTrees({
        baseline: await readCaptureTree(out),
        current: await readCaptureTree(verifyOut),
        options: { maxPixelRatio: 0, geometryTolerance: 0 },
      });
      await rm(verifyOut, { recursive: true, force: true });
      console.log(
        JSON.stringify({ verify: report.summary, captures: second.manifest.pages.length }, null, 2),
      );
      if (report.summary.failed > 0) {
        console.error("capture is not deterministic; fix the fixture instead of adding tolerance");
        return 1;
      }
    }
    console.log(
      JSON.stringify(
        {
          out,
          commit,
          pages: result.manifest.pages.length,
          missing: result.failures.length,
          limits: { pixelRatio: PIXEL_RATIO_LIMIT, geometryTolerance: GEOMETRY_TOLERANCE },
        },
        null,
        2,
      ),
    );
    if (result.failures.length) {
      console.error(JSON.stringify({ missingTestIds: result.failures }, null, 2));
      return 1;
    }
    return 0;
  } finally {
    if (server) server.kill();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  runCli()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`ui baseline capture failed: ${error.message}`);
      process.exitCode = 1;
    });
}
