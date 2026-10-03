import { homedir } from "node:os";
import { join } from "node:path";

const USER_DATA_ARGUMENT_PATTERN = /--user-data-dir(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s]+))/g;
const PASSWORD_STORE_ARGUMENT_PATTERN =
  /--password-store(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s]+))/i;

export type LinuxChromePasswordStore =
  | "basic"
  | "gnome-libsecret"
  | "kwallet"
  | "kwallet5"
  | "kwallet6";

const LINUX_CHROME_PASSWORD_STORES = new Set<LinuxChromePasswordStore>([
  "basic",
  "gnome-libsecret",
  "kwallet",
  "kwallet5",
  "kwallet6",
]);

export type ChromeBrowserKind =
  | "chrome"
  | "chrome-beta"
  | "chrome-dev"
  | "chrome-canary"
  | "chrome-for-testing"
  | "chromium";

export interface ChromeInstallationCandidate {
  browser: ChromeBrowserKind;
  userDataDir: string;
  executablePaths: string[];
  executablePath?: string;
  passwordStore?: LinuxChromePasswordStore;
}

export interface ChromeInstallationPathOptions {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  localAppData?: string;
  platform?: NodeJS.Platform;
  programFiles?: string;
  programFilesX86?: string;
}

function uniquePaths(paths: Array<string | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    const normalized = path?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

interface ChromeProduct {
  browser: ChromeBrowserKind;
  windowsDirectory: string[];
  macDirectory: string[];
  macApplication: string;
  linuxDirectory: string;
  linuxExecutables: string[];
}

// 系统产品名和路径是兼容数据；一条产品记录同时描述三个平台，避免渠道规则漂移。
const CHROME_PRODUCTS: ChromeProduct[] = [
  {
    browser: "chrome",
    windowsDirectory: ["Google", "Chrome"],
    macDirectory: ["Google", "Chrome"],
    macApplication: "Google Chrome",
    linuxDirectory: "google-chrome",
    linuxExecutables: [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/opt/google/chrome/google-chrome",
      "/opt/google/chrome/chrome",
    ],
  },
  {
    browser: "chrome-beta",
    windowsDirectory: ["Google", "Chrome Beta"],
    macDirectory: ["Google", "Chrome Beta"],
    macApplication: "Google Chrome Beta",
    linuxDirectory: "google-chrome-beta",
    linuxExecutables: [
      "/usr/bin/google-chrome-beta",
      "/opt/google/chrome-beta/google-chrome-beta",
      "/opt/google/chrome-beta/chrome",
    ],
  },
  {
    browser: "chrome-dev",
    windowsDirectory: ["Google", "Chrome Dev"],
    macDirectory: ["Google", "Chrome Dev"],
    macApplication: "Google Chrome Dev",
    linuxDirectory: "google-chrome-unstable",
    linuxExecutables: [
      "/usr/bin/google-chrome-unstable",
      "/opt/google/chrome-unstable/google-chrome-unstable",
      "/opt/google/chrome-unstable/chrome",
    ],
  },
  {
    browser: "chrome-canary",
    windowsDirectory: ["Google", "Chrome SxS"],
    macDirectory: ["Google", "Chrome Canary"],
    macApplication: "Google Chrome Canary",
    linuxDirectory: "google-chrome-canary",
    linuxExecutables: ["/usr/bin/google-chrome-canary"],
  },
  {
    browser: "chrome-for-testing",
    windowsDirectory: ["Google", "Chrome for Testing"],
    macDirectory: ["Google", "Chrome for Testing"],
    macApplication: "Google Chrome for Testing",
    linuxDirectory: "google-chrome-for-testing",
    linuxExecutables: ["/usr/bin/google-chrome-for-testing"],
  },
  {
    browser: "chromium",
    windowsDirectory: ["Chromium"],
    macDirectory: ["Chromium"],
    macApplication: "Chromium",
    linuxDirectory: "chromium",
    linuxExecutables: [
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/lib/chromium/chromium",
      "/usr/lib/chromium-browser/chromium-browser",
    ],
  },
];

export function buildStandardChromeInstallations(
  options: ChromeInstallationPathOptions = {},
): ChromeInstallationCandidate[] {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.homeDir ?? homedir();
  const local = options.localAppData ?? env.LOCALAPPDATA ?? join(home, "AppData", "Local");
  const config = env.CHROME_CONFIG_HOME ?? env.XDG_CONFIG_HOME ?? join(home, ".config");
  const roots =
    platform === "win32"
      ? uniquePaths([
          options.programFiles ?? env.PROGRAMFILES ?? "C:\\Program Files",
          options.programFilesX86 ?? env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)",
          local,
        ])
      : [];
  const result: ChromeInstallationCandidate[] = [];

  for (const product of CHROME_PRODUCTS) {
    let userDataDir: string;
    let executablePaths: string[];
    switch (platform) {
      case "darwin": {
        userDataDir = join(home, "Library", "Application Support", ...product.macDirectory);
        executablePaths = ["/Applications", join(home, "Applications")].map((root) =>
          join(root, `${product.macApplication}.app`, "Contents", "MacOS", product.macApplication),
        );
        break;
      }
      case "win32": {
        userDataDir = join(local, ...product.windowsDirectory, "User Data");
        executablePaths = roots.map((root) =>
          join(root, ...product.windowsDirectory, "Application", "chrome.exe"),
        );
        break;
      }
      default: {
        userDataDir = join(config, product.linuxDirectory);
        executablePaths = [...product.linuxExecutables];
      }
    }
    result.push({ browser: product.browser, userDataDir, executablePaths });
  }
  if (platform === "darwin" || platform === "win32") return result;

  // 标准目录为空时仍要检查 Snap/Flatpak，顺序与现有导入契约一致。
  result.push({
    browser: "chromium",
    userDataDir: join(home, "snap", "chromium", "common", "chromium"),
    executablePaths: ["/snap/bin/chromium", "/var/lib/snapd/snap/bin/chromium"],
  });
  for (const [browser, application, directory] of [
    ["chrome", "com.google.Chrome", "google-chrome"],
    ["chromium", "org.chromium.Chromium", "chromium"],
  ] as const) {
    result.push({
      browser,
      userDataDir: join(home, ".var", "app", application, "config", directory),
      executablePaths: [
        join(home, ".local", "share", "flatpak", "exports", "bin", application),
        `/var/lib/flatpak/exports/bin/${application}`,
      ],
    });
  }
  return result;
}

