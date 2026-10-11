// SPDX-License-Identifier: Apache-2.0
// M0-11：浏览器解析与确定性注入——固定时钟、关闭动画、固定渲染参数、固定主题钩子。
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

// 固定时钟：让渲染出的日期、相对时间文案在每次抓取中一致。
export const FIXED_CLOCK = "2026-01-01T00:00:00.000Z";

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
