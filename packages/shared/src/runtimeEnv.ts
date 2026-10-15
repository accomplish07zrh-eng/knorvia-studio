// SPDX-License-Identifier: Apache-2.0
// 运行时环境：键名词表、归一/清洗/透传，以及两个进程级捕获槽（B7–B11）。

/** 运行时环境键名词表（分组装载）：取值逐字不变（known-differences §4 环境变量名清单）。 */
const ENV_KEY_GROUPS = {
  runtime: "KNORVIA_RUNTIME_ENV",
  httpProxy: "KNORVIA_HTTP_PROXY",
  noProxy: "KNORVIA_NO_PROXY",
  remoteAuthority: "KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY",
  remoteHttpProxy: "KNORVIA_REMOTE_HTTP_PROXY",
  remoteNoProxy: "KNORVIA_REMOTE_NO_PROXY",
  agentCaCert: "KNORVIA_AGENT_CA_CERT",
  toolPassthrough: "KNORVIA_TOOL_ENV_PASSTHROUGH_JSON",
  desktopPrompt: "KNORVIA_DESKTOP_CONTEXT_PROMPT_ENABLED",
  cuaProductHelper: "KNORVIA_CUA_PRODUCT_HELPER",
  cuaBrokerSocket: "KNORVIA_CUA_PERMISSION_BROKER_SOCKET",
  cuaReplHost: "KNORVIA_CUA_NODE_REPL_HOST",
  cuaDevMode: "KNORVIA_CUA_DEV_MODE",
  cuaPluginAuthority: "KNORVIA_CUA_PLUGIN_AUTHORITY",
} as const;

export const KNORVIA_RUNTIME_ENV_KEY = ENV_KEY_GROUPS.runtime;
export const KNORVIA_HTTP_PROXY_ENV_KEY = ENV_KEY_GROUPS.httpProxy;
export const KNORVIA_NO_PROXY_ENV_KEY = ENV_KEY_GROUPS.noProxy;
export const KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY = ENV_KEY_GROUPS.remoteAuthority;
export const KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY = ENV_KEY_GROUPS.remoteHttpProxy;
export const KNORVIA_REMOTE_NO_PROXY_ENV_KEY = ENV_KEY_GROUPS.remoteNoProxy;
export const KNORVIA_AGENT_CA_CERT_ENV_KEY = ENV_KEY_GROUPS.agentCaCert;
export const KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY = ENV_KEY_GROUPS.toolPassthrough;
export const KNORVIA_DESKTOP_CONTEXT_PROMPT_ENABLED_ENV = ENV_KEY_GROUPS.desktopPrompt;
export const KNORVIA_CUA_PRODUCT_HELPER_ENV_KEY = ENV_KEY_GROUPS.cuaProductHelper;
export const KNORVIA_CUA_BROKER_SOCKET_ENV_KEY = ENV_KEY_GROUPS.cuaBrokerSocket;
export const KNORVIA_CUA_NODE_REPL_HOST_ENV_KEY = ENV_KEY_GROUPS.cuaReplHost;
export const KNORVIA_CUA_DEV_MODE_ENV_KEY = ENV_KEY_GROUPS.cuaDevMode;
export const KNORVIA_CUA_PLUGIN_AUTHORITY_ENV_KEY = ENV_KEY_GROUPS.cuaPluginAuthority;

const RUNTIME_ENV_VALUES = ["development", "production", "test"] as const;
export type KnorviaRuntimeEnv = (typeof RUNTIME_ENV_VALUES)[number];

type EnvironmentRecord = Record<string, string | undefined>;

const CUA_DEV_MODE_TRUTHY_TOKENS = new Set(["1", "true", "on"]);
const CUA_HELPER_FALSY_TOKENS = new Set(["0", "false", "off"]);

export function isCuaDevModeRequested(environment: EnvironmentRecord = process.env): boolean {
  const requested = environment[ENV_KEY_GROUPS.cuaDevMode]?.trim().toLowerCase();
  return requested !== undefined && CUA_DEV_MODE_TRUTHY_TOKENS.has(requested);
}

