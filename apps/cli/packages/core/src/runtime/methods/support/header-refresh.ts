// SPDX-License-Identifier: Apache-2.0
// 模型请求前的运行时请求头刷新：每个真实请求 attempt 发送前都必须刷新鉴权材料（适配器内部
// 重试、工具侧请求、标题/压缩等单独请求都算一次 attempt）。端口缺席或显式拒绝时不开钩子；
// 刷新结果未生效则抛错，绝不复用旧材料。
import { traceContextToLogContext } from "../../deps.js";
import type { TraceContext } from "../../deps.js";

/** 刷新成功日志的文案与事件名（兼容接口取值，逐字）。 */
const REFRESH_LOG_TEXT = {
  event: "model.request.runtime_headers_refreshed",
  message: "Provider runtime headers refreshed before model request attempt",
  module: "core.runtime",
} as const;

/** 未生效时的固定错误文案（逐字）。 */
export const HEADERS_NOT_APPLIED_MESSAGE =
  "Provider runtime headers were not applied before model request attempt.";

/** 端口最小面：策略问询 + 刷新执行。 */
export interface RuntimeHeadersPort {
  shouldRefreshBeforeModelRequest?(query: { modelId: string; providerId: string }): boolean;
  refreshBeforeModelRequest(input: {
    accountAccess?: unknown;
    abortSignal?: AbortSignal;
    modelId: string;
    providerId: string;
    reason: string;
    sessionId: string;
    traceContext: TraceContext;
    turnId: string | undefined;
  }): Promise<{ headersApplied: boolean; requestAuth?: unknown }>;
}

/** 单次 attempt 的刷新入参。 */
export interface RefreshAttemptInput {
  accountAccess?: unknown;
  attempt: number;
  reason?: "model-request";
  abortSignal?: AbortSignal;
}

/** 钩子构造入参。 */
export interface RefreshHookSpec {
  /** 运行时请求头端口（缺席即不开钩子）。 */
  port: RuntimeHeadersPort | undefined;
  /** 路由身份：会话 id。 */
  sessionId: string;
  /** 构造级取消信号（attempt 级优先）。 */
  abortSignal?: AbortSignal;
  /** 模型标识。 */
  model: { modelId: string; providerId: string };
  /** 追踪上下文（含 turnId）。 */
  traceContext: TraceContext;
  /** 成功日志回调。 */
  logRefreshed: (fields: Record<string, unknown>) => void;
}

/** 建刷新钩子：端口缺席或显式返回 false 时为 undefined。 */
export function createHeaderRefreshHook(
  spec: RefreshHookSpec,
):
  | ((attempt: RefreshAttemptInput) => Promise<{ headersApplied: boolean; requestAuth?: unknown }>)
  | undefined {
  const port = spec.port;
  if (!port) return undefined;
  const query = { modelId: String(spec.model.modelId), providerId: String(spec.model.providerId) };
  const optedIn = port.shouldRefreshBeforeModelRequest?.(query) ?? true;
  if (!optedIn) return undefined;

  return async (attempt) => {
    const refreshed = await port.refreshBeforeModelRequest({
      accountAccess: attempt.accountAccess,
      abortSignal: attempt.abortSignal ?? spec.abortSignal,
      modelId: query.modelId,
      providerId: query.providerId,
      reason: attempt.reason ?? "model-request",
      sessionId: spec.sessionId,
      traceContext: spec.traceContext,
      turnId: spec.traceContext.turnId,
    });
    if (!refreshed.headersApplied) throw new Error(HEADERS_NOT_APPLIED_MESSAGE);
    spec.logRefreshed({
      ...traceContextToLogContext(spec.traceContext),
      attempt: attempt.attempt,
      event: REFRESH_LOG_TEXT.event,
      headersApplied: refreshed.headersApplied,
      module: REFRESH_LOG_TEXT.module,
      providerId: query.providerId,
    });
    return refreshed;
  };
}

/** 刷新成功日志文案（逐字对外）。 */
export const REFRESH_LOG_MESSAGE = REFRESH_LOG_TEXT.message;
