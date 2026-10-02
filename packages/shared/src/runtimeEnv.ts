export const KNORVIA_RUNTIME_ENV_KEY = "KNORVIA_RUNTIME_ENV";

export const KNORVIA_HTTP_PROXY_ENV_KEY = "KNORVIA_HTTP_PROXY";

export const KNORVIA_NO_PROXY_ENV_KEY = "KNORVIA_NO_PROXY";

export const KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY =
  "KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY";

export const KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY = "KNORVIA_REMOTE_HTTP_PROXY";

export const KNORVIA_REMOTE_NO_PROXY_ENV_KEY = "KNORVIA_REMOTE_NO_PROXY";

export const KNORVIA_AGENT_CA_CERT_ENV_KEY = "KNORVIA_AGENT_CA_CERT";

export const KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY = "KNORVIA_TOOL_ENV_PASSTHROUGH_JSON";

export const KNORVIA_DESKTOP_CONTEXT_PROMPT_ENABLED_ENV = "KNORVIA_DESKTOP_CONTEXT_PROMPT_ENABLED";

export const KNORVIA_CUA_PRODUCT_HELPER_ENV_KEY = "KNORVIA_CUA_PRODUCT_HELPER";

export const KNORVIA_CUA_BROKER_SOCKET_ENV_KEY = "KNORVIA_CUA_PERMISSION_BROKER_SOCKET";

export const KNORVIA_CUA_NODE_REPL_HOST_ENV_KEY = "KNORVIA_CUA_NODE_REPL_HOST";

export const KNORVIA_CUA_DEV_MODE_ENV_KEY = "KNORVIA_CUA_DEV_MODE";

export type KnorviaRuntimeEnv = "development" | "production" | "test";

type EnvRecord = Record<string, string | undefined>;

export function isCuaDevModeRequested(env: EnvRecord = process.env): boolean {
  const requested = env[KNORVIA_CUA_DEV_MODE_ENV_KEY]?.trim().toLowerCase();
  return requested === "1" || requested === "true" || requested === "on";
}

export function isKnorviaCuaInternalFeatureEnabled(env: EnvRecord = process.env): boolean {
  if (isCuaDevModeRequested(env)) {
    return true;
  }
  const product = env[KNORVIA_CUA_PRODUCT_HELPER_ENV_KEY]?.trim().toLowerCase();
  return product !== "0" && product !== "false" && product !== "off";
}

const SANITIZED_RUNTIME_ENV_KEYS = [
  "NODE_ENV",
  "ELECTRON_RUN_AS_NODE",
  "NODE_NO_WARNINGS",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "REQUESTS_CA_BUNDLE",
  "CURL_CA_BUNDLE",
  "GIT_SSL_CAINFO",
  KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY,
  KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY,
  KNORVIA_REMOTE_NO_PROXY_ENV_KEY,
  KNORVIA_CUA_BROKER_SOCKET_ENV_KEY,
  "KNORVIA_CUA_PERMISSION_BROKER_TOKEN",
  "KNORVIA_CUA_PERMISSION_BROKER_REFRESH_MARKER",
  "KNORVIA_CUA_PLUGIN_AUTHORITY",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
  "OTEL_EXPORTER_OTLP_HEADERS",
  "OTEL_EXPORTER_OTLP_TRACES_HEADERS",
  "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
  "OTEL_EXPORTER_OTLP_METRICS_HEADERS",
  "OTEL_SERVICE_NAME",
  "OTEL_RESOURCE_ATTRIBUTES",
  "OTEL_EXPORTER_OTLP_COMPRESSION",
  "KNORVIA_MODEL_TELEMETRY_ENABLED",
  "KNORVIA_TELEMETRY_DEVICE_MID",
  "KNORVIA_TELEMETRY_USER_ID",
  "KNORVIA_TELEMETRY_USER_ID_HASH",
  "KNORVIA_TELEMETRY_USER_SUBJECT_ID",
  "KNORVIA_TELEMETRY_IDENTITY_STATE",
  "KNORVIA_TELEMETRY_RUNTIME_SURFACE",
  "KNORVIA_TELEMETRY_RUNTIME_DISTRIBUTION",
] as const;

const NON_TOOL_PASSTHROUGH_RUNTIME_ENV_KEYS = [
  "NODE_ENV",
  "ELECTRON_RUN_AS_NODE",
  "NODE_NO_WARNINGS",
  KNORVIA_CUA_BROKER_SOCKET_ENV_KEY,
  "KNORVIA_CUA_PERMISSION_BROKER_REFRESH_MARKER",
  "KNORVIA_CUA_PLUGIN_AUTHORITY",
  KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY,
  KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY,
  KNORVIA_REMOTE_NO_PROXY_ENV_KEY,
] as const;

const SANITIZED_PACKAGE_MANAGER_ENV_PATTERN =
  /^(npm_config|yarn|pnpm)_(http_proxy|https_proxy|proxy|all_proxy|no_proxy|cafile|ca)$/i;

export function normalizeKnorviaRuntimeEnv(
  value: string | undefined,
): KnorviaRuntimeEnv | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "development" || normalized === "production" || normalized === "test") {
    return normalized;
  }
  return undefined;
}

export function resolveKnorviaRuntimeEnv(
  env: Record<string, string | undefined>,
  fallback: KnorviaRuntimeEnv = "production",
): KnorviaRuntimeEnv {
  return normalizeKnorviaRuntimeEnv(env[KNORVIA_RUNTIME_ENV_KEY]) ?? fallback;
}