export function isKnorviaCuaInternalFeatureEnabled(
  environment: EnvironmentRecord = process.env,
): boolean {
  const devRequested = isCuaDevModeRequested(environment);
  const helperSwitch = environment[ENV_KEY_GROUPS.cuaProductHelper]?.trim().toLowerCase();
  return devRequested || helperSwitch === undefined || !CUA_HELPER_FALSY_TOKENS.has(helperSwitch);
}

/**
 * 清洗名单的静态部分（键集合逐字冻结）：宿主进程/代理/证书键与遥测族；
 * 远程与 CUA 键从上面词表取常量拼装，拼装顺序保持与旧实现一致（遥测捕获键序也随之一致）。
 */
const HOST_PROCESS_KEY_CHUNKS = [
  "NODE_ENV ELECTRON_RUN_AS_NODE NODE_NO_WARNINGS HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY",
  "NODE_EXTRA_CA_CERTS SSL_CERT_FILE SSL_CERT_DIR REQUESTS_CA_BUNDLE CURL_CA_BUNDLE GIT_SSL_CAINFO",
];
const HOST_PROCESS_KEYS = HOST_PROCESS_KEY_CHUNKS.flatMap((chunk) => chunk.split(" "));
const BROKER_TOKEN_KEY = "KNORVIA_CUA_PERMISSION_BROKER_TOKEN";
const BROKER_REFRESH_MARKER_KEY = "KNORVIA_CUA_PERMISSION_BROKER_REFRESH_MARKER";

const TELEMETRY_KEY_CHUNKS = [
  "OTEL_EXPORTER_OTLP_ENDPOINT OTEL_EXPORTER_OTLP_TRACES_ENDPOINT OTEL_EXPORTER_OTLP_HEADERS",
  "OTEL_EXPORTER_OTLP_TRACES_HEADERS OTEL_EXPORTER_OTLP_METRICS_ENDPOINT OTEL_EXPORTER_OTLP_METRICS_HEADERS",
  "OTEL_SERVICE_NAME OTEL_RESOURCE_ATTRIBUTES OTEL_EXPORTER_OTLP_COMPRESSION",
  "KNORVIA_MODEL_TELEMETRY_ENABLED KNORVIA_TELEMETRY_DEVICE_MID KNORVIA_TELEMETRY_USER_ID",
  "KNORVIA_TELEMETRY_USER_ID_HASH KNORVIA_TELEMETRY_USER_SUBJECT_ID KNORVIA_TELEMETRY_IDENTITY_STATE",
  "KNORVIA_TELEMETRY_RUNTIME_SURFACE KNORVIA_TELEMETRY_RUNTIME_DISTRIBUTION",
];
const TELEMETRY_STATIC_KEYS = TELEMETRY_KEY_CHUNKS.flatMap((chunk) => chunk.split(" "));

const SANITIZED_RUNTIME_ENV_KEYS: readonly string[] = [
  ...HOST_PROCESS_KEYS,
  ENV_KEY_GROUPS.remoteAuthority,
  ENV_KEY_GROUPS.remoteHttpProxy,
  ENV_KEY_GROUPS.remoteNoProxy,
  ENV_KEY_GROUPS.cuaBrokerSocket,
  BROKER_TOKEN_KEY,
  BROKER_REFRESH_MARKER_KEY,
  ENV_KEY_GROUPS.cuaPluginAuthority,
  ...TELEMETRY_STATIC_KEYS,
];

const SANITIZED_RUNTIME_ENV_KEY_SET = new Set(SANITIZED_RUNTIME_ENV_KEYS);

const NON_TOOL_PASSTHROUGH_RUNTIME_ENV_KEYS: readonly string[] = [
  ...HOST_PROCESS_KEYS.slice(0, 3),
  ENV_KEY_GROUPS.cuaBrokerSocket,
  BROKER_REFRESH_MARKER_KEY,
  ENV_KEY_GROUPS.cuaPluginAuthority,
  ENV_KEY_GROUPS.remoteAuthority,
  ENV_KEY_GROUPS.remoteHttpProxy,
  ENV_KEY_GROUPS.remoteNoProxy,
];

