// SPDX-License-Identifier: Apache-2.0
// 模型调用的描述符构造：把状态事件折成 Writer 需要的两个入参对象。
//
// 单独成文件是因为它们是「事件 → 契约对象」的纯映射，不含状态机；录制器本身只关心
// 什么时候调用它们。字段名与取值规则逐条落实在下面的构造器里。
import type { ModelNetworkStatusEvent } from "@knorvia/contracts/model";
import { ModelTransportKind } from "@knorvia/contracts/model";
import type {
  ModelApiOperationKind,
  ModelAttemptTraceStart,
  ModelCallTraceStart,
  ModelReasoningObservation,
  ResolvedModelTelemetryDescriptor,
} from "@knorvia/contracts/telemetry";
import type { ProviderEndpointIdentityCache } from "./provider-endpoint.js";

/** 未声明 reasoning 事实时的占位：五个维度统一取 unknown。 */
export const UNKNOWN_REASONING: ModelReasoningObservation = {
  capability: "unknown",
  effectiveControl: "unknown",
  effectiveState: "unknown",
  requestedControl: "unknown",
  requestedState: "unknown",
};

/** 路由片段 → API operation。匹配顺序固定：先具体路径，再看 Gemini 的动词形态。 */
const ROUTE_OPERATIONS: ReadonlyArray<readonly [string, ModelApiOperationKind]> = [
  ["/chat/completions", "chat_completions"],
  ["/responses", "responses"],
  ["/messages", "messages"],
  [":generatecontent", "generate_content"],
  [":streamgeneratecontent", "generate_content"],
];

/** 路由 → API operation；都没命中时是 unknown。 */
export function operationFromRoute(route: string | undefined): ModelApiOperationKind {
  const needles = route?.toLowerCase() ?? "";
  const hit = ROUTE_OPERATIONS.find(([needle]) => needles.includes(needle));
  return hit === undefined ? "unknown" : hit[1];
}

/** 事件 → 端点描述符：provider 身份来自缓存，reasoning 缺失时用占位。 */
export function targetOf(
  event: ModelNetworkStatusEvent,
  endpoints: ProviderEndpointIdentityCache,
): ResolvedModelTelemetryDescriptor {
  const endpoint = endpoints.resolve(event.providerKind, event.baseURL);
  const target: ResolvedModelTelemetryDescriptor = {
    providerId: String(event.providerId),
    providerKind: event.providerKind?.trim() || "unknown",
    reasoning: event.modelCall?.reasoning ?? UNKNOWN_REASONING,
    requestedModel: String(event.modelId),
  };
  if (endpoint !== undefined) {
    target.providerOrigin = endpoint.origin;
    target.providerRoute = endpoint.route;
  }
  return target;
}

/** 是否流式：非 http 传输都按流式处理。 */
export function isStreaming(event: ModelNetworkStatusEvent): boolean {
  return event.transport !== ModelTransportKind.Http;
}

/**
 * started 事件 → 逻辑调用入参。
 * 只有「非 initial 且带前驱」的调用才走续接分支；其余一律按 initial 处理。
 */
export function callStartOf(
  event: Extract<ModelNetworkStatusEvent, { type: "model_request_started" }>,
  target: ResolvedModelTelemetryDescriptor,
  streaming: boolean,
): ModelCallTraceStart {
  const modelCall = event.modelCall!;
  const cause = modelCall.callCause;
  const previous = modelCall.previousLogicalCallId;
  const continued = cause !== undefined && cause !== "initial" && previous !== undefined;
  const start = { requested: target, streaming } as const;
  const identity = {
    logicalCallId: modelCall.logicalCallId,
    operation: modelCall.operation,
  };
  return continued
    ? { ...start, ...identity, callCause: cause, previousLogicalCallId: previous }
    : { ...start, ...identity, callCause: "initial" };
}

/** 一次物理尝试的公共字段。 */
export interface AttemptFacts {
  apiOperation: ModelApiOperationKind;
  attemptNumber: number;
  maxAttempts: number;
  previousRequestId?: string;
  requestId: string;
  retryDelayMs?: number;
  target: ResolvedModelTelemetryDescriptor;
  transport: ModelAttemptTraceStart["transport"];
}

/** 公共字段 + 是否有前驱 → 完整的 attempt 入参。 */
export function attemptStartOf(facts: AttemptFacts): ModelAttemptTraceStart {
  const start = {
    apiOperation: facts.apiOperation,
    attemptNumber: facts.attemptNumber,
    maxAttempts: facts.maxAttempts,
    requestId: facts.requestId,
    target: facts.target,
    transport: facts.transport,
  } as const;
  if (facts.previousRequestId === undefined) return { ...start, attemptCause: "initial" };
  const retried: ModelAttemptTraceStart = {
    ...start,
    attemptCause: "retry",
    previousRequestId: facts.previousRequestId,
  };
  if (facts.retryDelayMs !== undefined) retried.retryDelayMs = facts.retryDelayMs;
  return retried;
}
