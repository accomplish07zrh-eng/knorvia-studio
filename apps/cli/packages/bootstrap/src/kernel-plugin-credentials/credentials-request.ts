// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-credentials：按请求向 Host 取凭据（B5/B6 的实现核心）。
//
// 契约依据：specs/contracts/kernel-plugin-credentials/{interface,behavior}.md §3.3 / B5 / B6 / L5
//
// 安全要点：
//   1. **应答必须运行时校验**（L5 / #124 口径：不信任类型签名）；
//   2. **每次调用都发一次**（D4 / B5：不缓存）；
//   3. **拿不到必须失败明确**（B6），不返回 undefined 让调用方猜。

import {
  knorviaProviderRuntimeHeadersRequestParamsSchema,
  knorviaProviderRuntimeHeadersResponseSchema,
} from "@knorvia/shared";
import type { LegacyHostChannel } from "../kernel-bridge/legacy/types.js";

/** 反向请求方法名（既有协议面，不改）。 */
const PROVIDER_RUNTIME_HEADERS_METHOD = "interaction/requestProviderRuntimeHeaders";

/** 单次 `resolve()` 的反向请求超时默认值（既有 `provider-runtime-headers` 总时限）。 */
export const DEFAULT_CREDENTIAL_TIMEOUT_MS = 180_000;

/** 凭据引用名的默认前缀（引用名规则，**不是**环境变量）。 */
export const DEFAULT_CREDENTIAL_REF_PREFIX = "KNORVIA_";

/** `resolve()` 返回值的 source 标签（如实标明来源不是本地环境）。 */
export const KNORVIA_HOST_SOURCE = "knorvia-host";

/** 一次取到的凭据材料（Host 应答的投影）。 */
export interface KnorviaCredentialSnapshot {
  readonly apiKey?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

/** `requestProviderCredentials` 的入参（interface.md §3.3）。 */
export interface RequestProviderCredentialsInput {
  /** 通道；`undefined` 表示桥未 attach（B6 ①）。 */
  readonly channel: LegacyHostChannel | undefined;
  readonly sessionId: string;
  readonly workspace: { readonly workspacePath: string; readonly workspaceKey: string };
  readonly providerId: string;
  readonly modelSelection: { readonly providerId: string; readonly modelId: string };
  readonly timeoutMs: number;
  readonly trace?: Readonly<Record<string, unknown>>;
}

/**
 * 按请求向 Host 取一次凭据。
 *
 * **不缓存、不合并**：每次调用都真实往返一次（D4 / 基类契约「resolution is per call」）。
 *
 * @throws 通道缺席 / 反向请求失败 / 应答非法 / Host 拒绝提供凭据——一律明确抛出（B6）。
 */
export async function requestProviderCredentials(
  input: RequestProviderCredentialsInput,
): Promise<KnorviaCredentialSnapshot> {
  const { channel, providerId } = input;
  if (channel === undefined) {
    // B6 ①：桥未 attach，不可能反问 Host。明确失败，不返回空材料。
    throw new Error(
      `No host channel is available for provider "${providerId}"; the kernel bridge is not attached`,
    );
  }

  const params = knorviaProviderRuntimeHeadersRequestParamsSchema.parse({
    requestId: nextRequestId(),
    sessionId: input.sessionId,
    workspace: input.workspace,
    modelSelection: input.modelSelection,
    providerId,
    reason: "model-request",
  });

  // B5：每次调用都真实往返（改了凭据下一次操作就该生效）。
  const raw: unknown = await channel.request(
    PROVIDER_RUNTIME_HEADERS_METHOD,
    params,
    // L5 / S6：**应答必须运行时校验**。传入只做 parse 的 schema 适配器，
    // 不使用 TypeScript 类型断言——类型签名不构成运行时保证。
    { parse: (value: unknown) => knorviaProviderRuntimeHeadersResponseSchema.parse(value) },
    { timeoutMs: input.timeoutMs },
  );

  // 上面的 parse 已校验；此处再收窄一次是防御性的（不是形式主义）：
  // 若将来有人把 parse 换成宽松实现，这层仍能挡住形状错误。
  const parsed = knorviaProviderRuntimeHeadersResponseSchema.parse(raw);

  if (!parsed.headersApplied) {
    // B6 / D2：Host 明确拒绝提供凭据 → 明确失败。
    throw new Error(
      `The host refused to provide credentials for provider "${providerId}"` +
        (parsed.errorMessage === undefined ? "" : `: ${parsed.errorMessage}`),
    );
  }

  const auth = parsed.requestAuth;
  return {
    ...(auth.apiKey !== undefined ? { apiKey: auth.apiKey } : {}),
    ...(auth.headers !== undefined ? { headers: { ...auth.headers } } : {}),
  };
}

/**
 * 反向请求 id 的单调计数。
 *
 * 与桥内部的 `server-<n>` 空间分离：那是**桥**为它自己发出的反向请求分配的 id；
 * 这里是**本包**标识自己这一次请求用的（Host 侧按 requestId 关联取消与重发现）。
 */
let requestCounter = 0;

function nextRequestId(): string {
  requestCounter += 1;
  return `knorvia-credentials-${requestCounter}`;
}