const NON_TOOL_PASSTHROUGH_RUNTIME_ENV_KEY_SET = new Set(NON_TOOL_PASSTHROUGH_RUNTIME_ENV_KEYS);

// 包管理器代理/证书键（大小写不敏感）。
const PACKAGE_MANAGER_PROXY_PATTERN = new RegExp(
  "^(npm_config|yarn|pnpm)_(http_proxy|https_proxy|proxy|all_proxy|no_proxy|cafile|ca)$",
  "i",
);

export function normalizeKnorviaRuntimeEnv(raw: string | undefined): KnorviaRuntimeEnv | undefined {
  const lowered = raw?.trim().toLowerCase();
  const known = (RUNTIME_ENV_VALUES as readonly string[]).find(
    (candidate) => candidate === lowered,
  );
  return known === undefined ? undefined : (known as KnorviaRuntimeEnv);
}

export function resolveKnorviaRuntimeEnv(
  environment: Record<string, string | undefined>,
  fallback: KnorviaRuntimeEnv = "production",
): KnorviaRuntimeEnv {
  return normalizeKnorviaRuntimeEnv(environment[ENV_KEY_GROUPS.runtime]) ?? fallback;
}

type BrokerCredentialSnapshot = {
  socket: /* broker 套接字地址 */ string;
  pluginAuthority: /* 插件授权端点 */ string;
  refreshMarker?: /* 刷新标记；只在给出时在场 */ string;
};

type BrokerCredentialView = {
  socket: /* 已捕获的地址或缺席 */ string | undefined;
  pluginAuthority: /* 已捕获的授权端点或缺席 */ string | undefined;
  refreshMarker?: /* 刷新标记快照 */ string;
};

// 进程级两个捕获槽：启动时 sanitize 一次，之后只读（B10）。
let brokerCredentialsSlot: Readonly<BrokerCredentialSnapshot> | undefined;
const agentTelemetryEnvSlot: Record<string, string> = {};

function captureCuaBrokerCredentials(environment: EnvironmentRecord): void {
  const socketText = environment[ENV_KEY_GROUPS.cuaBrokerSocket]?.trim();
  const authorityText = environment[ENV_KEY_GROUPS.cuaPluginAuthority]?.trim();
  const markerText = environment[BROKER_REFRESH_MARKER_KEY]?.trim();
  if (socketText && authorityText) {
    const snapshot: BrokerCredentialSnapshot = {
      socket: socketText,
      pluginAuthority: authorityText,
    };
    if (markerText) {
      snapshot.refreshMarker = markerText;
    }
    brokerCredentialsSlot = Object.freeze(snapshot);
    return;
  }
  if (socketText || authorityText) {
    // 只有一半凭据时按「无凭据」处理，不留下半截状态。
    brokerCredentialsSlot = undefined;
  }
}

function captureAgentTelemetryEnv(environment: EnvironmentRecord): void {
  Object.assign(agentTelemetryEnvSlot, readKnorviaAgentTelemetryEnv(environment));
}

const TELEMETRY_KEY_PREFIXES = ["OTEL_", "KNORVIA_TELEMETRY_"] as const;
const TELEMETRY_SINGLETON_KEY = "KNORVIA_MODEL_TELEMETRY_ENABLED";

function isAgentTelemetryKey(candidate: string): boolean {
  return (
    TELEMETRY_KEY_PREFIXES.some((prefix) => candidate.startsWith(prefix)) ||
    candidate === TELEMETRY_SINGLETON_KEY
  );
}

export function readKnorviaAgentTelemetryEnv(
  environment: EnvironmentRecord,
): Record<string, string> {
  const accumulated: Record<string, string> = {};
  for (const envKey of SANITIZED_RUNTIME_ENV_KEYS) {
    if (isAgentTelemetryKey(envKey)) {
      const trimmed = environment[envKey]?.trim();
      if (trimmed) {
        accumulated[envKey] = trimmed;
      }
    }
  }
  return accumulated;
}

