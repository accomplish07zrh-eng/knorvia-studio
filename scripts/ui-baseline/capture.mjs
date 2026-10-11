// SPDX-License-Identifier: Apache-2.0
// M0-11：在固定夹具、固定时间、关闭动画的环境下抓取 UI 截图与关键元素几何，供替换前后对比。
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { GEOMETRY_TOLERANCE, PIXEL_RATIO_LIMIT } from "./compare.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const DEFAULT_PAGES = join(HERE, "pages.json");
const DEFAULT_THEMES = ["light", "dark"];
const DEFAULT_WIDTHS = [1360, 820, 390];
const DEFAULT_HEIGHT = 900;
// 固定时钟：让渲染出的日期、相对时间文案在每次抓取中一致。
export const FIXED_CLOCK = "2026-01-01T00:00:00.000Z";
export const REQUIRED_TESTIDS_MAX = 200;

const STEP_KINDS = new Set(["click", "fill", "press", "waitFor", "select"]);

export function assertPages(value) {
  if (
    typeof value !== "object" ||
    value === null ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.pages)
  )
    throw new Error("pages.json must be an object with schemaVersion 1 and a pages array");
  const fixtures = value.fixtures ?? {};
  for (const [name, fixture] of Object.entries(fixtures)) {
    if (typeof fixture !== "object" || fixture === null)
      throw new Error(`Invalid fixture: ${name}`);
    assertSteps(fixture.steps ?? [], `fixture ${name}`);
    assertStorage(fixture.storage ?? {}, `fixture ${name}`);
  }
  const seen = new Set();
  const pages = value.pages.map((page) => {
    if (typeof page !== "object" || page === null) throw new Error("Invalid page entry");
    if (typeof page.id !== "string" || !/^[a-z0-9-]+$/.test(page.id))
      throw new Error(`Page id must be kebab-case: ${JSON.stringify(page.id)}`);
    if (seen.has(page.id)) throw new Error(`Duplicate page id: ${page.id}`);
    seen.add(page.id);
    if (typeof page.route !== "string" || !page.route.startsWith("/"))
      throw new Error(`Page ${page.id} needs a route starting with /`);
    if (typeof page.readyTestId !== "string" || !page.readyTestId)
      throw new Error(`Page ${page.id} needs a readyTestId`);
    const testids = page.testids ?? [];
    if (!Array.isArray(testids) || testids.some((id) => typeof id !== "string" || !id))
      throw new Error(`Page ${page.id} has an invalid testids list`);
    if (!testids.includes(page.readyTestId))
      throw new Error(`Page ${page.id} must list its readyTestId in testids`);
    if (testids.length > REQUIRED_TESTIDS_MAX)
      throw new Error(`Page ${page.id} declares too many test ids (${testids.length})`);
    assertSteps(page.steps ?? [], `page ${page.id}`);
    assertStorage(page.storage ?? {}, `page ${page.id}`);
    for (const name of page.fixtures ?? []) {
      if (!(name in fixtures))
        throw new Error(`Page ${page.id} references unknown fixture: ${name}`);
    }
    return {
      id: page.id,
      title: page.title ?? page.id,
      route: page.route,
      readyTestId: page.readyTestId,
      testids: [...testids],
      steps: [
        ...(page.fixtures ?? []).flatMap((name) => fixtures[name].steps ?? []),
        ...(page.steps ?? []),
      ],
      storage: {
        ...(page.fixtures ?? []).reduce(
          (merged, name) => ({ ...merged, ...(fixtures[name].storage ?? {}) }),
          {},
        ),
        ...(page.storage ?? {}),
      },
    };
  });
  if (!pages.length) throw new Error("pages.json must declare at least one page");
  return { schemaVersion: 1, fixtures, pages };
}

function assertSteps(steps, where) {
  if (!Array.isArray(steps)) throw new Error(`Invalid steps for ${where}`);
  for (const step of steps) {
    if (typeof step !== "object" || step === null) throw new Error(`Invalid step for ${where}`);
    const kinds = Object.keys(step).filter((key) => STEP_KINDS.has(key));
    if (kinds.length !== 1) throw new Error(`Step for ${where} must use exactly one action`);
    const kind = kinds[0];
    const value = step[kind];
    if (kind === "fill" || kind === "select") {
      if (
        typeof value !== "object" ||
        value === null ||
        typeof value.testid !== "string" ||
        typeof value.value !== "string"
      )
        throw new Error(`Step ${kind} for ${where} needs { testid, value }`);
    } else if (typeof value !== "string" || !value) {
      throw new Error(`Step ${kind} for ${where} needs a non-empty string`);
    }
  }
}

function assertStorage(storage, where) {
  if (typeof storage !== "object" || storage === null)
    throw new Error(`Invalid storage for ${where}`);
  for (const [key, value] of Object.entries(storage)) {
    if (!key || typeof value !== "string")
      throw new Error(`Storage values for ${where} must be strings`);
  }
}

export function captureRelativePath(entry) {
  return `pages/${entry.id}/${entry.theme}-${entry.width}.png`;
}

export function geometryRelativePath(entry) {
  return `pages/${entry.id}/${entry.theme}-${entry.width}.geometry.json`;
}

