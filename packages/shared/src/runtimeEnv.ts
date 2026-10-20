// SPDX-License-Identifier: Apache-2.0
// 运行时环境：键名再导出、归一/清洗/透传，以及两个进程级捕获槽（B7–B11）。
// 键名与名单本身在 runtimeEnv-data.ts；这里只保留归一、捕获与透传逻辑。
import {
  BROKER_REFRESH_MARKER_KEY,
  CUA_DEV_MODE_TRUTHY_TOKENS,
  CUA_HELPER_FALSY_TOKENS,
  HOST_PROCESS_KEYS,
  KNORVIA_CUA_BROKER_SOCKET_ENV_KEY,
  KNORVIA_CUA_DEV_MODE_ENV_KEY,
  KNORVIA_CUA_PLUGIN_AUTHORITY_ENV_KEY,
  KNORVIA_CUA_PRODUCT_HELPER_ENV_KEY,
  KNORVIA_RUNTIME_ENV_KEY,
  KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY,
  NON_TOOL_PASSTHROUGH_KEYS,
  RUNTIME_ENV_VALUES,
  REMOTE_AND_CUA_KEYS,
  TELEMETRY_KEY_PREFIXES,
  TELEMETRY_SINGLETON_KEY,
  TELEMETRY_STATIC_KEYS,
} from "./runtimeEnv-data.js";

// 14 个键名常量是合同冻结面，声明在数据文件里，这里原样再导出（B7）。
export {
  KNORVIA_AGENT_CA_CERT_ENV_KEY,
  KNORVIA_CUA_BROKER_SOCKET_ENV_KEY,
  KNORVIA_CUA_DEV_MODE_ENV_KEY,
  KNORVIA_CUA_NODE_REPL_HOST_ENV_KEY,
  KNORVIA_CUA_PLUGIN_AUTHORITY_ENV_KEY,
  KNORVIA_CUA_PRODUCT_HELPER_ENV_KEY,
  KNORVIA_DESKTOP_CONTEXT_PROMPT_ENABLED_ENV,
  KNORVIA_HTTP_PROXY_ENV_KEY,
  KNORVIA_NO_PROXY_ENV_KEY,
  KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY,
  KNORVIA_REMOTE_NO_PROXY_ENV_KEY,
  KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY,
  KNORVIA_RUNTIME_ENV_KEY,
  KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY,
} from "./runtimeEnv-data.js";

type RuntimeEnvTuple = typeof RUNTIME_ENV_VALUES;
export type KnorviaRuntimeEnv = RuntimeEnvTuple[number];

/** 环境对象的最小心智模型：键任意、值可缺省。 */
type EnvBag = Record<string, string | undefined>;

const RUNTIME_ENV_SET: ReadonlySet<string> = new Set<string>(RUNTIME_ENV_VALUES);
const TRUTHY_SWITCH = new Set<string>(CUA_DEV_MODE_TRUTHY_TOKENS);
const FALSY_SWITCH = new Set<string>(CUA_HELPER_FALSY_TOKENS);

// 清洗名单按「宿主键 → 远程/CUA 键 → 遥测键」三段拼装，段内顺序即遥测捕获键序。
const HOST_KEYS: readonly string[] = HOST_PROCESS_KEYS;
const REMOTE_KEYS: readonly string[] = REMOTE_AND_CUA_KEYS;
const TELEMETRY_KEYS: readonly string[] = TELEMETRY_STATIC_KEYS;
const SANITIZED_KEYS: readonly string[] = HOST_KEYS.concat(REMOTE_KEYS, TELEMETRY_KEYS);
const SANITIZED_KEY_SET = new Set<string>(SANITIZED_KEYS);
const NON_PASSTHROUGH_KEY_SET = new Set<string>(NON_TOOL_PASSTHROUGH_KEYS);

