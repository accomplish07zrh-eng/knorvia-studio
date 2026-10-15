// SPDX-License-Identifier: Apache-2.0
// 模型请求前的运行时请求头刷新入口：钩子构造在 support/header-refresh.ts，这里接线运行时端口。
import type { ModelRequestAuth } from "@knorvia/contracts";
import type { KnorviaProviderAccountAccess } from "@knorvia/shared";
import type { Model, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { createHeaderRefreshHook, type RuntimeHeadersPort } from "./support/header-refresh.js";

/** attempt 级刷新函数（缺钩子时为 undefined）。 */
type RefreshRuntimeHeaders = (attempt: {
  accountAccess?: KnorviaProviderAccountAccess;
  attempt: number;
  reason?: "model-request";
  abortSignal?: AbortSignal;
}) => Promise<{
  headersApplied: boolean;
  requestAuth?: ModelRequestAuth;
}> /* attempt 级刷新函数的返回面 */;

export function createRefreshRuntimeHeadersBeforeModelAttempt(
  runtime: AgentRuntimeInternal,
  input: {
    abortSignal?: AbortSignal;
    model: Model;
    traceContext: TraceContext;
  },
): RefreshRuntimeHeaders | undefined {
  return createHeaderRefreshHook({
    port: runtime.providerRuntimeHeadersPort as RuntimeHeadersPort | undefined,
    sessionId: runtime.sessionId,
    abortSignal: input.abortSignal,
    model: { modelId: String(input.model.modelId), providerId: String(input.model.providerId) },
    traceContext: input.traceContext,
    logRefreshed: (fields) => {
      runtime.logger?.debug(
        "Provider runtime headers refreshed before model request attempt",
        fields,
      );
    },
  }) as RefreshRuntimeHeaders | undefined;
}
