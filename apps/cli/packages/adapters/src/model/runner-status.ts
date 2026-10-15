// SPDX-License-Identifier: Apache-2.0
// 状态上下文与事件发布：装配归因上下文（trace/session/turn/requestId）、按对象身份去重地向
// 票据/请求/适配器三级接收端投递事件（失败事件优先 publishFailure），以及排队/准入通知。
// 事件名与文案是协议面，逐字保持。

import type {
  Logger,
  ModelNetworkStatusEvent,
  ModelStatusSink,
  ModelTransportKind,
  ModelRequestSessionType as ModelRequestSessionTypeValue,
  QueryId,
  ResolvedModelApiCallObservation,
  TraceId,
} from "@knorvia/contracts";
import type { AiSdkModelTextRequest, ResolvedAiSdkModel } from "./runner-runtime.js";
import type { ModelStatusContext } from "./support/status-contract.js";
import { sanitizeModelNetworkHeaders } from "./runner-network-headers.js";
import {
  createModelRequestAttributionHeaders,
  resolveModelRequestSessionType,
} from "./runner-attribution.js";

export type { ModelStatusContext } from "./support/status-contract.js";
export {
  createModelRequestAttributionHeaders,
  normalizeModelSessionIdForAttribution,
  resolveModelRequestSessionType,
} from "./runner-attribution.js";