// 包管理器代理/证书键（大小写不敏感）。
const PACKAGE_MANAGER_PROXY_PATTERN =
  /^(?:npm_config|yarn|pnpm)_(?:http_proxy|https_proxy|proxy|all_proxy|no_proxy|cafile|ca)$/iu;

/** 小写归一口径：缺省与纯空白都视为「没有这个值」。 */
function normalizeToken(value: string | undefined): string | undefined {
  const folded = value?.trim().toLowerCase() ?? "";
  return folded.length === 0 ? undefined : folded;
}

/** 保形口径：只裁空白，保留原大小写（遥测值要原样外传）。 */
function trimmedValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? undefined : trimmed;
}

export const isCuaDevModeRequested = (environment: EnvBag = process.env): boolean => {
  const devModeToken = normalizeToken(environment[KNORVIA_CUA_DEV_MODE_ENV_KEY]);
  return devModeToken !== undefined && TRUTHY_SWITCH.has(devModeToken);
};

export const isKnorviaCuaInternalFeatureEnabled = (environment: EnvBag = process.env): boolean => {
  // dev 模式压过 product helper 关闭；helper 未显式关闭（或缺席）时默认开启。
  if (isCuaDevModeRequested(environment)) return true;
  const helperToken = normalizeToken(environment[KNORVIA_CUA_PRODUCT_HELPER_ENV_KEY]);
  return helperToken === undefined || !FALSY_SWITCH.has(helperToken);
};

export const normalizeKnorviaRuntimeEnv = (
  raw: string | undefined,
): KnorviaRuntimeEnv | undefined => {
  const candidate = normalizeToken(raw);
  if (candidate === undefined || !RUNTIME_ENV_SET.has(candidate)) return undefined;
  return candidate as KnorviaRuntimeEnv;
};

export const resolveKnorviaRuntimeEnv = (
  environment: EnvBag,
  fallback: KnorviaRuntimeEnv = "production",
): KnorviaRuntimeEnv =>
  normalizeKnorviaRuntimeEnv(environment[KNORVIA_RUNTIME_ENV_KEY]) ?? fallback;

type BrokerCredentials = {
  readonly socket: /* broker 套接字地址 */ string;
  readonly pluginAuthority: /* 插件授权端点 */ string;
  readonly refreshMarker?: /* 刷新标记；只在给出时在场 */ string;
};

type BrokerCredentialsView = {
  readonly socket: /* 已捕获的地址或缺席 */ string | undefined;
  readonly pluginAuthority: /* 已捕获的授权端点或缺席 */ string | undefined;
  readonly refreshMarker?: /* 刷新标记快照 */ string;
};

// 进程级两个捕获槽：启动时 sanitize 一次，之后只读（B10）。
let brokerSlot: BrokerCredentials | null = null;
const telemetrySlot: Record<string, string> = {};

function captureBroker(environment: EnvBag): void {
  const socket = trimmedValue(environment[KNORVIA_CUA_BROKER_SOCKET_ENV_KEY]);
  const pluginAuthority = trimmedValue(environment[KNORVIA_CUA_PLUGIN_AUTHORITY_ENV_KEY]);
  const refreshMarker = trimmedValue(environment[BROKER_REFRESH_MARKER_KEY]);
  if (socket !== undefined && pluginAuthority !== undefined) {
    brokerSlot = Object.freeze(
      refreshMarker === undefined
        ? { socket, pluginAuthority }
        : { socket, pluginAuthority, refreshMarker },
    );
  } else if (socket !== undefined || pluginAuthority !== undefined) {
    // 只有一半凭据时按「无凭据」处理，不留下半截状态。
    brokerSlot = null;
  }
}

function isTelemetryKey(candidate: string): boolean {
  if (candidate === TELEMETRY_SINGLETON_KEY) return true;
  return TELEMETRY_KEY_PREFIXES.some((prefix) => candidate.startsWith(prefix));
}

