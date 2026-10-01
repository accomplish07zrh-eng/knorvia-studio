// Source-exposed planning reconstruction; retained compatibility values/grammar are in the scoped receipt.
import { delimiter, join } from "node:path";
import type { TerminalWindowsPtyInfo } from "./terminal.js";

export interface TerminalLaunchCandidate {
  value: string;
  paths: Iterable<string>;
}
function* executablePaths(command: string, env: NodeJS.ProcessEnv): Generator<string> {
  if (/[\\/]/.test(command)) {
    yield command;
    return;
  }
  for (const directory of env.PATH?.split(delimiter) ?? []) {
    if (directory) yield join(directory, command);
  }
}
export function* terminalShellPlan(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): Generator<TerminalLaunchCandidate> {
  const values =
    platform === "win32"
      ? ["pwsh.exe", "powershell.exe", env.ComSpec, "cmd.exe"]
      : [env.SHELL, "/bin/zsh", "/bin/bash", "/bin/sh"];
  for (const value of values) {
    if (value) yield { value, paths: executablePaths(value, env) };
  }
}
export function terminalWorkingDirectoryPlan(
  requested: string | undefined,
  environmentHome: string | undefined,
  home: string,
): TerminalLaunchCandidate[] {
  return [requested, environmentHome, home, "/"].flatMap((value) =>
    value ? [{ value, paths: [value] }] : [],
  );
}
export function terminalShellPlanFailure(platform: NodeJS.Platform): string {
  return `No usable ${platform === "win32" ? "Windows shell" : "shell"} found for terminal startup`;
}
const darwinSearchPath = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/local/sbin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
] as const;
export function terminalEnvironmentPlan(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const child = { ...env };
  const utf8 = [env.LC_ALL, env.LC_CTYPE, env.LANG].find((value) => /utf-?8/i.test(value ?? ""));
  const fallback = utf8 || (platform === "darwin" ? "en_US.UTF-8" : "C.UTF-8");
  if (platform === "darwin") {
    const segments = [env.PATH, ...darwinSearchPath].flatMap((value) =>
      (value?.split(delimiter) ?? []).flatMap((segment) =>
        segment.trim() ? [segment.trim()] : [],
      ),
    );
    child.PATH = [...new Set(segments)].join(delimiter);
  }
  child.TERM = "xterm-256color";
  child.COLORTERM = env.COLORTERM?.trim() || "truecolor";
  if (env.CI === "1" && env.TERM === "dumb") delete child.CI;
  for (const field of ["LANG", "LC_CTYPE", "LC_ALL"] as const) {
    if (field === "LC_ALL" && child[field] === undefined) continue;
    const locale = (child[field] ?? "").trim().toUpperCase();
    if (["", "C", "POSIX"].includes(locale)) child[field] = fallback;
  }
  return child;
}
interface TerminalLaunchDimensions {
  cols: number;
  rows: number;
  cwd: string;
  env: NodeJS.ProcessEnv;
}
interface TerminalLaunchOptions extends TerminalLaunchDimensions {
  name: "xterm-256color";
  encoding: "utf8";
  useConpty?: true;
  useConptyDll?: boolean;
}
export function terminalPtyOptionPlan(
  platform: NodeJS.Platform,
  dimensions: TerminalLaunchDimensions,
): readonly [TerminalLaunchOptions, TerminalLaunchOptions?] {
  const base: TerminalLaunchOptions = { name: "xterm-256color", ...dimensions, encoding: "utf8" };
  if (platform !== "win32") return [base];
  return [true, false].map((useConptyDll) => ({ useConpty: true, ...base, useConptyDll })) as [
    TerminalLaunchOptions,
    TerminalLaunchOptions,
  ];
}
export function terminalConptyDllMiss(message: string): boolean {
  return /conpty\.node module handle|conpty\.node module file name|cannot find conpty\.dll|error code:\s*126/i.test(
    message,
  );
}
export function terminalWindowsPtyPlan(
  platform: NodeJS.Platform,
  release: string,
): TerminalWindowsPtyInfo | undefined {
  if (platform !== "win32") return undefined;
  const component = release.split(".").at(2);
  const build = component ? Number.parseInt(component, 10) : Number.NaN;
  return { backend: "conpty", buildNumber: Number.isFinite(build) ? build : undefined };
}