function metadataText(bag: unknown, key: string): string | undefined {
  if (typeof bag !== "object" || bag === null) return undefined;
  const value = (bag as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : undefined;
}

interface ContextAssembly {
  maxAttempts: number; // 尝试上限
  request: AiSdkModelTextRequest; // 逻辑请求
  resolved: ResolvedAiSdkModel; // 解析后的模型
  transport: ModelTransportKind; // 传输形态
}

export function createStatusContext(assembly: ContextAssembly): ModelStatusContext {
  const metadata = assembly.request.metadata;
  const fallbackCall = {
    actorKind: "main",
    operation: "model",
  } as unknown as ResolvedModelApiCallObservation;
  const modelCall = (assembly.request.modelCall ?? fallbackCall) as ResolvedModelApiCallObservation;
  const trace = assembly.request.traceContext;
  const traced = (trace?.traceId ?? metadataText(metadata, "traceId")) as TraceId | undefined;
  const identity = {
    traceId: traced ?? (crypto.randomUUID() as TraceId),
    queryId: (trace?.queryId ?? metadataText(metadata, "queryId")) as QueryId | undefined,
    sessionId: (trace?.sessionId ??
      metadataText(metadata, "sessionId")) as ModelNetworkStatusEvent["sessionId"],
    turnId: (trace?.turnId ??
      metadataText(metadata, "turnId")) as ModelNetworkStatusEvent["turnId"],
    parentSessionId: metadataText(
      metadata,
      "parentSessionId",
    ) as ModelNetworkStatusEvent["parentSessionId"],
  };
  const attribution = {
    toolCallId: metadataText(metadata, "toolCallId"),
    spanId: trace?.spanId,
    parentSpanId: trace?.parentSpanId,
    querySource: metadataText(metadata, "querySource"),
    requestId: metadataText(metadata, "requestId") ?? crypto.randomUUID(),
  };
  const sessionType = resolveModelRequestSessionType(
    assembly.request.modelRequestSessionType,
    modelCall,
  );
  const endpoint = {
    providerId: assembly.resolved.providerId,
    modelId: assembly.resolved.modelId,
    modelRequestSessionType: sessionType,
    baseURL: assembly.resolved.baseURL,
    providerKind: assembly.resolved.providerKind,
    transport: assembly.transport,
    maxAttempts: assembly.maxAttempts,
  };
  const streamRecovery = (
    assembly.request as { streamRecovery?: ModelNetworkStatusEvent["streamRecovery"] }
  ).streamRecovery;
  return { ...identity, ...attribution, ...endpoint, streamRecovery, modelCall };
}

export function createAttemptStatusContext(
  base: ModelStatusContext,
  round: number,
): ModelStatusContext {
  if (round <= 1) return base;
  return { ...base, requestId: crypto.randomUUID() }; // 后续 attempt 换新 requestId
}

type DeliveryOptions = {
  admissionTicket?: ModelStatusSink; // 票据接收端
  failureError?: unknown; // 失败原始错误
  logger?: Logger; // 诊断日志口
  requestStatusSink?: ModelStatusSink; // 请求级接收端
  statusSink?: ModelStatusSink; // 适配器级接收端
};

async function deliver(
  target: ModelStatusSink | undefined,
  payload: ModelNetworkStatusEvent,
  journal?: Logger,
  failureError?: unknown,
  privileged = false,
): Promise<void> {
  if (!target) return;
  try {
    // 失败事件给适配器级接收端走 publishFailure（若实现）；其余一律普通 publish
    if (
      privileged &&
      payload.type === "model_request_failed" &&
      failureError !== undefined &&
      "publishFailure" in target &&
      typeof target.publishFailure === "function"
    ) {
      await target.publishFailure(payload, failureError);
    } else {
      await target.publish(payload);
    }
  } catch (failure) {
    journal?.warn("Model status sink rejected an event", {
      type: payload.type, // 被拒事件类型
      error: failure instanceof Error ? failure.message : String(failure),
    });
  }
}

export async function publishModelStatus(
  payload: ModelNetworkStatusEvent,
  delivery: DeliveryOptions,
): Promise<void> {
  const redacted = {
    ...payload,
    requestHeaders: sanitizeModelNetworkHeaders(payload.requestHeaders),
    responseHeaders: sanitizeModelNetworkHeaders(payload.responseHeaders),
  } as ModelNetworkStatusEvent; // 头脱敏后投递
  const targets = [
    delivery.admissionTicket,
    delivery.requestStatusSink,
    delivery.statusSink,
  ].filter(
    (target, index, all): target is ModelStatusSink =>
      target !== undefined && all.indexOf(target) === index,
  );
  await Promise.all(
    targets.map((target) =>
      deliver(
        target,
        redacted,
        delivery.logger,
        delivery.failureError,
        target === delivery.statusSink,
      ),
    ),
  );
}

export function admissionWaitPublishers(
  base: ModelStatusContext,
  round: number,
  delivery: DeliveryOptions,
): { onQueued: () => Promise<void>; onAdmitted: (queuedMs: number) => Promise<void> } {
  const stamp = new Date().toISOString();
  const emit = (type: "model_request_queued" | "model_request_admitted", queuedMs?: number) => {
    const extra = queuedMs === undefined ? {} : { queuedMs };
    const event = {
      ...base,
      attempt: round,
      timestamp: stamp,
      type,
      ...extra,
    } as ModelNetworkStatusEvent;
    return publishModelStatus(event, { ...delivery, admissionTicket: undefined }); // 排队/准入不投票据接收端
  };
  return {
    onQueued: () => emit("model_request_queued"),
    onAdmitted: (queuedMs) => emit("model_request_admitted", queuedMs),
  };
}

export async function publishModelTelemetryMilestone(
  milestone: Extract<
    ModelNetworkStatusEvent,
    { type: "model_first_provider_event" | "model_first_content" | "model_first_text" }
  >,
  delivery: { logger?: Logger; statusSink?: ModelStatusSink },
): Promise<void> {
  await deliver(delivery.statusSink, milestone, delivery.logger);
}

export function modelStatusContextToLogContext(
  context: ModelStatusContext | ModelNetworkStatusEvent,
  attempt: number,
): Record<string, unknown> {
  return {
    traceId: context.traceId, // 追踪 id
    queryId: context.queryId, // 查询 id
    sessionId: context.sessionId, // 会话 id
    turnId: context.turnId, // 回合 id
    requestId: context.requestId, // 物理请求 id
    providerId: context.providerId, // provider 身份
    modelId: context.modelId, // 模型身份
    providerKind: context.providerKind, // SDK 种类
    transport: context.transport, // 传输形态
    attempt, // 物理序号
    maxAttempts: context.maxAttempts, // 尝试上限
  };
}