export const readKnorviaAgentTelemetryEnv = (environment: EnvBag): Record<string, string> => {
  const collected: Record<string, string> = {};
  for (const envKey of SANITIZED_KEYS) {
    if (!isTelemetryKey(envKey)) continue;
    const value = trimmedValue(environment[envKey]);
    if (value !== undefined) collected[envKey] = value;
  }
  return collected;
};

function captureTelemetry(environment: EnvBag): void {
  for (const [envKey, value] of Object.entries(readKnorviaAgentTelemetryEnv(environment))) {
    telemetrySlot[envKey] = value;
  }
}

export const getCapturedKnorviaAgentTelemetryEnv = (): Record<string, string> => ({
  ...telemetrySlot,
});

export const getCapturedKnorviaCuaBrokerCredentials = (): BrokerCredentialsView => ({
  socket: brokerSlot?.socket,
  pluginAuthority: brokerSlot?.pluginAuthority,
  ...(brokerSlot?.refreshMarker === undefined ? {} : { refreshMarker: brokerSlot.refreshMarker }),
});

export const resetCapturedKnorviaCuaBrokerCredentialsForTest = (): void => {
  brokerSlot = null;
};

export const resetCapturedKnorviaAgentTelemetryEnvForTest = (): void => {
  for (const envKey of Object.keys(telemetrySlot)) delete telemetrySlot[envKey];
};

function runCapture(environment: EnvBag): void {
  captureBroker(environment);
  captureTelemetry(environment);
}

export const sanitizeKnorviaRuntimeEnv = <T extends EnvBag>(
  environment: T,
): Record<string, string> => {
  runCapture(environment);
  const kept = Object.entries(environment).filter(
    ([envKey, rawValue]) => rawValue !== undefined && !shouldSanitizeKnorviaRuntimeEnvKey(envKey),
  );
  return Object.fromEntries(kept) as Record<string, string>;
};

export const sanitizeKnorviaRuntimeEnvInPlace = (environment: EnvBag): void => {
  runCapture(environment);
  const doomed = Object.keys(environment).filter((envKey) =>
    shouldSanitizeKnorviaRuntimeEnvKey(envKey),
  );
  for (const envKey of doomed) delete environment[envKey];
};

export const shouldSanitizeKnorviaRuntimeEnvKey = (envKey: string): boolean => {
  if (SANITIZED_KEY_SET.has(envKey.toUpperCase())) return true;
  return PACKAGE_MANAGER_PROXY_PATTERN.test(envKey);
};

export const shouldCaptureKnorviaToolEnvPassthroughKey = (envKey: string): boolean => {
  const upper = envKey.toUpperCase();
  if (NON_PASSTHROUGH_KEY_SET.has(upper) || isTelemetryKey(upper)) return false;
  return shouldSanitizeKnorviaRuntimeEnvKey(envKey);
};

export const readKnorviaToolEnvPassthroughEnv = (environment: EnvBag): Record<string, string> => {
  const rawJson = environment[KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY];
  if (!rawJson) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {}; // 坏 JSON 一律当空表
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};

  const collected: Record<string, string> = {};
  for (const [envKey, rawValue] of Object.entries(parsed)) {
    if (typeof rawValue !== "string") continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envKey)) continue;
    if (!shouldCaptureKnorviaToolEnvPassthroughKey(envKey)) continue;
    collected[envKey] = rawValue;
  }
  return collected;
};

export const buildKnorviaToolEnvPassthroughEnv = (environment: EnvBag): Record<string, string> => {
  const merged = readKnorviaToolEnvPassthroughEnv(environment);
  for (const [envKey, rawValue] of Object.entries(environment)) {
    if (rawValue === undefined) continue;
    if (!shouldCaptureKnorviaToolEnvPassthroughKey(envKey)) continue;
    merged[envKey] = rawValue;
  }
  const sorted = Object.entries(merged).sort(([left], [right]) => left.localeCompare(right));
  if (sorted.length === 0) return {};
  return { [KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY]: JSON.stringify(Object.fromEntries(sorted)) };
};
