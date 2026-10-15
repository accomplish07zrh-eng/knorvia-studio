// SPDX-License-Identifier: Apache-2.0
// attempt 级运行时头刷新：先临时解析模型，钩子在场时刷新鉴权并带 requestAuth 重解析；
// 刷新失败包成 RuntimeHeadersRefreshError，取消优先透传取消原因。

import type { ModelRequestAuth } from "@knorvia/contracts";
import type { AiSdkModelTextRequest, ResolvedAiSdkModel } from "./runner-runtime.js";

export class RuntimeHeadersRefreshError extends Error {
  constructor(origin: unknown) {
    super("Runtime model headers could not be refreshed", { cause: origin });
    this.name = "RuntimeHeadersRefreshError";
  }
}

interface AttemptInput {
  attempt: number; // 本 attempt 的物理序号，随刷新钩子透传
  reason?: "model-request"; // 固定字面量：当前只有模型请求一种刷新来源
  request: AiSdkModelTextRequest; // 逻辑请求（含可选刷新钩子与取消信号）
  resolveModel: (requestAuth?: ModelRequestAuth) => ResolvedAiSdkModel; // 惰性重解析入口
}

export async function resolveModelForAttempt(step: AttemptInput): Promise<ResolvedAiSdkModel> {
  const baseline = step.resolveModel();
  const refresh = step.request.refreshRuntimeHeadersBeforeAttempt;
  if (!refresh) return baseline;
  const signal = step.request.abortSignal;
  if (signal?.aborted) throw signal.reason;
  try {
    const refreshed = await refresh({
      accountAccess: baseline.accountAccess,
      attempt: step.attempt,
      reason: step.reason ?? "model-request",
      abortSignal: signal,
      providerId: baseline.providerId,
      modelId: baseline.modelId,
      traceContext: step.request.traceContext,
    });
    return step.resolveModel(refreshed.requestAuth);
  } catch (cause) {
    if (signal?.aborted) throw signal.reason;
    throw new RuntimeHeadersRefreshError(cause);
  }
}
