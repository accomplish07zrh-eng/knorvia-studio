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
 * 启动参数：截图确定性。同一页面两次截图必须逐像素一致；抖动只能在夹具侧消除，
 * 不允许用阈值或容差掩盖。
 *
 * - `--disable-gpu`：GPU 路径下同一页面两次截图会出现个位数像素、单通道差 1 的抖动。
 * - `--force-color-profile=srgb` / `--disable-lcd-text` / `--font-render-hinting=none` /
 *   `--disable-font-subpixel-positioning` / `--force-device-scale-factor=1`：固定色彩配置与字形栅格化。
 * - `--deterministic-mode` / `--run-all-compositor-stages-before-draw` /
 *   `--disable-new-content-rendering-timeout` / `--disable-partial-raster` /
 *   `--disable-accelerated-2d-canvas`：等合成阶段全部完成再截图，避免半成品帧。
 * - `--hide-scrollbars`：滚动条是否占位不影响边缘像素。
 *
 * 实测依据：加固前 `settings-model-provider light 1360`、`settings-subagents light/dark 1360`
 * 有单通道差 ≤3 的抗锯齿残差（changedPixels=2 / 1,224,000，structuralPixels=0）；加齐这些开关后
 * 同一提交两次完整采集 114 张全部零差异。
 */
export const CHROMIUM_ARGS = [
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--deterministic-mode",
  "--run-all-compositor-stages-before-draw",
  "--disable-new-content-rendering-timeout",
  "--disable-partial-raster",
  "--disable-accelerated-2d-canvas",
  "--force-device-scale-factor=1",
  "--force-color-profile=srgb",
  "--font-render-hinting=none",
  "--disable-lcd-text",
  "--disable-font-subpixel-positioning",
  "--hide-scrollbars",
  "--disable-features=CalculateNativeWinOcclusion",
  "--hide-crash-restore-bubble",
];