export function determinismScript(storage, theme) {
  return `(() => {
  const fixed = Date.parse(${JSON.stringify(FIXED_CLOCK)});
  const RealDate = Date;
  class BaselineDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
    static now() { return fixed; }
  }
  BaselineDate.parse = RealDate.parse;
  BaselineDate.UTC = RealDate.UTC;
  window.Date = BaselineDate;
  for (const [key, value] of Object.entries(${JSON.stringify(storage)})) {
    try { window.localStorage.setItem(key, value); } catch (error) { void error; }
  }
  const style = document.createElement("style");
  style.textContent =
    "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" +
    "html{scroll-behavior:auto!important}";
  const apply = () => {
    if (document.documentElement) {
      document.documentElement.classList.toggle("knorvia-dark", ${theme === "dark"});
      document.documentElement.style.colorScheme = ${JSON.stringify(theme)};
    }
    if (document.head && !document.head.contains(style)) document.head.appendChild(style);
  };
  apply();
  document.addEventListener("DOMContentLoaded", apply);
})();`;
}

// Playwright 只认自己安装那一版的版本号；机器上预装的 Chromium 常常是别的版本，
// 因此按「显式覆盖 → 系统 chromium → Playwright 期望路径 → 缓存里最新一版 → 本机 Chrome」的顺序解析。
function playwrightCacheRoots() {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (process.platform === "win32") return [join(process.env.LOCALAPPDATA ?? "", "ms-playwright")];
  if (process.platform === "darwin") return [join(home, "Library/Caches/ms-playwright")];
  return [join(home, ".cache/ms-playwright")];
}

function cachedChromiumCandidates() {
  const candidates = [];
  for (const root of playwrightCacheRoots()) {
    if (!root || !existsSync(root)) continue;
    const versions = readdirSync(root)
      .filter((name) => /^chromium(_headless_shell)?-\d+$/.test(name))
      .sort((left, right) => Number(right.split("-").at(-1)) - Number(left.split("-").at(-1)));
    for (const version of versions) {
      candidates.push(
        join(root, version, "chrome-win64", "chrome.exe"),
        join(root, version, "chrome-linux", "chrome"),
        join(root, version, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
        join(root, version, "chrome-headless-shell-win64", "chrome-headless-shell.exe"),
        join(root, version, "chrome-headless-shell-linux64", "chrome-headless-shell"),
      );
    }
  }
  return candidates;
}

export function resolveExecutablePath(environment = process.env) {
  const explicit = environment.KNORVIA_UI_BASELINE_CHROMIUM || environment.CHROMIUM_PATH;
  if (explicit) return explicit;
  const candidates = [];
  if (process.platform !== "win32") {
    candidates.push("/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome");
  }
  try {
    candidates.push(chromium.executablePath());
  } catch (error) {
    void error;
  }
  candidates.push(...cachedChromiumCandidates());
  if (process.platform === "win32") {
    candidates.push(
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    );
  }
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return chromium.executablePath();
}

export function launchArguments() {
  return [
    "--force-color-profile=srgb",
    "--font-render-hinting=none",
    "--disable-lcd-text",
    "--hide-scrollbars",
    "--disable-gpu",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--no-sandbox",
  ];
}

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
  const boxes = await page.evaluate((ids) => {
    const result = {};
    const missing = [];
    for (const id of ids) {
      const element = document.querySelector(`[data-testid="${id}"]`);
      if (!element) {
        missing.push(id);
        continue;
      }
      const rect = element.getBoundingClientRect();
      result[id] = {
        x: Math.round(rect.x * 100) / 100,
        y: Math.round(rect.y * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
      };
    }
    return { boxes: result, missing };
  }, testids);
  return boxes;
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
            const absoluteGeometry = resolve(out, ...geometryPath.split("/"));
            await mkdir(dirname(absolutePng), { recursive: true });
            await writeFile(absolutePng, png);
            await writeFile(absoluteGeometry, `${JSON.stringify(geometry.boxes, null, 2)}\n`);
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
  const themes = values.themes
    ? values.themes.split(",").map((value) => value.trim())
    : DEFAULT_THEMES;
  const widths = values.widths
    ? values.widths.split(",").map((value) => Number(value.trim()))
    : DEFAULT_WIDTHS;
  const only = values.only ? values.only.split(",").map((value) => value.trim()) : null;
  const commit = values.commit ?? (await gitCommit());

  let server = null;
  let baseUrl = values["base-url"];
  try {
    if (values.serve) {
      server = spawn(values.serve, { shell: true, stdio: "inherit", cwd: ROOT, windowsHide: true });
      if (!baseUrl) throw new Error("--serve also needs --base-url so readiness can be checked");
      await waitForServer(baseUrl, 120_000);
    }
    const result = await capture({
      out,
      baseUrl,
      pages,
      themes,
      widths,
      height: values.height ? Number(values.height) : DEFAULT_HEIGHT,
      commit,
      only,
    });
    if (values.verify) {
      const verifyOut = `${out}-verify`;
      await rm(verifyOut, { recursive: true, force: true });
      const second = await capture({
        out: verifyOut,
        baseUrl,
        pages,
        themes,
        widths,
        height: values.height ? Number(values.height) : DEFAULT_HEIGHT,
        commit,
        only,
      });
      const { readCaptureTree, compareCaptureTrees } = await import("./compare.mjs");
      const report = await compareCaptureTrees({
        baseline: await readCaptureTree(out),
        current: await readCaptureTree(verifyOut),
        options: {
          maxPixelRatio: 0,
          geometryTolerance: 0,
        },
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