export function getCapturedKnorviaAgentTelemetryEnv(): Record<string, string> {
  return { ...agentTelemetryEnvSlot };
}

export function getCapturedKnorviaCuaBrokerCredentials(): BrokerCredentialView {
  if (brokerCredentialsSlot) {
    return { ...brokerCredentialsSlot };
  }
  return { pluginAuthority: undefined, socket: undefined };
}

export function resetCapturedKnorviaCuaBrokerCredentialsForTest(): void {
  brokerCredentialsSlot = undefined;
}

export function resetCapturedKnorviaAgentTelemetryEnvForTest(): void {
  for (const envKey of Object.keys(agentTelemetryEnvSlot)) {
    delete agentTelemetryEnvSlot[envKey];
  }
}

export function sanitizeKnorviaRuntimeEnv<T extends Record<string, string | undefined>>(
  environment: T,
): Record<string, string> {
  captureCuaBrokerCredentials(environment);
  captureAgentTelemetryEnv(environment);
  const kept: Record<string, string> = {};
  for (const [envKey, rawValue] of Object.entries(environment)) {
    if (rawValue !== undefined && !shouldSanitizeKnorviaRuntimeEnvKey(envKey)) {
      kept[envKey] = rawValue;
    }
  }
  return kept;
}

export function buildKnorviaToolEnvPassthroughEnv(
  environment: EnvironmentRecord,
): Record<string, string> {
  const merged = readKnorviaToolEnvPassthroughEnv(environment);
  for (const [envKey, rawValue] of Object.entries(environment)) {
    if (rawValue !== undefined && shouldCaptureKnorviaToolEnvPassthroughKey(envKey)) {
      merged[envKey] = rawValue;
    }
  }
  return stringifyToolEnvPassthrough(merged);
}

export function readKnorviaToolEnvPassthroughEnv(
  environment: EnvironmentRecord,
): Record<string, string> {
  const rawJson = environment[ENV_KEY_GROUPS.toolPassthrough];
  if (!rawJson) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const accumulated: Record<string, string> = {};
    for (const [envKey, rawValue] of Object.entries(parsed)) {
      const keyUsable =
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(envKey) &&
        shouldCaptureKnorviaToolEnvPassthroughKey(envKey);
      if (typeof rawValue === "string" && keyUsable) {
        accumulated[envKey] = rawValue;
      }
    }
    return accumulated;
  } catch {
    return {};
  }
}

export function sanitizeKnorviaRuntimeEnvInPlace(
  environment: Record<string, string | undefined>,
): void {
  captureCuaBrokerCredentials(environment);
  captureAgentTelemetryEnv(environment);
  for (const envKey of Object.keys(environment)) {
    if (shouldSanitizeKnorviaRuntimeEnvKey(envKey)) {
      delete environment[envKey];
    }
  }
}

export function shouldSanitizeKnorviaRuntimeEnvKey(envKey: string): boolean {
  const upper = envKey.toUpperCase();
  return SANITIZED_RUNTIME_ENV_KEY_SET.has(upper) || PACKAGE_MANAGER_PROXY_PATTERN.test(envKey);
}

export function shouldCaptureKnorviaToolEnvPassthroughKey(envKey: string): boolean {
  const upper = envKey.toUpperCase();
  if (isAgentTelemetryKey(upper) || NON_TOOL_PASSTHROUGH_RUNTIME_ENV_KEY_SET.has(upper)) {
    return false;
  }
  return shouldSanitizeKnorviaRuntimeEnvKey(envKey);
}

function stringifyToolEnvPassthrough(captured: Record<string, string>): Record<string, string> {
  const sortedEntries = Object.entries(captured).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (sortedEntries.length === 0) {
    return {};
  }
  const payload = JSON.stringify(Object.fromEntries(sortedEntries));
  return { [ENV_KEY_GROUPS.toolPassthrough]: payload };
}
