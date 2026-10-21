// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-credentials：Knorvia 供应商配置 → `dsh-llm-pi-ai` 的 provider 表（B3/B4）。
//
// 事实来源：`@deepseek-ai/dsh-llm-pi-ai` 的公开类型与 `PROTOCOLS` 表（实测其 `lib/index.js`）：
//   PROTOCOLS = {
//     "openai-completions": openAICompletionsApi,
//     "openai-responses": openAIResponsesApi,
//     "anthropic-messages": anthropicMessagesApi,
//   }
// 三个字面量**不是本包自造**，就是 `supportedProtocols()` 的返回值。
//
// 本模块是纯函数、无 I/O、无状态——因此合同测试可直接断言它（B3/B4）。

import { normalizeProviderIdForRef } from "./reference.js";

/** 三种协议格式（与 DSH `PROTOCOLS` 表的键逐字一致）。 */
export const KNORVIA_PROVIDER_PROTOCOLS = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
] as const;

export type KnorviaProviderProtocol = (typeof KNORVIA_PROVIDER_PROTOCOLS)[number];

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

export interface KnorviaProviderModel {
  readonly modelId: string;
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
  readonly reasoning?: boolean;
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

/**
 * 产出可直接交给 `dsh-llm-pi-ai` 的 `Config.providers`。
 *
 * 几条冻结规则（B3）：
 *   1. **路由 key = providerId**（`providers` dict key IS the route）；
 *   2. `baseURL` **原样透传**（不做尾斜杠归一——归一化会改变用户配置语义）；
 *   3. `apiKeyEnv` 只写**引用名**，绝不写真实 key；
 *   4. `staticHeaders` 存在时才写 `headers`，且写入前自查 header 名合法；
 *   5. 非法条目**跳过并告警**，不整批失败（一条坏配置不该让全部供应商不可用）。
 */
export function buildPiAiProviderTable(
  entries: readonly KnorviaProviderEntry[],
  options: {
    readonly credentialRefPrefix?: string;
    readonly logger?: {
      warn(message: string, fields?: Record<string, unknown>): void;
    };
  } = {},
): Record<string, KnorviaPiAiProviderProfile> {
  // 缺省前缀与 `DEFAULT_CREDENTIAL_REF_PREFIX` 一致；此处不 import 那个常量是为了
  // 让 provider-table 保持零依赖（纯函数便于测试）。
  const credentialRefPrefix = options.credentialRefPrefix ?? "KNORVIA_";
  const table: Record<string, KnorviaPiAiProviderProfile> = {};
  for (const entry of entries) {
    const providerId = entry.providerId.trim();
    if (providerId === "") {
      options.logger?.warn("kernel.credentials.provider.skipped", { reason: "empty providerId" });
      continue;
    }
    if (!isKnownProtocol(entry.protocol)) {
      // 未知协议跳过：写入一个 DSH 不认识的 `api` 会让整份配置校验失败（B4）。
      options.logger?.warn("kernel.credentials.provider.skipped", {
        providerId,
        reason: "unknown protocol",
        protocol: entry.protocol,
      });
      continue;
    }
    const headers = entry.staticHeaders;
    if (headers !== undefined && !areValidHeaders(headers)) {
      options.logger?.warn("kernel.credentials.provider.skipped", {
        providerId,
        // 只记 header 名，不记值（S2）。
        reason: "invalid static header",
        names: Object.keys(headers),
      });
      continue;
    }

    table[providerId] = {
      api: entry.protocol,
      // 原样透传：不做尾斜杠归一。
      baseURL: entry.baseURL,
      ...(entry.displayName !== undefined ? { displayName: entry.displayName } : {}),
      // 只写引用名（`KNORVIA_<normalized>`），值由 resolve() 按请求从 Host 取。
      apiKeyEnv: `${credentialRefPrefix}${normalizeProviderIdForRef(providerId)}`,
      ...(headers !== undefined ? { headers: { ...headers } } : {}),
      models: entry.models.map((model) => ({
        id: model.modelId,
        ...(model.contextWindow !== undefined ? { contextWindow: model.contextWindow } : {}),
        ...(model.maxOutputTokens !== undefined ? { maxOutputTokens: model.maxOutputTokens } : {}),
        ...(model.reasoning !== undefined ? { reasoning: model.reasoning } : {}),
      })),
    };
  }
  return table;
}

function isKnownProtocol(value: string): value is KnorviaProviderProtocol {
  return (KNORVIA_PROVIDER_PROTOCOLS as readonly string[]).includes(value);
}

/**
 * header 名与值是否能被 Fetch 接受。
 *
 * DSH 自己在配置期用 `new Headers([[name, value]])` 校验（`assertValidHeaders`）；
 * 本包在写入前先自查，避免把一个非法 header 带进配置——那样整份 provider 表会被拒。
 */
function areValidHeaders(headers: Readonly<Record<string, string>>): boolean {
  try {
    for (const [name, value] of Object.entries(headers)) {
      // eslint-disable-next-line no-new -- 构造即校验，不需要实例。
      new Headers([[name, value]]);
    }
    return true;
  } catch {
    return false;
  }
}
