import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  buildStandardChromeInstallations,
  parseRunningChromeInstallations,
  type ChromeBrowserKind,
  type ChromeInstallationCandidate,
  type ChromeInstallationPathOptions,
  type LinuxChromePasswordStore,
} from "./chromeInstallationCandidates.js";
import { readRunningChromeProcessCommandLines } from "./chromeExecutableDiscovery.js";

export {
  buildStandardChromeInstallations,
  parseRunningChromeInstallations,
  type ChromeInstallationCandidate,
  type LinuxChromePasswordStore,
} from "./chromeInstallationCandidates.js";
export { resolveChromeExecutablePath } from "./chromeExecutableDiscovery.js";

const DISCOVERY_COMMAND_TIMEOUT_MS = 3_000;
const PROFILE_DIRECTORY_PATTERN = /^(?:Default|Profile \d+)$/;

export interface ChromeProfileSource {
  browser: ChromeBrowserKind;
  executablePath?: string;
  passwordStore?: LinuxChromePasswordStore;
  profileDirectory: string;
  profilePath: string;
  userDataDir: string;
}

export type ChromeProfileDiscoveryResult =
  | { success: true; source: ChromeProfileSource }
  | { success: false; error: "chrome_profile_not_found" | "chrome_profile_ambiguous" };

interface ChromeLocalState {
  profile?: {
    info_cache?: Record<string, unknown>;
    last_used?: string;
  };
}

interface ChromeProfileDiscoveryOptions extends ChromeInstallationPathOptions {
  installations?: ChromeInstallationCandidate[];
  processCommandLines?: string[];
}

function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

function execFileText(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        encoding: "utf8",
        maxBuffer: 2 * 1024 * 1024,
        timeout: DISCOVERY_COMMAND_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function expandWindowsPolicyPath(value: string, options: ChromeProfileDiscoveryOptions): string {
  const env = options.env ?? process.env;
  const home = options.homeDir ?? homedir();
  const variables = new Map([
    ["local_app_data", options.localAppData ?? env.LOCALAPPDATA ?? join(home, "AppData", "Local")],
    ["profile", env.USERPROFILE ?? home],
    ["program_files", options.programFiles ?? env.PROGRAMFILES ?? "C:\\Program Files"],
  ]);
  const substituted = value.replace(
    /\$\{([^}]+)\}/g,
    (original, name: string) => variables.get(name.toLowerCase()) ?? original,
  );
  // 先替换 Chrome 策略变量，再展开其中可能携带的环境变量；未知变量保持原文本。
  return substituted.replace(
    /%([^%]+)%/g,
    (original, name: string) => env[name] ?? env[name.toUpperCase()] ?? original,
  );
}

async function readWindowsPolicyUserDataDirs(
  options: ChromeProfileDiscoveryOptions,
): Promise<string[]> {
  const paths = new Set<string>();
  for (const hive of ["HKCU", "HKLM"]) {
    let output: string;
    try {
      output = await execFileText("reg.exe", [
        "query",
        `${hive}\\Software\\Policies\\Google\\Chrome`,
        "/v",
        "UserDataDir",
      ]);
    } catch {
      // 企业策略缺失或查询受限，不阻断下一 hive 与标准目录。
      continue;
    }
    const captured = /UserDataDir\s+REG_(?:EXPAND_)?SZ\s+(.+)$/im.exec(output)?.[1]?.trim();
    if (!captured) continue;
    const path = expandWindowsPolicyPath(captured, options).trim();
    if (path) paths.add(path);
  }
  return [...paths];
}

async function resolveFirstExistingPath(paths: string[]): Promise<string | undefined> {
  for (const path of paths) {
    if (await pathExists(path)) return path;
  }
  return undefined;
}

interface ProfileOffer {
  directory: string;
  preference: number;
}

