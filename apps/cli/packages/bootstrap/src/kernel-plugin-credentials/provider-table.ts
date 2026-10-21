// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-credentials：Knorvia 供应商配置 → `dsh-llm-pi-ai` 的 provider 表（B3/B4）。
//
// 三种协议字面量**不是本包自造**：它们是 `@deepseek-ai/dsh-llm-pi-ai` 的 `PROTOCOLS`
// 表的键（实测其 `lib/index.js`），也就是 `supportedProtocols()` 的返回值。
// 合同测试 B4 直接读那个函数的返回值比对，DSH 升级改名会立刻红。
//
// 本模块是纯函数、无 I/O、无状态 —— 因此合同测试可直接断言它（B3/B4）。

import { normalizeProviderIdForRef } from "./reference.js";

/** 三种协议格式（与 DSH `PROTOCOLS` 表的键逐字一致）。 */
export const KNORVIA_PROVIDER_PROTOCOLS = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
] as const;

export type KnorviaProviderProtocol = (typeof KNORVIA_PROVIDER_PROTOCOLS)[number];

/** Knorvia 侧一个模型的配置。 */
export interface KnorviaProviderModel {
  readonly modelId: string;
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
  readonly reasoning?: boolean;
}

/** Knorvia 侧一个供应商的配置（来源：Host 下发的供应商配置）。 */
export interface KnorviaProviderEntry {
  readonly providerId: string;
  readonly protocol: KnorviaProviderProtocol;
  readonly baseURL: string;
  readonly displayName?: string;
  readonly models: readonly KnorviaProviderModel[];
  /** 配置级静态 header（来自 Knorvia 供应商配置，**不含凭据**）。 */
  readonly staticHeaders?: Readonly<Record<string, string>>;
}

/** `PiAiProviderProfile` 的最小投影（只写本包会产出的字段）。 */
export interface KnorviaPiAiProviderProfile {
  readonly api: KnorviaProviderProtocol;
  readonly baseURL: string;
  readonly displayName?: string;
  readonly apiKeyEnv: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly models: readonly {
    readonly id: string;
    readonly contextWindow?: number;
    readonly maxOutputTokens?: number;
    readonly reasoning?: boolean;
  }[];
}

/** 构建表时的可选参数。 */
export interface ProviderTableOptions {
  readonly credentialRefPrefix?: string;
  readonly logger?: {
    warn(message: string, fields?: Record<string, unknown>): void;
  };
}

/** 缺省引用名前缀；与 `DEFAULT_CREDENTIAL_REF_PREFIX` 一致。 */
const DEFAULT_REF_PREFIX = "KNORVIA_";

/**
 * 一条配置为什么被拒。
 *
 * 做成判别式而不是逐处 `continue`：拒绝原因是**可枚举的事实**，
 * 调用方与测试可以按 `reason` 断言，不必从日志文案里猜。
 */
type RejectionReason = "empty-provider-id" | "unknown-protocol" | "invalid-static-header";

/** 校验结论：要么可以建表，要么带着原因被跳过。 */
type Admission =
  | { readonly admitted: true; readonly providerId: string }
  | {
      readonly admitted: false;
      readonly reason: RejectionReason;
      readonly fields: Record<string, unknown>;
    };

/**
 * 判断一条协议字面量是否被 DSH 认识。
 *
 * @param value - 待判定的协议名。
 * @returns 是否为已知协议。
 */
function isKnownProtocol(value: string): value is KnorviaProviderProtocol {
  return (KNORVIA_PROVIDER_PROTOCOLS as readonly string[]).includes(value);
}

/**
 * header 名与值是否能被 Fetch 接受。
 *
 * DSH 自己在配置期用 `new Headers([[name, value]])` 校验（`assertValidHeaders`）；
 * 本包在写入前先自查，避免把一个非法 header 带进配置 —— 那样整份 provider 表会被拒。
 *
 * @param headers - 待校验的 header 集合。
 * @returns 是否全部合法。
 */
