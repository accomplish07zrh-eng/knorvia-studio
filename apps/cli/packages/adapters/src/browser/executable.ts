import { accessSync, constants, existsSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { BrowserType, ChromiumBrowser } from "playwright-core";

export interface BrowserExecutableResolutionOptions {
  env?: NodeJS.ProcessEnv;
  executablePath?: string;
  platform?: NodeJS.Platform | string;
}

export interface PlaywrightChromiumModule {
  chromium: BrowserType<ChromiumBrowser>;
}

const appleLocations = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];
const unixLocations = [
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
];
const windowsSuffixes = [
  ["Google", "Chrome", "Application", "chrome.exe"],
  ["Chromium", "Application", "chrome.exe"],
  ["Microsoft", "Edge", "Application", "msedge.exe"],
];
const unavailableMessage =
  "No installed Chrome or Chromium executable was found. Install Chromium or pass --browser-executable <absolute-path>.";

function canUse(location: string, targetPlatform: NodeJS.Platform | string): boolean {
  try {
    if (!existsSync(location)) return false;
    if (!statSync(location).isFile()) return false;
    if (targetPlatform !== "win32") accessSync(location, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function validateExplicitBrowserExecutable(
  path: string | undefined,
  platform: NodeJS.Platform | string = process.platform,
): string | undefined {
  if (path === undefined) return undefined;
  if (!isAbsolute(path)) {
    throw new Error(`Browser executable path must be absolute: ${path}`);
  }
  if (!canUse(path, platform)) {
    throw new Error(`Browser executable is missing or not executable: ${path}`);
  }
  return path;
}

export function resolveInstalledBrowserExecutable(
  playwright: PlaywrightChromiumModule,
  options: BrowserExecutableResolutionOptions = {},
): string {
  const targetPlatform = options.platform ?? process.platform;
  const chosen = validateExplicitBrowserExecutable(options.executablePath, targetPlatform);
  if (chosen) return chosen;

  const supplied = playwright.chromium.executablePath();
  const searchOrder: string[] = supplied ? [supplied] : [];
  if (targetPlatform === "darwin") {
    searchOrder.push(...appleLocations);
  } else if (targetPlatform === "win32") {
    const environment = options.env ?? process.env;
    const bases = [
      environment.PROGRAMFILES,
      environment["PROGRAMFILES(X86)"],
      environment.LOCALAPPDATA,
    ];
    for (const base of bases) {
      if (!base?.trim()) continue;
      for (const suffix of windowsSuffixes) {
        searchOrder.push(join(base as string, ...suffix));
      }
    }
  } else {
    searchOrder.push(...unixLocations);
  }

  for (const location of searchOrder) {
    if (canUse(location, targetPlatform)) return location;
  }
  throw new Error(unavailableMessage);
}

export async function loadPlaywrightChromium(): Promise<PlaywrightChromiumModule> {
  return (await import("playwright-core")) as PlaywrightChromiumModule;
}