export const KNORVIA_CUA_PLUGIN_AUTHORITY_ENV_KEY = "KNORVIA_CUA_PLUGIN_AUTHORITY";

interface CapturedCuaBrokerCredentials {
  socket: string;
  pluginAuthority: string;
  refreshMarker?: string;
}

let capturedCuaBrokerCredentials: Readonly<CapturedCuaBrokerCredentials> | undefined;

const capturedKnorviaAgentTelemetryEnv: Record<string, string> = {};

function captureKnorviaCuaBrokerCredentials(env: Record<string, string | undefined>): void {
  const socket = env[KNORVIA_CUA_BROKER_SOCKET_ENV_KEY]?.trim();
  const pluginAuthority = env[KNORVIA_CUA_PLUGIN_AUTHORITY_ENV_KEY]?.trim();
  const refreshMarker = env["KNORVIA_CUA_PERMISSION_BROKER_REFRESH_MARKER"]?.trim();
  if (socket && pluginAuthority) {
    capturedCuaBrokerCredentials = Object.freeze({
      socket,
      pluginAuthority,
      ...(refreshMarker ? { refreshMarker } : {}),
    });
    return;
  }
  if (socket || pluginAuthority) {
    capturedCuaBrokerCredentials = undefined;
  }
}

function captureKnorviaAgentTelemetryEnv(env: Record<string, string | undefined>): void {
  Object.assign(capturedKnorviaAgentTelemetryEnv, readKnorviaAgentTelemetryEnv(env));
}

export function readKnorviaAgentTelemetryEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const telemetry: Record<string, string> = {};
  for (const key of SANITIZED_RUNTIME_ENV_KEYS) {
    if (isKnorviaAgentTelemetryEnvKey(key)) {
      const value = env[key]?.trim();
      if (value) {
        telemetry[key] = value;
      }
    }
  }
  return telemetry;
}

export function getCapturedKnorviaAgentTelemetryEnv(): Record<string, string> {
  return { ...capturedKnorviaAgentTelemetryEnv };
}

export function getCapturedKnorviaCuaBrokerCredentials(): {
  socket: string | undefined;
  pluginAuthority: string | undefined;
  refreshMarker?: string;
} {
  if (capturedCuaBrokerCredentials) {
    return { ...capturedCuaBrokerCredentials };
  }
  return { socket: undefined, pluginAuthority: undefined };
}

export function resetCapturedKnorviaCuaBrokerCredentialsForTest(): void {
  capturedCuaBrokerCredentials = undefined;
}

export function resetCapturedKnorviaAgentTelemetryEnvForTest(): void {
  for (const key of Object.keys(capturedKnorviaAgentTelemetryEnv)) {
    delete capturedKnorviaAgentTelemetryEnv[key];
  }
}

export function sanitizeKnorviaRuntimeEnv<T extends Record<string, string | undefined>>(
  env: T,
): Record<string, string> {
  captureKnorviaCuaBrokerCredentials(env);
  captureKnorviaAgentTelemetryEnv(env);
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || shouldSanitizeKnorviaRuntimeEnvKey(key)) {
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

export function buildKnorviaToolEnvPassthroughEnv(env: EnvRecord): Record<string, string> {
  const captured = readKnorviaToolEnvPassthroughEnv(env);
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || !shouldCaptureKnorviaToolEnvPassthroughKey(key)) {
      continue;
    }
    captured[key] = value;
  }
  return stringifyKnorviaToolEnvPassthroughEnv(captured);
}

export function readKnorviaToolEnvPassthroughEnv(env: EnvRecord): Record<string, string> {
  const raw = env[KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY];
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const captured: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (
        typeof value === "string" &&
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) &&
        shouldCaptureKnorviaToolEnvPassthroughKey(key)
      ) {
        captured[key] = value;
      }
    }
    return captured;
  } catch {
    return {};
  }
}

export function sanitizeKnorviaRuntimeEnvInPlace(env: Record<string, string | undefined>): void {
  captureKnorviaCuaBrokerCredentials(env);
  captureKnorviaAgentTelemetryEnv(env);
  for (const key of Object.keys(env)) {
    if (shouldSanitizeKnorviaRuntimeEnvKey(key)) {
      delete env[key];
    }
  }
}

function isKnorviaAgentTelemetryEnvKey(key: string): boolean {
  return (
    key.startsWith("OTEL_") ||
    key.startsWith("KNORVIA_TELEMETRY_") ||
    key === "KNORVIA_MODEL_TELEMETRY_ENABLED"
  );
}

export function shouldSanitizeKnorviaRuntimeEnvKey(key: string): boolean {
  const normalized = key.toUpperCase();
  return (
    SANITIZED_RUNTIME_ENV_KEYS.some((candidate) => candidate === normalized) ||
    SANITIZED_PACKAGE_MANAGER_ENV_PATTERN.test(key)
  );
}

export function shouldCaptureKnorviaToolEnvPassthroughKey(key: string): boolean {
  const normalized = key.toUpperCase();
  if (isKnorviaAgentTelemetryEnvKey(normalized)) {
    return false;
  }
  if (NON_TOOL_PASSTHROUGH_RUNTIME_ENV_KEYS.some((candidate) => candidate === normalized)) {
    return false;
  }
  return shouldSanitizeKnorviaRuntimeEnvKey(key);
}

function stringifyKnorviaToolEnvPassthroughEnv(
  captured: Record<string, string>,
): Record<string, string> {
  const sorted = Object.entries(captured).sort(([left], [right]) => left.localeCompare(right));
  if (sorted.length === 0) {
    return {};
  }
  return { [KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY]: JSON.stringify(Object.fromEntries(sorted)) };
}
