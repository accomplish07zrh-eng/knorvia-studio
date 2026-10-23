// 纯规划层：只按显式传入的 platform/env 推导启动候选、环境投影与 PTY 选项。
// 本模块不读 process.*、不碰文件/进程/设置 —— 真正的准入探测与原生调用留在 terminalService.ts，
// 因此这里的每个函数都能用构造出来的 platform/env 直接验证。
import { delimiter, join } from "node:path";
import type { TerminalWindowsPtyInfo } from "./terminal.js";

/** 一条启动候选：`value` 原样回传调用方，`paths` 是按序探测的路径序列。 */
export interface TerminalLaunchCandidate {
  value: string;
  paths: Iterable<string>;
}

/** PTY 的尺寸与启动上下文，是 PTY 选项的公共部分。 */
type TerminalLaunchDimensions = {
  readonly cols: number;
  readonly rows: number;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
};

/** node-pty 的 spawn 选项；Windows 独有字段可选，Unix 下不出现。 */
type TerminalLaunchOptions = TerminalLaunchDimensions & {
  readonly name: "xterm-256color";
  readonly encoding: "utf8";
  readonly useConpty?: true;
  readonly useConptyDll?: boolean;
};

/** Windows 先试两个 PowerShell，再试 ComSpec，最后才是命令提示符。 */
const powershellCommands = ["pwsh.exe", "powershell.exe"] as const;
const commandPrompt = "cmd.exe";
/** 未声明 SHELL 时的 POSIX 兜底顺序。 */
const posixCommands = ["/bin/zsh", "/bin/bash", "/bin/sh"] as const;

/**
 * Homebrew 的两套安装前缀（Apple Silicon / Intel）；可执行目录是各自下面的 bin 与 sbin。
 * 这些前缀属 Homebrew 的公开目录约定。
 */
const homebrewPrefixes = ["/opt/homebrew", "/usr/local"] as const;
/** Unix 的可执行目录名：系统目录与 `/usr` 下各有一套。 */
const unixBinDirs = ["bin", "sbin"] as const;

const shellFailureMessage = {
  windows: "No usable Windows shell found for terminal startup",
  posix: "No usable shell found for terminal startup",
};

/** locale 里声明 UTF-8 的写法：`UTF-8` / `utf8` / `utf-8` 都算。 */
const utf8Locale = /utf-?8/iu;
/** 中性 locale：C 与 POSIX，等价于「没有语言设置」。 */
const neutralLocale = /^(?:c|posix)$/iu;

/** ConPTY 失败的两类线索：模块/文件名缺失，或原生错误码 126。 */
const conptyModuleHint = /(?:\.node|\.dll|module|file\s*name)/iu;
const conptyNativeCode = /error\s*code\s*:?\s*126(?!\d)/iu;

/**
 * macOS 上需要补进 PATH 的目录，按既有顺序：Homebrew 两套前缀下的 bin/sbin，
 * 再是 `/usr/bin`、`/bin`、`/usr/sbin`、`/sbin`。
 *
 * 图形界面启动的应用常常拿不到系统目录，子进程里会连基本命令都找不到，
 * 所以这段补齐只在 darwin 上做。
 */
function darwinSearchPath(): string[] {
  const paths: string[] = [];
  for (const prefix of homebrewPrefixes) {
    for (const dir of unixBinDirs) paths.push(`${prefix}/${dir}`);
  }
  for (const dir of unixBinDirs) {
    paths.push(`/usr/${dir}`, `/${dir}`);
  }
  return paths;
}

/** Windows 专属分支的统一判据，避免各处重复写平台字面量。 */
function isWindows(platform: NodeJS.Platform): boolean {
  return platform === "win32";
}

/**
 * Windows 专属取值的统一出口：非 Windows 一律得到 `undefined`，
 * 调用方再用 `??` 落到通用分支，平台差异只表达一次。
 */
function windowsOnly<T>(platform: NodeJS.Platform, produce: () => T): T | undefined {
  return isWindows(platform) ? produce() : undefined;
}

/** 含分隔符的命令按路径处理，裸命令才走 PATH 枚举。 */
function isDirectCommand(command: string): boolean {
  return command.includes("/") || command.includes("\\");
}

