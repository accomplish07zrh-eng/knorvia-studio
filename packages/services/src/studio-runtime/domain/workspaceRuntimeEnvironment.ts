// SPDX-License-Identifier: Apache-2.0

const runtimeNames = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LANGUAGE",
  "LC_ALL",
  "LC_CTYPE",
  "LC_COLLATE",
  "LC_NUMERIC",
  "LC_MONETARY",
  "LC_TIME",
  "LC_MESSAGES",
  "TZ",
] as const;
const windowsNames = [
  "SystemRoot",
  "WINDIR",
  "ComSpec",
  "PATHEXT",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
] as const;

/** Explicit OS projection: approving a command does not approve handing it Host credentials. */
export function workspaceRuntimeEnvironment(
  source: Readonly<Record<string, string | undefined>>,
  platform: "win32" | "posix",
  port?: number,
): Record<string, string> {
  const env: Record<string, string> = Object.create(null);
  const names: readonly string[] =
    platform === "win32" ? [...runtimeNames, ...windowsNames] : runtimeNames;
  const keys = Object.keys(source).sort();
  for (const name of names) {
    // Windows 环境名不区分大小写；只输出一个规范名，避免 PATH/Path 别名产生不同投影。
    const key = Object.hasOwn(source, name)
      ? name
      : platform === "win32"
        ? keys.find((item) => item.toUpperCase() === name.toUpperCase())
        : undefined;
    const value = key === undefined ? undefined : source[key];
    if (typeof value === "string") env[name] = value;
  }
  env.HOST = "127.0.0.1";
  if (port !== undefined) {
    env.PORT = String(port);
    env.KNORVIA_WORKSPACE_PORT = String(port);
  }
  return env;
}
