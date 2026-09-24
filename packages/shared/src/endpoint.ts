import type { KnorviaEnv } from "./env.js";

export const DEFAULT_KNORVIA_ENDPOINT_ORIGIN = "";
export const DEFAULT_BIGMODEL_API_ORIGIN = "https://bigmodel.cn";
export const DEFAULT_ZAI_BUSINESS_BASE_URL = "https://api.z.ai";

// 构建仅注入公开链接；Node 调用方仍可显式传 env，避免读取另一进程的配置。
declare const __KNORVIA_ENDPOINT_ENV__: Record<string, string | undefined> | undefined;
export function pickProductEndpointEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const keys = [
    "KNORVIA_BASE_URL",
    "KNORVIA_ENDPOINT_ORIGIN",
    "BIGMODEL_API_BASE_URL",
    "ZAI_BUSINESS_BASE_URL",
  ];
  return Object.fromEntries(
    keys.flatMap((key) => (env[key]?.trim() ? [[key, env[key]!.trim()]] : [])),
  );
}
export function readProductEndpointEnv(): Record<string, string | undefined> {
  return {
    ...(typeof __KNORVIA_ENDPOINT_ENV__ === "undefined" ? {} : __KNORVIA_ENDPOINT_ENV__),
    ...pickProductEndpointEnv(typeof process === "undefined" ? {} : process.env),
  };
}

export interface KnorviaEndpointUrls {
  origin: string;
  apiBaseUrl: string;
}

export interface RuntimeKnorviaEndpointEnv {
  [key: string]: string | undefined;
  KNORVIA_ENV?: string;
  KNORVIA_BASE_URL?: string;
  KNORVIA_ENDPOINT_ORIGIN?: string;
}

export interface RuntimeBigModelApiEnv {
  [key: string]: string | undefined;
  KNORVIA_ENV?: string;
  BIGMODEL_API_BASE_URL?: string;
}

export interface RuntimeZaiEndpointEnv {
  [key: string]: string | undefined;
  KNORVIA_ENV?: string;
  ZAI_BUSINESS_BASE_URL?: string;
}

export interface RuntimeProductEndpointEnv
  extends RuntimeKnorviaEndpointEnv, RuntimeBigModelApiEnv, RuntimeZaiEndpointEnv {}

export interface RuntimeProductEndpointConfig {
  knorviaEnv: KnorviaEnv;
  knorviaEndpointOrigin: string;
  endpointUrls: KnorviaEndpointUrls;
  zaiBusinessBaseUrl: string;
  bigModelApiOrigin: string;
}

function readRuntimeEnvValue(
  env: Record<string, string | undefined>,
  key: string,
): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

export function normalizeKnorviaEndpointOrigin(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Knorvia Studio endpoint origin is empty");
  }

  const parsed = new URL(trimmed);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Knorvia Studio endpoint origin must use http or https");
  }
  return parsed.origin;
}

export function resolveKnorviaEndpointOrigin(options?: {
  env?: KnorviaEnv;
  envBaseOrigin?: string | null;
  overrideOrigin?: string | null;
}): string {
  const origin = options?.overrideOrigin?.trim() || options?.envBaseOrigin?.trim();
  return origin ? normalizeKnorviaEndpointOrigin(origin) : DEFAULT_KNORVIA_ENDPOINT_ORIGIN;
}

export function resolveRuntimeKnorviaEnv(
  env: RuntimeKnorviaEndpointEnv = readProductEndpointEnv(),
): KnorviaEnv {
  // 产品身份仅用于既有展示与安装标识，不参与地址解析。
  return env.KNORVIA_ENV?.trim().toLowerCase() === "test" ? "test" : "production";
}

export function resolveRuntimeKnorviaEndpointOrigin(
  env: RuntimeKnorviaEndpointEnv = readProductEndpointEnv(),
  options?: { overrideOrigin?: string | null },
): string {
  return resolveKnorviaEndpointOrigin({
    envBaseOrigin:
      readRuntimeEnvValue(env, "KNORVIA_BASE_URL") ??
      readRuntimeEnvValue(env, "KNORVIA_ENDPOINT_ORIGIN"),
    overrideOrigin: options?.overrideOrigin,
  });
}

export function buildRuntimeKnorviaEndpointUrls(
  env: RuntimeKnorviaEndpointEnv = readProductEndpointEnv(),
): KnorviaEndpointUrls {
  return buildKnorviaEndpointUrls(resolveRuntimeKnorviaEndpointOrigin(env));
}

export function buildRuntimeKnorviaApiUrl(
  env: RuntimeKnorviaEndpointEnv = readProductEndpointEnv(),
  path: string,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${resolveRuntimeKnorviaEndpointOrigin(env)}${normalizedPath}`;
}

export function resolveBigModelApiOrigin(
  env: RuntimeBigModelApiEnv = readProductEndpointEnv(),
): string {
  return normalizeKnorviaEndpointOrigin(
    readRuntimeEnvValue(env, "BIGMODEL_API_BASE_URL") ?? DEFAULT_BIGMODEL_API_ORIGIN,
  );
}

export function buildBigModelApiUrl(
  env: RuntimeBigModelApiEnv = readProductEndpointEnv(),
  path: string,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${resolveBigModelApiOrigin(env)}${normalizedPath}`;
}

export function buildBigModelCodingPlanPersonalManageUrl(
  env: RuntimeBigModelApiEnv = readProductEndpointEnv(),
): string {
  // 管理页与业务 API 共用显式 origin，避免把已登录账号带到另一个部署。
  return buildBigModelApiUrl(env, "/coding-plan/personal/overview");
}

export function buildBigModelCodingPlanTeamManageUrl(
  env: RuntimeBigModelApiEnv = readProductEndpointEnv(),
): string {
  return buildBigModelApiUrl(env, "/coding-plan/team/plans");
}

export function resolveZaiBusinessBaseUrl(
  env: RuntimeZaiEndpointEnv = readProductEndpointEnv(),
): string {
  return normalizeKnorviaEndpointOrigin(
    readRuntimeEnvValue(env, "ZAI_BUSINESS_BASE_URL") ?? DEFAULT_ZAI_BUSINESS_BASE_URL,
  );
}

export function buildRuntimeZaiBusinessUrl(
  env: RuntimeZaiEndpointEnv = readProductEndpointEnv(),
  path: string,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${resolveZaiBusinessBaseUrl(env)}${normalizedPath}`;
}

export function resolveRuntimeProductEndpointConfig(
  env: RuntimeProductEndpointEnv = readProductEndpointEnv(),
): RuntimeProductEndpointConfig {
  const knorviaEnv = resolveRuntimeKnorviaEnv(env);
  const knorviaEndpointOrigin = resolveRuntimeKnorviaEndpointOrigin(env);

  return {
    knorviaEnv,
    knorviaEndpointOrigin,
    endpointUrls: buildKnorviaEndpointUrls(knorviaEndpointOrigin),
    zaiBusinessBaseUrl: resolveZaiBusinessBaseUrl(env),
    bigModelApiOrigin: resolveBigModelApiOrigin(env),
  };
}

export function buildKnorviaEndpointUrls(origin: string): KnorviaEndpointUrls {
  const normalizedOrigin = normalizeKnorviaEndpointOrigin(origin);
  return {
    origin: normalizedOrigin,
    apiBaseUrl: `${normalizedOrigin}/api/v1`,
  };
}