async function importableProfileOffers(userDataDir: string): Promise<ProfileOffer[]> {
  let localState: ChromeLocalState = {};
  try {
    localState = JSON.parse(
      await readFile(join(userDataDir, "Local State"), "utf8"),
    ) as ChromeLocalState;
  } catch {
    // 文件不可读或 JSON 损坏时，仅使用实际目录证据；不向源 Profile 写入恢复数据。
  }
  const metadata = localState.profile;
  const names = new Set(Object.keys(metadata?.info_cache ?? {}));
  try {
    const entries = await readdir(userDataDir, { withFileTypes: true });
    entries.forEach((entry) => {
      if (entry.isDirectory() && PROFILE_DIRECTORY_PATTERN.test(entry.name)) names.add(entry.name);
    });
  } catch {
    return [];
  }
  const present: string[] = [];
  for (const name of names) {
    if (await pathExists(join(userDataDir, name))) present.push(name);
  }
  present.sort((left, right) => left.localeCompare(right));
  const offers = await Promise.all(
    present.map(async (directory): Promise<ProfileOffer | undefined> => {
      for (const components of [
        ["Network", "Cookies"],
        ["Cookies"],
        ["Local Storage", "leveldb"],
      ]) {
        if (!(await pathExists(join(userDataDir, directory, ...components)))) continue;
        return {
          directory,
          preference:
            metadata?.last_used && metadata.last_used === directory
              ? 0
              : directory === "Default"
                ? 1
                : 2,
        };
      }
      return undefined;
    }),
  );
  // 空 Default 没有 offer，不能遮蔽真实 Profile 或后续 Snap/Flatpak；优先级只作用于可导入数据。
  return offers
    .filter((offer): offer is ProfileOffer => offer !== undefined)
    .sort((left, right) => left.preference - right.preference);
}

async function* orderedInstallations(
  options: ChromeProfileDiscoveryOptions,
): AsyncGenerator<ChromeInstallationCandidate> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const standard = options.installations ?? buildStandardChromeInstallations(options);
  const fromDirectory = (userDataDir: string): ChromeInstallationCandidate => ({
    browser: "chrome",
    userDataDir,
    executablePaths: standard[0]?.executablePaths ?? [],
  });
  const environment =
    !options.installations && platform === "linux" && env.CHROME_USER_DATA_DIR
      ? [fromDirectory(env.CHROME_USER_DATA_DIR)]
      : [];
  const lines =
    options.processCommandLines ??
    (options.installations ? [] : await readRunningChromeProcessCommandLines(platform));
  const running = parseRunningChromeInstallations(
    lines,
    platform === "linux" ? [...environment, ...standard] : [],
  );
  const policy =
    platform === "win32" && !options.installations
      ? (await readWindowsPolicyUserDataDirs(options)).map(fromDirectory)
      : [];
  const visited = new Set<string>();
  for (const group of [running, environment, policy, standard]) {
    for (const candidate of group) {
      const userDataDir = candidate.userDataDir.trim();
      if (!userDataDir || visited.has(userDataDir)) continue;
      visited.add(userDataDir);
      yield { ...candidate, userDataDir };
    }
  }
}

export async function discoverChromeProfile(
  options: ChromeProfileDiscoveryOptions = {},
): Promise<ChromeProfileDiscoveryResult> {
  for await (const candidate of orderedInstallations(options)) {
    if (!(await pathExists(candidate.userDataDir))) continue;
    const offers = await importableProfileOffers(candidate.userDataDir);
    const selected = offers[0];
    if (!selected) continue;
    if (selected.preference === 2 && offers.length > 1) {
      return { success: false, error: "chrome_profile_ambiguous" };
    }
    if (!selected.directory) continue;
    const executablePath =
      candidate.executablePath ?? (await resolveFirstExistingPath(candidate.executablePaths));
    return {
      success: true,
      source: {
        browser: candidate.browser,
        executablePath,
        passwordStore: candidate.passwordStore,
        profileDirectory: selected.directory,
        profilePath: join(candidate.userDataDir, selected.directory),
        userDataDir: candidate.userDataDir,
      },
    };
  }
  return { success: false, error: "chrome_profile_not_found" };
}
