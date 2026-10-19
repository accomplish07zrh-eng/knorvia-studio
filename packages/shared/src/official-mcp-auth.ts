// SPDX-License-Identifier: Apache-2.0
// 官方 MCP 的认证约定：哪些头归网关所有、如何描述身份、来源是否可信。
// Host 与 CLI 必须得出同一个结论，因此判定只写这一份，两侧都从这里取。
// 头名表、失败原因与回环白名单在 ./official-mcp-auth-data.js。

import {
  OFFICIAL_MCP_AUTH_FAILURE_REASONS,
  OFFICIAL_MCP_AUTH_HEADER_NAMES,
  OFFICIAL_MCP_AUTH_PORT_FAILURE_REASONS,
  OFFICIAL_MCP_LOOPBACK_HOSTS,
  OFFICIAL_MCP_SESSION_HEADER_NAMES,
} from "./official-mcp-auth-data.js";

export {
  OFFICIAL_MCP_AUTH_FAILURE_REASONS,
  OFFICIAL_MCP_AUTH_HEADER_NAMES,
  OFFICIAL_MCP_AUTH_PORT_FAILURE_REASONS,
};

/** 协议常量：认证方式与令牌种类会写进响应元数据，任何调用方都不得改写。 */
const AUTH_KIND = "knorvia_official";
const AUTH_TOKEN = "jwt_token";

export const KNORVIA_OFFICIAL_MCP_AUTH_TYPE = AUTH_KIND;

export const KNORVIA_OFFICIAL_MCP_AUTH_PROVIDER_JWT_TOKEN = AUTH_TOKEN;

export const OFFICIAL_MCP_AUTH_META_KEY = "com.knorvia-studio/official-mcp-auth";

/** 头名比较统一走这里：比较与返回值都是 trim + 小写后的规范形。 */
const canonical = (name: string) => name.trim().toLowerCase();

export const OFFICIAL_MCP_RESERVED_HEADER_NAMES: readonly string[] = [
  ...Object.values(OFFICIAL_MCP_AUTH_HEADER_NAMES).map(canonical),
  ...OFFICIAL_MCP_SESSION_HEADER_NAMES,
].sort();

const RESERVED = new Set(OFFICIAL_MCP_RESERVED_HEADER_NAMES);

export const isOfficialMcpReservedHeaderName = (name: string): boolean =>
  RESERVED.has(canonical(name));

/** 命中即按规范形收集并去重；返回顺序稳定，便于日志与断言。 */
export const findOfficialMcpReservedHeaders = (
  headers: Record<string, string> | undefined,
): string[] => {
  const hits = Object.keys(headers ?? {}).map(canonical);
  return [...new Set(hits.filter((name) => RESERVED.has(name)))].sort();
};

export type OfficialMcpTargetType = Uppercase<"personal" | "team">;

/** 失败原因分两级：通用原因，以及端口层才有的来源不信任。 */
type AuthFailure = (typeof OFFICIAL_MCP_AUTH_FAILURE_REASONS)[number];
type RejectionKind = `official_auth_${"rejected" | "forbidden" | "redirect_blocked"}`;

export type OfficialMcpAuthFailureReason = AuthFailure;

export type OfficialMcpAuthPortFailureReason =
  (typeof OFFICIAL_MCP_AUTH_PORT_FAILURE_REASONS)[number];

/** 端口层对外可见的全部失败种类：认证原因 + 上游拒绝的三种状态。 */
export type OfficialMcpAuthFailureKind = OfficialMcpAuthPortFailureReason | RejectionKind;

export const OFFICIAL_MCP_DEV_TRUSTED_ORIGINS_ENV = "KNORVIA_OFFICIAL_MCP_DEV_TRUSTED_ORIGINS";

export const KNORVIA_WORKSPACE_IDENTITY_ENV = "KNORVIA_WORKSPACE_IDENTITY";

/** 摘要与信任判定共用的结构化结果。 */
export type TrustDetail = "ok" | "invalid_input" | "origin_mismatch" | "knorvia_origin_unresolved";

export type OfficialMcpTrustResult = { trusted: boolean } & { detail: TrustDetail };

type DevAllowList = { devTrustedOriginsRaw?: string | undefined };
type OriginRef = { origin: string };
type PluginRef = { pluginId: string };

export type IsOfficialMcpOriginTrustedInput = DevAllowList &
  OriginRef &
  PluginRef & { knorviaApiOrigin: string | undefined };

type TrustQuery = OriginRef & PluginRef & { mcpKey: string };
type MaybePromise<T> = T | Promise<T>;

