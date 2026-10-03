import { buildDesktopProfileEnvironment } from "./desktopProfile.js";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, win32 } from "node:path";
import type { ConnectOptions } from "@knorvia/server/remote";
import {
  listSSHConfigAliasesFromLocalConfig,
  getAppConfigDir,
  getDataBaseDir,
  KNORVIA_CUA_BUNDLED_HELPER_APP_PATH_ENV,
  KNORVIA_WINDOWS_APP_INSTALL_DIR_ENV,
} from "@knorvia/services/node";
import { DEV_HELPER_APP_NAME, HELPER_APP_NAME } from "@knorvia/cua/broker/helperConstants";
import {
  KNORVIA_APP_VERSION_ENV,
  KNORVIA_AGENT_RUNTIME,
  KNORVIA_DYNAMIC_WORKFLOW_MODE_ENV,
  KNORVIA_ENV,
  KNORVIA_PRODUCT_FLAVOR,
  KNORVIA_RUNTIME_ENV_KEY,
  KNORVIA_VERSION,
  buildKnorviaToolEnvPassthroughEnv,
  normalizeDynamicWorkflowMode,
  sanitizeKnorviaRuntimeEnv,
  type KnorviaRuntimeEnv,
} from "@knorvia/shared";
import { resolvePlatformKeyForPackagedApp } from "../../scripts/target-platform.mjs";
import {
  resolveRemoteCdnBaseUrls as resolveOrderedRemoteCdnBaseUrls,
  type ResolveRemoteCdnOptions,
} from "./remoteCdn.js";
import { getElectronAppPath, isElectronAppPackaged } from "./desktopElectronApp.js";

export const desktopRuntimeEnv: KnorviaRuntimeEnv = isElectronAppPackaged()
  ? "production"
  : "development";
const preview = desktopRuntimeEnv === "production" && KNORVIA_PRODUCT_FLAVOR === "preview";
export const runtimeApplicationName = "Knorvia Studio";
export const runtimeHomePath = process.env.KNORVIA_DESKTOP_HOME_DIR?.trim();
export const shouldUseElectronDefaultUserDataPath = false;
export const runtimeUserDataPath = join(getDataBaseDir(), "profile");
export const runtimeSessionDataPath = join(runtimeUserDataPath, "session");
export const hostModulePath = join(import.meta.dirname, "../host/index.js");
export const schedulerModulePath = join(import.meta.dirname, "../scheduler/index.js");
export function getCredentialsDir() {
  return getAppConfigDir();
}
export type RemoteAssetDirs = Pick<
  ConnectOptions,
  "mockCdnDir" | "remoteCdnBaseUrl" | "remoteCdnBaseUrls" | "remoteCacheDir"
>;
type LocalRuntimeEnv = Record<string, string | undefined>;
const excluded =
  /^KNORVIA_|^ZAI_OAUTH_|^BIGMODEL_OAUTH_|^ZAI_BUSINESS_|^OTEL_|^KNORVIA_(TELEMETRY|ARMS|BASE_URL|ENDPOINT_ORIGIN)/i;

export async function isDockerDaemonAvailable(): Promise<boolean> {
  const { isDockerAvailable } = await import("@knorvia/server/remote");
  return isDockerAvailable();
}
export async function listAvailableWSLDistros() {
  const { listWSLDistros } = await import("@knorvia/server/remote");
  return listWSLDistros();
}
export async function listAvailableDockerContainers() {
  const { listDockerContainers } = await import("@knorvia/server/remote");
  return listDockerContainers();
}
export async function listSSHConfigAliases() {
  return await listSSHConfigAliasesFromLocalConfig();
}