function areValidHeaders(headers: Readonly<Record<string, string>>): boolean {
  try {
    for (const [name, value] of Object.entries(headers)) {
      // 构造即校验，不需要实例。
      // eslint-disable-next-line no-new -- 只为触发 Headers 的校验。
      new Headers([[name, value]]);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 判定一条配置能否进入 provider 表。
 *
 * 三条拒绝条件各自带可断言的原因；**一条坏配置只跳过它自己**，
 * 不让整批供应商不可用（B3 第 5 条）。
 *
 * @param entry - 待判定的供应商配置。
 * @returns 准入结论。
 */
function admit(entry: KnorviaProviderEntry): Admission {
  const providerId = entry.providerId.trim();
  if (providerId === "") {
    return { admitted: false, reason: "empty-provider-id", fields: {} };
  }
  if (!isKnownProtocol(entry.protocol)) {
    // 写入一个 DSH 不认识的 `api` 会让整份配置校验失败（B4）。
    return {
      admitted: false,
      reason: "unknown-protocol",
      fields: { providerId, protocol: entry.protocol },
    };
  }
  const headers = entry.staticHeaders;
  if (headers !== undefined && !areValidHeaders(headers)) {
    // 只记 header 名，不记值（S2）。
    return {
      admitted: false,
      reason: "invalid-static-header",
      fields: { providerId, names: Object.keys(headers) },
    };
  }
  return { admitted: true, providerId };
}

/**
 * 把一条已准入的配置投影成 DSH 的 profile。
 *
 * 几条冻结规则（B3）：
 *   - **路由 key = providerId**（`providers` dict key IS the route，由调用方写入）；
 *   - `baseURL` **原样透传**：不做尾斜杠归一，归一化会改变用户配置语义；
 *   - `apiKeyEnv` 只写**引用名**，绝不写真实 key；
 *   - `staticHeaders` 存在时才写 `headers`。
 *
 * @param entry - 已准入的配置。
 * @param providerId - 已 trim 的 providerId。
 * @param credentialRefPrefix - 引用名前缀。
 * @returns DSH profile。
 */
function toProfile(
  entry: KnorviaProviderEntry,
  providerId: string,
  credentialRefPrefix: string,
): KnorviaPiAiProviderProfile {
  const headers = entry.staticHeaders;
  const models = entry.models.map((model) => ({
    id: model.modelId,
    ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
    ...(model.maxOutputTokens === undefined ? {} : { maxOutputTokens: model.maxOutputTokens }),
    ...(model.reasoning === undefined ? {} : { reasoning: model.reasoning }),
  }));
  return {
    api: entry.protocol,
    baseURL: entry.baseURL,
    ...(entry.displayName === undefined ? {} : { displayName: entry.displayName }),
    // 只写引用名（`KNORVIA_<normalized>`），值由 resolve() 按请求从 Host 取。
    apiKeyEnv: `${credentialRefPrefix}${normalizeProviderIdForRef(providerId)}`,
    ...(headers === undefined ? {} : { headers: { ...headers } }),
    models,
  };
}

/**
 * 产出可直接交给 `dsh-llm-pi-ai` 的 `Config.providers`。
 *
 * @param entries - Knorvia 供应商配置清单（空数组合法）。
 * @param options - 前缀与日志出口。
 * @returns 以 providerId 为路由 key 的 provider 表。
 */
export function buildPiAiProviderTable(
  entries: readonly KnorviaProviderEntry[],
  options: ProviderTableOptions = {},
): Record<string, KnorviaPiAiProviderProfile> {
  // 此处不 import `DEFAULT_CREDENTIAL_REF_PREFIX`：让本模块保持零依赖，
  // 纯函数才好被合同测试直接断言。
  const credentialRefPrefix = options.credentialRefPrefix ?? DEFAULT_REF_PREFIX;
  const table: Record<string, KnorviaPiAiProviderProfile> = {};
  for (const entry of entries) {
    const verdict = admit(entry);
    if (!verdict.admitted) {
      options.logger?.warn("kernel.credentials.provider.skipped", {
        reason: verdict.reason,
        ...verdict.fields,
      });
      continue;
    }
    table[verdict.providerId] = toProfile(entry, verdict.providerId, credentialRefPrefix);
  }
  return table;
}