export type OfficialMcpTrustedOriginRegistry = {
  isTrusted(query: TrustQuery): Promise<OfficialMcpTrustResult>;
};

export type CreateOfficialMcpTrustedOriginRegistryOptions = DevAllowList & {
  resolveKnorviaApiOrigin: () => MaybePromise<string | undefined>;
};

const verdict = (detail: TrustDetail, trusted: boolean): OfficialMcpTrustResult => ({
  detail,
  trusted,
});

const OK = verdict("ok", true);
const BAD_INPUT = verdict("invalid_input", false);
const MISMATCH = verdict("origin_mismatch", false);
const UNRESOLVED = verdict("knorvia_origin_unresolved", false);

/**
 * 把 URL 收敛成可比较的 origin：协议与主机条件由策略函数给出。
 * 解析失败、带用户名/密码、或不符合策略都返回 undefined，由调用方决定语义。
 */
const originUnder = (candidate: string, accept: (url: URL) => boolean) => {
  const parsed = URL.parse(candidate);
  if (parsed === null || parsed.username !== "" || parsed.password !== "") return undefined;
  return accept(parsed) ? parsed.origin : undefined;
};

const httpsOrigin = (candidate: string) =>
  originUnder(candidate, (url) => url.protocol === "https:");

const loopbackOrigin = (candidate: string) =>
  originUnder(
    candidate,
    (url) => url.protocol === "http:" && OFFICIAL_MCP_LOOPBACK_HOSTS.includes(url.hostname),
  );

/** 开发白名单是逗号（或空白）分隔的原始串；空段直接丢弃。 */
const devAllowList = (raw: string | undefined): string[] =>
  (raw ?? "").split(/[\s,]+/u).filter((entry) => entry.length > 0);

const IDENTITY_ORG = "bigmodel-organization";
const IDENTITY_PROJECT = "bigmodel-project";
const IDENTITY_TARGET = "bigmodel-target-type";

/** 组织与项目必须成对出现才算 Team；目标类型只在存在时透出。 */
export const summarizeOfficialMcpIdentityHeaders = (headers: Record<string, string>) => {
  const entries = Object.entries(headers).map(([name, value]) => [canonical(name), value] as const);
  const lookup = new Map(entries);
  const hasOrg = lookup.has(IDENTITY_ORG);
  const hasProject = lookup.has(IDENTITY_PROJECT);
  const summary: Record<string, unknown> = {
    identityHeaderNames: [...lookup.keys()].sort(),
    identityOrganizationPresent: hasOrg,
    identityProjectPresent: hasProject,
    identityTeamPaired: hasOrg === hasProject,
  };
  const target = lookup.get(IDENTITY_TARGET);
  if (target !== undefined) summary.identityTargetType = target;
  return summary;
};

/**
 * 判定顺序就是安全优先级：回环地址只认开发白名单；其余地址必须与线上 API 同源；
 * 线上 origin 缺失或不可解析时一律不信任，避免「配置没读到」被当成放行。
 */
export const isOfficialMcpOriginTrusted = (
  input: IsOfficialMcpOriginTrustedInput,
): OfficialMcpTrustResult => {
  const candidate = input.origin.trim();
  if (candidate.length === 0) return BAD_INPUT;

  const local = loopbackOrigin(candidate);
  if (local !== undefined) {
    const allowed = devAllowList(input.devTrustedOriginsRaw);
    return allowed.some((entry) => loopbackOrigin(entry) === local) ? OK : MISMATCH;
  }

  const apiOrigin = input.knorviaApiOrigin ? httpsOrigin(input.knorviaApiOrigin) : undefined;
  if (apiOrigin === undefined) return UNRESOLVED;

  return httpsOrigin(candidate) === apiOrigin ? OK : MISMATCH;
};

/** registry 只是把「解析 API origin」的时序包起来；解析失败按 unresolved 处理。 */
export const createOfficialMcpTrustedOriginRegistry = (
  options: CreateOfficialMcpTrustedOriginRegistryOptions,
): OfficialMcpTrustedOriginRegistry => ({
  async isTrusted(query) {
    let knorviaApiOrigin: string | undefined;
    try {
      knorviaApiOrigin = await options.resolveKnorviaApiOrigin();
    } catch {
      return UNRESOLVED;
    }
    return isOfficialMcpOriginTrusted({
      devTrustedOriginsRaw: options.devTrustedOriginsRaw,
      origin: query.origin,
      pluginId: query.pluginId,
      knorviaApiOrigin,
    });
  },
});