function parseLocalEnv(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    let line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice("export ".length).trim();
    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    const key = line.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    result[key] = value;
  }
  return result;
}
function stripSelectedLinks<T extends Record<string, string | undefined>>(env: T): T {
  for (const key of Object.keys(env)) if (excluded.test(key)) delete env[key];
  return env;
}
export function loadHostProcessEnvFromLocalFiles(): Record<string, string> {
  if (isElectronAppPackaged()) return { KNORVIA_TELEMETRY_RUNTIME_DISTRIBUTION: "packaged" };
  const desktop = resolve(import.meta.dirname, "../..");
  const workspace = resolve(import.meta.dirname, "../../../..");
  const roots = existsSync(join(workspace, "pnpm-workspace.yaml"))
    ? [workspace, desktop]
    : [desktop];
  const names = [
    ".env",
    ".env.local",
    ...(desktopRuntimeEnv === "development" ? [".env.development", ".env.development.local"] : []),
  ];
  const paths = new Set(roots.flatMap((root) => names.map((name) => resolve(root, name))));
  const result: Record<string, string> = {};
  for (const path of paths)
    if (existsSync(path)) Object.assign(result, parseLocalEnv(readFileSync(path, "utf-8")));
  return stripSelectedLinks(result);
}
function lookup(key: string, localEnv: LocalRuntimeEnv): string | undefined {
  return process.env[key]?.trim() || localEnv[key]?.trim() || undefined;
}
export function resolveRemoteAssetDirs(
  options: ResolveRemoteCdnOptions = {},
  localEnv: LocalRuntimeEnv = {},
): RemoteAssetDirs {
  const overrideBaseUrl = lookup("KNORVIA_REMOTE_ASSET_CDN_BASE_URL", localEnv);
  const remoteCdnBaseUrls = resolveOrderedRemoteCdnBaseUrls({
    ...options,
    env: KNORVIA_ENV,
    overrideBaseUrl,
    version: KNORVIA_VERSION,
  });
  const useCdn =
    isElectronAppPackaged() ||
    ["1", "true", "yes", "on"].includes(
      lookup("KNORVIA_DEV_REMOTE_ASSET_USE_CDN", localEnv)?.toLowerCase() ?? "",
    );
  let mockCdnDir: string | undefined;
  if (!useCdn) {
    const mock = join(import.meta.dirname, "../../mock-cdn");
    if (existsSync(join(mock, "releases", KNORVIA_VERSION))) mockCdnDir = mock;
  }
  const override = lookup("KNORVIA_REMOTE_ASSET_CACHE_DIR", localEnv);
  const remoteCacheDir = override
    ? resolve(override)
    : join(getElectronAppPath("userData"), "remote-assets-cache");
  return {
    ...(mockCdnDir ? { mockCdnDir } : {}),
    remoteCdnBaseUrl: remoteCdnBaseUrls[0],
    remoteCdnBaseUrls,
    remoteCacheDir,
  };
}
export function resolveBundledAgentBinaryPath(): string | undefined {
  const entry = KNORVIA_AGENT_RUNTIME.resolveEntrySegments(process.platform);
  const platform = resolvePlatformKeyForPackagedApp();
  const candidates = [
    isElectronAppPackaged()
      ? join(process.resourcesPath, KNORVIA_AGENT_RUNTIME.bundledResourceDir, ...entry)
      : undefined,
    join(
      process.cwd(),
      "bundled-agents",
      platform,
      KNORVIA_AGENT_RUNTIME.bundledResourceDir,
      ...entry,
    ),
    join(
      process.cwd(),
      "packages",
      "desktop",
      "bundled-agents",
      platform,
      KNORVIA_AGENT_RUNTIME.bundledResourceDir,
      ...entry,
    ),
    join(
      import.meta.dirname,
      "../../bundled-agents",
      platform,
      KNORVIA_AGENT_RUNTIME.bundledResourceDir,
      ...entry,
    ),
  ];
  return candidates.find((path) => path && existsSync(path));
}
function larkBinary(): string | undefined {
  const file = process.platform === "win32" ? "lark-cli.exe" : "lark-cli";
  const candidates = [
    isElectronAppPackaged() ? join(process.resourcesPath, "tools", "lark-cli", file) : undefined,
    join(
      import.meta.dirname,
      "../../bundled-tools",
      resolvePlatformKeyForPackagedApp(),
      "lark-cli",
      file,
    ),
  ];
  return candidates.find((path) => path && existsSync(path));
}
function preferredBinary(
  bundled: string | undefined,
  key: string,
  localEnv: LocalRuntimeEnv,
): string | undefined {
  if (bundled) return bundled;
  const explicit = lookup(key, localEnv);
  return explicit && existsSync(explicit) ? explicit : undefined;
}
export function buildHostProcessEnv(hostProcessLocalEnv: Record<string, string>) {
  const bundledAgent = resolveBundledAgentBinaryPath();
  const bundledLark = larkBinary();
  const agent = preferredBinary(bundledAgent, "KNORVIA_AGENT_BINARY", hostProcessLocalEnv);
  const lark = preferredBinary(bundledLark, "KNORVIA_LARK_CLI_BINARY", hostProcessLocalEnv);
  const base = getDataBaseDir();
  const inherited: Record<string, string> = { ...hostProcessLocalEnv };
  for (const [key, value] of Object.entries(process.env))
    if (typeof value === "string") inherited[key] = value;
  const packaged = isElectronAppPackaged();
  let helper: string | undefined;
  if (process.platform === "darwin") {
    if (packaged) helper = join(process.resourcesPath, "cua-helper", HELPER_APP_NAME);
    else if (
      ["1", "true", "on"].includes(
        (inherited.KNORVIA_CUA_HELPER_ALLOW_UNSIGNED_LOCAL ?? "").trim().toLowerCase(),
      )
    ) {
      helper =
        inherited.KNORVIA_CUA_BUNDLED_HELPER_APP_PATH?.trim() ||
        join(
          inherited.KNORVIA_HOME?.trim() || join(homedir(), ".knorvia-studio"),
          "computer-use",
          "dev",
          DEV_HELPER_APP_NAME,
        );
    }
  }
  // 保留独立守卫的即时端口读取，不能复用先前捕获的 packaged 值。
  const guardPlatform = process.platform;
  const guardPackaged = isElectronAppPackaged();
  const guardResources = process.resourcesPath;
  const trimmedResources =
    guardPlatform === "win32" && guardPackaged ? guardResources?.trim() : undefined;
  const windowsDir = trimmedResources ? win32.dirname(trimmedResources) : undefined;
  const env = stripSelectedLinks({
    ...sanitizeKnorviaRuntimeEnv(inherited),
    ...buildKnorviaToolEnvPassthroughEnv(inherited),
  });
  if (packaged) delete env.KNORVIA_CUA_HELPER_ALLOW_UNSIGNED_LOCAL;
  const mode = packaged
    ? preview
      ? "alwaysOn"
      : undefined
    : normalizeDynamicWorkflowMode(inherited[KNORVIA_DYNAMIC_WORKFLOW_MODE_ENV]);
  delete env[KNORVIA_DYNAMIC_WORKFLOW_MODE_ENV];
  return {
    ...env,
    [KNORVIA_RUNTIME_ENV_KEY]: desktopRuntimeEnv,
    KNORVIA_ENV: KNORVIA_ENV,
    ...(preview ? { KNORVIA_CUA_HELPER_INSTALL_VARIANT: "preview" } : {}),
    ...(mode ? { [KNORVIA_DYNAMIC_WORKFLOW_MODE_ENV]: mode } : {}),
    [KNORVIA_APP_VERSION_ENV]: KNORVIA_VERSION,
    ...buildDesktopProfileEnvironment(base),
    ...(windowsDir ? { [KNORVIA_WINDOWS_APP_INSTALL_DIR_ENV]: windowsDir } : {}),
    ...(helper ? { [KNORVIA_CUA_BUNDLED_HELPER_APP_PATH_ENV]: helper } : {}),
    ...(agent ? { KNORVIA_AGENT_BINARY: agent } : {}),
    ...(lark ? { KNORVIA_LARK_CLI_BINARY: lark } : {}),
  };
}