/**
 * 裸命令在 PATH 上的探测路径。
 *
 * 只跳过空段：空白段、重复段都照原样保留，也不展开 PATHEXT 或补扩展名 ——
 * 调用方按这些路径做 X_OK 探测，任何归一化都会改变既有的命中顺序。
 */
function pathSearchHits(command: string, path: string | undefined): Iterable<string> {
  if (path === undefined) return [];
  return path
    .split(delimiter)
    .filter((segment) => segment !== "")
    .map((segment) => join(segment, command));
}

/** 单条 shell 候选的探测路径：直接路径只产出它自己（连首尾空白都不裁）。 */
function commandPathPlan(command: string, path: string | undefined): Iterable<string> {
  return isDirectCommand(command) ? [command] : pathSearchHits(command, path);
}

function windowsShellCommands(env: NodeJS.ProcessEnv): string[] {
  const commands: string[] = [...powershellCommands];
  if (env.ComSpec) commands.push(env.ComSpec);
  commands.push(commandPrompt);
  return commands;
}

function posixShellCommands(env: NodeJS.ProcessEnv): string[] {
  const commands: string[] = [];
  if (env.SHELL) commands.push(env.SHELL);
  commands.push(...posixCommands);
  return commands;
}

/**
 * 按平台给出 shell 候选顺序。
 *
 * 不做去重：`ComSpec` 可能与前面的候选同名（`powershell.exe` 是常见写法），
 * 重复项必须照原样保留，否则调用方的探测次数会与既有行为不一致。
 */
function shellCommandPlan(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  return windowsOnly(platform, () => windowsShellCommands(env)) ?? posixShellCommands(env);
}

/** shell 候选：逐条附带探测路径，供调用方按序做可执行准入。 */
export function* terminalShellPlan(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): Generator<TerminalLaunchCandidate> {
  for (const command of shellCommandPlan(platform, env)) {
    yield { value: command, paths: commandPathPlan(command, env.PATH) };
  }
}

/**
 * 工作目录候选：请求值 → `HOME` → 系统 homedir → `/`。
 *
 * 只跳过 falsy 值：相对路径、带空白的路径都原样保留；也不去重，
 * 请求值与 `HOME` 相同时调用方会按既有次数探测两次。
 */
export function terminalWorkingDirectoryPlan(
  requested: string | undefined,
  environmentHome: string | undefined,
  home: string,
): TerminalLaunchCandidate[] {
  const plan: TerminalLaunchCandidate[] = [];
  for (const candidate of [requested, environmentHome, home, "/"]) {
    if (candidate) plan.push({ value: candidate, paths: [candidate] });
  }
  return plan;
}

export function terminalShellPlanFailure(platform: NodeJS.Platform): string {
  return windowsOnly(platform, () => shellFailureMessage.windows) ?? shellFailureMessage.posix;
}

/** 只有缺失、纯空白或 C/POSIX 这类中性 locale 才需要补默认值。 */
function localeNeedsFallback(value: string | undefined): boolean {
  if (value === undefined) return true;
  const trimmed = value.trim();
  return trimmed === "" || neutralLocale.test(trimmed);
}

