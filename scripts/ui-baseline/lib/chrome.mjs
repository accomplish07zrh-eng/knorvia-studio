// SPDX-License-Identifier: Apache-2.0
// 定位本机已安装的 Chromium：不下载浏览器，只用 ms-playwright 缓存或显式环境变量。
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PLAYWRIGHT_CACHE_ENV = "PLAYWRIGHT_BROWSERS_PATH";
const CHROME_PATH_ENV = "KNORVIA_UI_BASELINE_CHROME";

/** 每个平台在 ms-playwright 缓存里的相对可执行文件路径。 */
const EXECUTABLE_CANDIDATES = {
  win32: [["chrome-win64", "chrome.exe"]],
  darwin: [
    ["chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"],
    ["chrome-mac-arm64", "Chromium.app", "Contents", "MacOS", "Chromium"],
  ],
  linux: [
    ["chrome-linux", "chrome"],
    ["chrome-linux64", "chrome"],
  ],
};

function cacheRoots() {
  const roots = [];
  const configured = process.env[PLAYWRIGHT_CACHE_ENV]?.trim();
  if (configured) roots.push(configured);
  const home = homedir();
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA?.trim();
    if (localAppData) roots.push(join(localAppData, "ms-playwright"));
    roots.push(join(home, "AppData", "Local", "ms-playwright"));
  } else if (process.platform === "darwin") {
    roots.push(join(home, "Library", "Caches", "ms-playwright"));
  } else {
    roots.push(join(home, ".cache", "ms-playwright"));
  }
  return [...new Set(roots)];
}

function chromiumVersion(name) {
  const match = /^chromium-(\d+)$/u.exec(name);
  return match ? Number(match[1]) : null;
}

/**
 * 返回可用的 Chromium 可执行文件路径。
 * 顺序：显式环境变量 → ms-playwright 缓存里版本号最高的 chromium-<n>。
 * 找不到时抛错并列出已尝试的路径，绝不触发下载。
 */
export function resolveChromiumExecutable() {
  const attempts = [];
  const explicit = process.env[CHROME_PATH_ENV]?.trim();
  if (explicit) {
    if (existsSync(explicit)) return explicit;
    attempts.push(`${CHROME_PATH_ENV}=${explicit}`);
  }
  const relativePaths = EXECUTABLE_CANDIDATES[process.platform] ?? [];
  for (const root of cacheRoots()) {
    if (!existsSync(root)) {
      attempts.push(root);
      continue;
    }
    const versions = readdirSync(root)
      .map((name) => ({ name, version: chromiumVersion(name) }))
      .filter((entry) => entry.version !== null)
      .sort((left, right) => right.version - left.version || left.name.localeCompare(right.name));
    for (const { name } of versions) {
      for (const relative of relativePaths) {
        const candidate = join(root, name, ...relative);
        if (existsSync(candidate)) return candidate;
        attempts.push(candidate);
      }
    }
  }
  throw new Error(
    [
      "找不到本机已安装的 Chromium（本工具不下载浏览器）。",
      `请设置 ${CHROME_PATH_ENV} 指向 chrome 可执行文件，或安装 Playwright 浏览器缓存。`,
      "已尝试：",
      ...attempts.map((value) => `  - ${value}`),
    ].join("\n"),
  );
}

/**
 * 启动参数：固定色彩配置与字体栅格化，减少跨机器与跨次运行的渲染差异。
 * `--disable-gpu` 让光栅化走软件路径：GPU 路径下同一页面两次截图会出现个位数像素、
 * 单通道差 1 的抖动，那正是计划书里说的「字体抗锯齿误报」来源。
 */
export const CHROMIUM_ARGS = [
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--force-color-profile=srgb",
  "--font-render-hinting=none",
  "--disable-lcd-text",
  "--disable-features=CalculateNativeWinOcclusion",
  "--hide-crash-restore-bubble",
];
