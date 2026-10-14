#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// 截图基线采集：启动 Web 开发服务器与固定夹具，按 pages.json 逐页 × 明暗 × 宽度出图并记录几何。
// 用法：node scripts/ui-baseline/capture.mjs --out <目录> [--pages id1,id2] [--themes light,dark]
//       [--widths 1360,820,390] [--fixture-root <目录>] [--no-build-server]
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { readRepoCommit, sha256, writeCapture } from "./lib/baseline.mjs";
import { CHROMIUM_LAUNCH_OPTIONS, capturePage, warmUpWebApp } from "./lib/browser.mjs";
import { resolveChromiumExecutable } from "./lib/chrome.mjs";
import { startWebEnvironment } from "./lib/environment.mjs";
import { defaultFixtureRoot, prepareFixture } from "./lib/fixture.mjs";
import { readPagesFile, selectPages } from "./lib/pages.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function parseArguments(argv) {
  const options = {
    out: join(repoRoot, ".tmp", "ui-baseline", "capture"),
    pages: null,
    themes: null,
    widths: null,
    fixtureRoot: defaultFixtureRoot(),
    buildServer: true,
  };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const value = () => {
      const next = argv[++index];
      if (next === undefined) throw new Error(`${argument} 需要一个取值`);
      return next;
    };
    if (argument === "--out") options.out = resolve(value());
    else if (argument === "--pages") options.pages = value();
    else if (argument === "--themes") options.themes = value();
    else if (argument === "--widths") options.widths = value();
    else if (argument === "--fixture-root") options.fixtureRoot = resolve(value());
    else if (argument === "--no-build-server") options.buildServer = false;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`未知参数：${argument}`);
  }
  return options;
}

function parseList(value, allowed, label) {
  if (!value) return allowed;
  const wanted = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const unknown = wanted.filter((entry) => !allowed.includes(entry));
  if (unknown.length > 0) throw new Error(`--${label} 含未知取值：${unknown.join(", ")}`);
  return allowed.filter((entry) => wanted.includes(entry));
}

const USAGE = `用法：node scripts/ui-baseline/capture.mjs [选项]
  --out <目录>            截图输出目录（默认 .tmp/ui-baseline/capture）
  --pages <id,id>         只截指定页面（默认 pages.json 全部）
  --themes <light,dark>   主题子集（默认全部）
  --widths <1360,820,390> 宽度子集（默认全部）
  --fixture-root <目录>   夹具根目录（默认系统临时目录下的 knorvia-ui-baseline）
  --no-build-server       跳过截图前的 @knorvia/server 构建（默认会构建，避免用到旧产物）
  --help                  显示本说明`;

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }
  const pagesPath = join(repoRoot, "scripts", "ui-baseline", "pages.json");
  const pagesFile = await readPagesFile(pagesPath);
  const pagesSha256 = sha256(await readFile(pagesPath));
  const pages = selectPages(pagesFile.pages, options.pages);
  const themes = parseList(options.themes, pagesFile.themes, "themes");
  const widths = parseList(
    options.widths,
    pagesFile.viewports.map((viewport) => String(viewport.width)),
    "widths",
  );
  const viewports = pagesFile.viewports.filter((viewport) =>
    widths.includes(String(viewport.width)),
  );
  const executablePath = resolveChromiumExecutable();
  if (!existsSync(executablePath)) throw new Error(`Chromium 不存在：${executablePath}`);

  const fixture = await prepareFixture({ root: options.fixtureRoot, profile: "default" });
  const environment = await startWebEnvironment({
    repoRoot,
    fixture,
    buildServer: options.buildServer,
    log: (message) => console.log(message),
  });
  const browser = await chromium.launch({ ...CHROMIUM_LAUNCH_OPTIONS, executablePath });
  const records = [];
  const failures = [];
  try {
    await warmUpWebApp({
      browser,
      baseUrl: `${environment.webUrl}/`,
      log: (message) => console.log(message),
    });
    for (const page of pages) {
      for (const theme of themes) {
        for (const viewport of viewports) {
          const label = `${page.id} ${theme} ${viewport.width}x${viewport.height}`;
          const started = Date.now();
          try {
            const captured = await capturePage({
              browser,
              baseUrl: `http://127.0.0.1:${environment.webPort}/`,
              page,
              theme,
              viewport,
              log: (message) => console.log(message),
            });
            if (captured.signals.consoleErrors.length > 0) {
              // 控制台错误不在截图里，但常常解释像素差异；先记录再继续。
              console.warn(
                `[ui-baseline] ${label} 控制台错误 ${captured.signals.consoleErrors.length} 条：${captured.signals.consoleErrors[0]}`,
              );
            }
            records.push({
              page: page.id,
              pageTitle: page.title,
              theme,
              width: viewport.width,
              height: viewport.height,
              image: captured.image,
              geometry: captured.geometry,
              signals: captured.signals,
              screenshotMs: captured.screenshotMs,
              generatedAt: new Date().toISOString(),
            });
            console.log(
              `[ui-baseline] ${label} ${captured.image.length}B ${Date.now() - started}ms`,
            );
          } catch (error) {
            failures.push({
              label,
              message: error instanceof Error ? error.message : String(error),
            });
            console.error(`[ui-baseline] ${label} 失败：${failures.at(-1).message}`);
          }
        }
      }
    }
    const commit = readRepoCommit(repoRoot);
    const environmentReport = {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      chromium: { executablePath, version: browser.version() },
      webUrl: `http://127.0.0.1:${environment.webPort}/`,
      serverUrl: environment.serverUrl,
      fixtureRoot: fixture.root,
      fixtureProfile: fixture.profile,
      fixedClock: (await import("./lib/browser.mjs")).FIXED_CLOCK_ISO,
      fixedTimezone: (await import("./lib/browser.mjs")).FIXED_TIMEZONE,
    };
    const manifest = await writeCapture({
      out: options.out,
      pagesFile: "scripts/ui-baseline/pages.json",
      pagesSha256,
      themes,
      viewports,
      environment: environmentReport,
      commit,
      records,
    });
    console.log(
      JSON.stringify(
        {
          out: options.out,
          images: manifest.images.length,
          failures,
          commit: manifest.commit,
          environment: environmentReport,
        },
        null,
        2,
      ),
    );
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    await environment.stop();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
