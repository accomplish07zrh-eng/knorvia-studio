import { execFile } from "node:child_process";
import { constants, type Dirent } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import {
  buildStandardChromeInstallations,
  isChromeBrowserExecutable,
  parseRunningChromeExecutablePaths,
  type ChromeInstallationCandidate,
  type ChromeInstallationPathOptions,
} from "./chromeInstallationCandidates.js";

const DISCOVERY_COMMAND_TIMEOUT_MS = 3_000;
const SUPPORTED_PLATFORMS = new Set<NodeJS.Platform>(["darwin", "linux", "win32"]);

interface ChromeExecutableDiscoveryOptions extends ChromeInstallationPathOptions {
  installations?: ChromeInstallationCandidate[];
  processCommandLines?: string[];
  /** 测试可注入已由操作系统注册表/索引解析出的可执行文件，避免依赖宿主环境。 */
  registeredExecutablePaths?: string[];
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

export async function readRunningChromeProcessCommandLines(
  platform: NodeJS.Platform,
): Promise<string[]> {
  if (!SUPPORTED_PLATFORMS.has(platform)) return [];
  try {
    if (platform === "win32") {
      const script =
        "Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(chrome|chromium)\\.exe$' } | ForEach-Object { $_.CommandLine }";
      return (
        await execFileText("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script])
      )
        .split(/\r?\n/)
        .filter(Boolean);
    }
    return (await execFileText("ps", ["-axo", "command="]))
      .split(/\r?\n/)
      .filter((line) => /(?:chrome|chromium)/i.test(line));
  } catch {
    // 进程枚举受系统策略限制时，仍应继续使用注册信息和标准目录，不能阻断导入。
    return [];
  }
}

async function isExecutableFile(path: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    const details = await stat(path);
    if (!details.isFile()) return false;
    if (platform !== "win32") await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveFirstExecutable(
  paths: Array<string | undefined>,
  platform: NodeJS.Platform,
): Promise<string | null> {
  for (const executablePath of uniquePaths(paths)) {
    if (!isChromeBrowserExecutable(executablePath)) continue;
    if (await isExecutableFile(executablePath, platform)) return executablePath;
  }
  return null;
}

function stripMatchingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function desktopExecutableToken(value: string): string | undefined {
  const tokens = [...value.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  );
  if (tokens[0] !== "env") return tokens[0];
  return tokens.slice(1).find((token) => !token.startsWith("-") && !token.includes("="));
}

function resolvePathCommand(command: string, env: NodeJS.ProcessEnv): string[] {
  if (isAbsolute(command)) return [command];
  if (command.includes("/") || command.includes("\\")) return [];
  return (env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, command));
}

async function* filesInDirectories(
  directories: string[],
  admit: (entry: Dirent) => boolean,
): AsyncGenerator<string> {
  for (const directory of directories) {
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      // 系统索引可能包含失效或无权限目录；只丢弃本目录，不丢弃后面的注册来源。
      continue;
    }
    for (const entry of entries) {
      if (admit(entry)) yield join(directory, entry.name);
    }
  }
}

async function readMacRegisteredChromeExecutablePaths(): Promise<string[]> {
  const query = [
    "com.google.Chrome",
    "com.google.Chrome.beta",
    "com.google.Chrome.dev",
    "com.google.Chrome.canary",
    "com.google.Chrome.forTesting",
    "org.chromium.Chromium",
  ]
    .map((identifier) => `kMDItemCFBundleIdentifier == '${identifier}'`)
    .join(" || ");
  try {
    const applications = (await execFileText("mdfind", [query])).split(/\r?\n/).filter(Boolean);
    const directories = applications.map((application) => join(application, "Contents", "MacOS"));
    const paths: string[] = [];
    for await (const path of filesInDirectories(
      directories,
      (entry) => entry.isFile() || entry.isSymbolicLink(),
    )) {
      if (isChromeBrowserExecutable(path)) paths.push(path);
    }
    return uniquePaths(paths);
  } catch {
    // Spotlight 不可用时，搜索计划仍会进入标准目录，不把索引可用性当作浏览器存在性。
    return [];
  }
}

function* desktopEntryCommands(source: string): Generator<string> {
  if (!/(?:chrome|chromium)/i.test(source)) return;
  for (const line of source.split(/\r?\n/)) {
    const match = /^(?:TryExec|Exec)=(.+)$/.exec(line);
    if (!match) continue;
    const command = desktopExecutableToken(match[1]!);
    if (command) yield command;
  }
}

async function readLinuxDesktopChromeExecutablePaths(
  options: ChromeExecutableDiscoveryOptions,
): Promise<string[]> {
  const env = options.env ?? process.env;
  const directories = uniquePaths([
    env.XDG_DATA_HOME ?? join(options.homeDir ?? homedir(), ".local", "share"),
    ...(env.XDG_DATA_DIRS ?? "/usr/local/share:/usr/share").split(":"),
  ]).map((root) => join(root, "applications"));
  const paths: string[] = [];
  for await (const path of filesInDirectories(
    directories,
    (entry) => entry.isFile() && entry.name.endsWith(".desktop"),
  )) {
    let source: string;
    try {
      source = await readFile(path, "utf8");
    } catch {
      // 单个注册文件失效不能遮蔽其余 desktop entries。
      continue;
    }
    for (const command of desktopEntryCommands(source))
      paths.push(...resolvePathCommand(command, env));
  }
  return uniquePaths(paths);
}

function buildLinuxPathChromeExecutablePaths(env: NodeJS.ProcessEnv): string[] {
  const names = [
    "google-chrome",
    "google-chrome-stable",
    "google-chrome-beta",
    "google-chrome-unstable",
    "google-chrome-canary",
    "google-chrome-for-testing",
    "chromium",
    "chromium-browser",
    "com.google.Chrome",
    "org.chromium.Chromium",
  ];
  return uniquePaths(names.flatMap((name) => resolvePathCommand(name, env)));
}

async function readRegisteredChromeExecutablePaths(
  options: ChromeExecutableDiscoveryOptions,
  platform: NodeJS.Platform,
): Promise<string[]> {
  if (options.registeredExecutablePaths) return options.registeredExecutablePaths;
  if (platform === "darwin") return readMacRegisteredChromeExecutablePaths();
  if (platform === "linux") return readLinuxDesktopChromeExecutablePaths(options);
  return [];
}

async function* executableSearchPlan(
  options: ChromeExecutableDiscoveryOptions,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  commandLines: string[],
): AsyncGenerator<Array<string | undefined>> {
  yield [
    stripMatchingQuotes(env.CHROME_PATH ?? ""),
    stripMatchingQuotes(env.CHROME_EXECUTABLE ?? ""),
    ...parseRunningChromeExecutablePaths(commandLines),
  ];
  yield await readRegisteredChromeExecutablePaths(options, platform);
  const installations = options.installations ?? buildStandardChromeInstallations(options);
  yield [
    ...(platform === "linux" ? buildLinuxPathChromeExecutablePaths(env) : []),
    ...installations.flatMap(({ executablePath, executablePaths }) => [
      executablePath,
      ...executablePaths,
    ]),
  ];
}

export async function resolveChromeExecutablePath(
  options: ChromeExecutableDiscoveryOptions = {},
): Promise<string | null> {
  const platform = options.platform ?? process.platform;
  const commandLines =
    options.processCommandLines ??
    (options.installations ? [] : await readRunningChromeProcessCommandLines(platform));
  // 只有前一层全部不可用才读取下一层；成功后不触碰注册表、索引或标准路径。
  for await (const paths of executableSearchPlan(
    options,
    platform,
    options.env ?? process.env,
    commandLines,
  )) {
    const selected = await resolveFirstExecutable(paths, platform);
    if (selected !== null) return selected;
  }
  return null;
}
