// SPDX-License-Identifier: Apache-2.0
// 模型侧错误体系：错误源三值、本地 provider 配置错误上下文、统一适配错误类。
// 类名、错误码与 context 键是跨模块识别面，逐字保持。

import { ModelFailureReason, type ModelErrorCode, type ModelId } from "@knorvia/contracts";

const ERROR_NAME = "AiSdkModelAdapterError";

export const ModelErrorSource = {
  Network: "network", // 传输层失败（网络/代理/TLS）
  Provider: "provider", // provider 侧业务失败
  Runtime: "runtime", // 适配器运行期失败
} as const;
export type ModelErrorSource = (typeof ModelErrorSource)[keyof typeof ModelErrorSource];

export type LocalProviderConfigurationErrorContext = Record<string, unknown> & {
  envKey?: string; // 缺失凭据对应的环境变量键
  modelId?: ModelId; // 目标模型
  providerId: string; // 目标 provider（必填）
  reason: typeof ModelFailureReason.ProviderNotConfigured; // 固定归因
  retryable: false; // 配置缺失不可重试
  source: typeof ModelErrorSource.Runtime; // 固定来源
};

export function createLocalProviderConfigurationErrorContext(
  base: Pick<LocalProviderConfigurationErrorContext, "envKey" | "modelId" | "providerId">,
): LocalProviderConfigurationErrorContext {
  const reason = ModelFailureReason.ProviderNotConfigured;
  const retryable = false as const;
  const source = ModelErrorSource.Runtime;
  return { ...base, reason, retryable, source };
}

export interface AiSdkModelAdapterErrorOptions {
  cause?: unknown; // 原始异常（保留调用链）
  context?: Record<string, unknown>; // 归因与诊断上下文
}

export class AiSdkModelAdapterError extends Error {
  readonly code: ModelErrorCode; // 对外错误码（协议面）
  override readonly cause?: unknown; // 原始异常
  readonly context?: Record<string, unknown>; // 归因与诊断上下文（enrichContext 补缺）

  constructor(
    kind: ModelErrorCode,
    description: string,
    details: AiSdkModelAdapterErrorOptions = {},
  ) {
    const chained = details.cause === undefined ? undefined : { cause: details.cause };
    super(description, chained);
    this.name = ERROR_NAME;
    this.code = kind;
    this.cause = details.cause;
    this.context = details.context;
  }

  enrichContext(additions: Record<string, unknown>): this {
    const sink = (this.context ?? {}) as Record<string, unknown>;
    if (this.context === undefined) {
      Object.defineProperty(this, "context", { value: sink, enumerable: true });
    }
    for (const key of Object.keys(additions)) {
      if (sink[key] === undefined) sink[key] = additions[key];
    }
    return this; // 链式补缺：已有键不覆盖
  }
}