/** 首个声明为 UTF-8 的 locale 原样沿用（不 trim）；都没有时按平台给默认值。 */
function localeFallbackOf(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string {
  for (const value of [env.LC_ALL, env.LC_CTYPE, env.LANG]) {
    if (value !== undefined && utf8Locale.test(value)) return value;
  }
  return platform === "darwin" ? "en_US.UTF-8" : "C.UTF-8";
}

/** `LANG` / `LC_CTYPE` 缺失即补；`LC_ALL` 只有本来就存在且为中性值时才补。 */
function applyLocaleFallback(plan: NodeJS.ProcessEnv, fallback: string): void {
  for (const key of ["LANG", "LC_CTYPE"] as const) {
    if (localeNeedsFallback(plan[key])) plan[key] = fallback;
  }
  if (plan.LC_ALL !== undefined && localeNeedsFallback(plan.LC_ALL)) plan.LC_ALL = fallback;
}

/** 去空白、按首次出现去重后的 PATH 段（保持原有顺序）。 */
function trimmedSearchSegments(path: string): string[] {
  const seen = new Set<string>();
  const segments: string[] = [];
  for (const segment of path.split(delimiter)) {
    const trimmed = segment.trim();
    if (trimmed === "" || seen.has(trimmed)) continue;
    seen.add(trimmed);
    segments.push(trimmed);
  }
  return segments;
}

/** 在 macOS 上把 Homebrew 与系统目录补进 PATH；其它平台完全不动（含完全缺失）。 */
function applyDarwinSearchPath(plan: NodeJS.ProcessEnv, path: string | undefined): void {
  const segments = trimmedSearchSegments(path ?? "");
  const present = new Set(segments);
  for (const addition of darwinSearchPath()) {
    if (present.has(addition)) continue;
    present.add(addition);
    segments.push(addition);
  }
  plan.PATH = segments.join(delimiter);
}

/** 终端身份：TERM 固定为 256 色，COLORTERM 缺省为 truecolor。 */
function applyTerminalIdentity(plan: NodeJS.ProcessEnv, source: NodeJS.ProcessEnv): void {
  plan.TERM = "xterm-256color";
  plan.COLORTERM = source.COLORTERM?.trim() || "truecolor";
  // CI 只在「原始 TERM 恰为 dumb」且「CI 恰为 1」时移除；其余组合保留原值。
  if (source.TERM === "dumb" && source.CI === "1") delete plan.CI;
}

/**
 * 终端子进程的环境投影。
 *
 * 始终返回新对象：调用方的 `process.env` 既是输入，也是 profile 解析的输入，
 * 就地修改会污染后续读取。
 */
export function terminalEnvironmentPlan(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const plan: NodeJS.ProcessEnv = { ...env };
  applyTerminalIdentity(plan, env);
  if (platform === "darwin") applyDarwinSearchPath(plan, env.PATH);
  applyLocaleFallback(plan, localeFallbackOf(platform, env));
  return plan;
}

/** Unix 与 Windows 共用的 PTY 选项部分。 */
function basePtyOptions(dimensions: TerminalLaunchDimensions): TerminalLaunchOptions {
  return { ...dimensions, name: "xterm-256color", encoding: "utf8" };
}

/**
 * PTY 选项：Unix 只有一个候选；Windows 追加 `useConpty`，
 * 并在首选里带上 `useConptyDll`，供调用方在 DLL 定位失败时回落到系统 ConPTY。
 */
export function terminalPtyOptionPlan(
  platform: NodeJS.Platform,
  dimensions: TerminalLaunchDimensions,
): readonly [TerminalLaunchOptions, TerminalLaunchOptions?] {
  const base = basePtyOptions(dimensions);
  return (
    windowsOnly(platform, (): [TerminalLaunchOptions, TerminalLaunchOptions] => [
      { ...base, useConpty: true, useConptyDll: true },
      { ...base, useConpty: true, useConptyDll: false },
    ]) ?? [base]
  );
}

/**
 * 仅 ConPTY DLL/模块定位失败允许回落；普通启动失败不得重试。
 *
 * 判据取自 node-pty 的实际报错形态：要么文案点名 conpty 且属于模块/文件缺失，
 * 要么是 Windows「找不到 DLL」的原生错误码 126。
 */
export function terminalConptyDllMiss(message: string): boolean {
  if (conptyNativeCode.test(message)) return true;
  return /conpty/iu.test(message) && conptyModuleHint.test(message);
}

/** `release` 第三段的前缀十进制解析；缺失或非有限值时返回 undefined。 */
function parseWindowsBuild(release: string): number | undefined {
  const build = Number.parseInt(release.split(".")[2] ?? "", 10);
  return Number.isFinite(build) ? build : undefined;
}

export function terminalWindowsPtyPlan(
  platform: NodeJS.Platform,
  release: string,
): TerminalWindowsPtyInfo | undefined {
  return windowsOnly(platform, () => ({
    backend: "conpty" as const,
    buildNumber: parseWindowsBuild(release),
  }));
}