function parseExecutablePath(commandLine: string): string | undefined {
  const quoted = commandLine.match(/^\s*"([^"]+(?:chrome|chromium)[^"]*)"/i)?.[1];
  if (quoted) return quoted;
  const macApplication = commandLine.match(
    /^\s*(.+?\/(?:Google Chrome(?: Beta| Dev| Canary| for Testing)?|Chromium))(?:\s+--|$)/i,
  )?.[1];
  if (macApplication) return macApplication;
  return commandLine.match(/^\s*(\S*(?:chrome|chromium)(?:\.exe)?)(?:\s|$)/i)?.[1];
}

export function isChromeBrowserExecutable(path: string): boolean {
  const executableName = path.replaceAll("\\", "/").split("/").at(-1) ?? path;
  return /^(?:chrome(?:\.exe)?|chromium|chromium-browser|google-chrome(?:-stable|-beta|-unstable|-canary|-for-testing)?|Google Chrome(?: Beta| Dev| Canary| for Testing)?|com\.google\.Chrome|org\.chromium\.Chromium)$/i.test(
    executableName,
  );
}

export function parseRunningChromeExecutablePaths(commandLines: string[]): string[] {
  const executablePaths: string[] = [];
  const seen = new Set<string>();
  for (const commandLine of commandLines) {
    const executablePath = parseExecutablePath(commandLine);
    if (!executablePath || !isChromeBrowserExecutable(executablePath)) continue;
    const normalized = executablePath.replaceAll("\\", "/").toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    executablePaths.push(executablePath);
  }
  return executablePaths;
}

function parseLinuxChromePasswordStore(commandLine: string): LinuxChromePasswordStore | undefined {
  const match = commandLine.match(PASSWORD_STORE_ARGUMENT_PATTERN);
  const value = (match?.[1] ?? match?.[2] ?? match?.[3])?.toLowerCase();
  return value && LINUX_CHROME_PASSWORD_STORES.has(value as LinuxChromePasswordStore)
    ? (value as LinuxChromePasswordStore)
    : undefined;
}

function executableIdentity(path: string): string {
  return path.replaceAll("\\", "/").toLowerCase();
}

export function parseRunningChromeInstallations(
  commandLines: string[],
  fallbackInstallations: ChromeInstallationCandidate[] = [],
): ChromeInstallationCandidate[] {
  // 同一路径可对应多个候选；只登记第一个，保持标准/环境候选的优先权。
  const byExecutable = new Map<string, ChromeInstallationCandidate>();
  for (const candidate of fallbackInstallations) {
    for (const path of candidate.executablePaths) {
      const identity = executableIdentity(path);
      if (!byExecutable.has(identity)) byExecutable.set(identity, candidate);
    }
  }

  return commandLines.flatMap((line): ChromeInstallationCandidate[] => {
    const path = parseExecutablePath(line);
    if (!path || !isChromeBrowserExecutable(path)) return [];
    const passwordStore = parseLinuxChromePasswordStore(line);
    const directories = Array.from(
      line.matchAll(USER_DATA_ARGUMENT_PATTERN),
      (match) => match[1] ?? match[2] ?? match[3],
    ).filter((directory): directory is string => Boolean(directory));
    if (directories.length) {
      return directories.map((userDataDir) => ({
        browser: /chromium/i.test(line) ? "chromium" : "chrome",
        userDataDir,
        executablePaths: [path],
        executablePath: path,
        ...(passwordStore ? { passwordStore } : {}),
      }));
    }
    if (/(?:^|\s)--type(?:=|\s)/i.test(line)) return [];
    const candidate = byExecutable.get(executableIdentity(path));
    if (!candidate) return [];
    // 主进程未带目录参数时，保留其实际选用的密钥后端供隔离导入 helper 使用。
    return [{ ...candidate, executablePath: path, ...(passwordStore ? { passwordStore } : {}) }];
  });
}
