// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
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
import { sanitizeModelNetworkHeaders } from "./runner-network-headers.js";
import {
  createModelRequestAttributionHeaders,
  resolveModelRequestSessionType,
} from "./runner-attribution.js";
export {
  createModelRequestAttributionHeaders,
  normalizeModelSessionIdForAttribution,
  resolveModelRequestSessionType,
} from "./runner-attribution.js";

export interface ModelStatusContext {
  traceId: TraceId;
  queryId?: QueryId;
  sessionId?: ModelNetworkStatusEvent["sessionId"];
  turnId?: ModelNetworkStatusEvent["turnId"];
  parentSessionId?: ModelNetworkStatusEvent["parentSessionId"];
  toolCallId?: string;
  spanId?: string;
  parentSpanId?: string;
  querySource?: string;
  requestId: string;
  providerId: ResolvedAiSdkModel["providerId"];
  modelId: ResolvedAiSdkModel["modelId"];
  modelRequestSessionType: ModelRequestSessionTypeValue;
  baseURL?: string;
  providerKind?: string;
  transport: ModelTransportKind;
  maxAttempts: number;
  streamRecovery?: ModelNetworkStatusEvent["streamRecovery"];
  modelCall: ResolvedModelApiCallObservation;
}
function metadataString(metadata: unknown, key: string): string | undefined {
  if (typeof metadata !== "object" || metadata === null) return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : undefined;
}
export function createStatusContext(input: {
  maxAttempts: number;
  request: AiSdkModelTextRequest;
  resolved: ResolvedAiSdkModel;
  transport: ModelTransportKind;
}): ModelStatusContext {
  const metadata = input.request.metadata;
  const modelCall = (input.request.modelCall ?? {
    actorKind: "main",
    operation: "model",
  }) as ResolvedModelApiCallObservation;
  return {
    traceId: (input.request.traceContext?.traceId ??
      metadataString(metadata, "traceId") ??
      crypto.randomUUID()) as TraceId,
    queryId: (input.request.traceContext?.queryId ?? metadataString(metadata, "queryId")) as
      | QueryId
      | undefined,
    sessionId: (input.request.traceContext?.sessionId ??
      metadataString(metadata, "sessionId")) as ModelNetworkStatusEvent["sessionId"],
    turnId: (input.request.traceContext?.turnId ??
      metadataString(metadata, "turnId")) as ModelNetworkStatusEvent["turnId"],
    parentSessionId: metadataString(
      metadata,
      "parentSessionId",
    ) as ModelNetworkStatusEvent["parentSessionId"],
    toolCallId: metadataString(metadata, "toolCallId"),
    spanId: input.request.traceContext?.spanId,
    parentSpanId: input.request.traceContext?.parentSpanId,
    querySource: metadataString(metadata, "querySource"),
    requestId: metadataString(metadata, "requestId") ?? crypto.randomUUID(),
    providerId: input.resolved.providerId,
    modelId: input.resolved.modelId,
    modelRequestSessionType: resolveModelRequestSessionType(
      input.request.modelRequestSessionType,
      modelCall,
    ),
    baseURL: input.resolved.baseURL,
    providerKind: input.resolved.providerKind,
    transport: input.transport,
    maxAttempts: input.maxAttempts,
    streamRecovery: (
      input.request as { streamRecovery?: ModelNetworkStatusEvent["streamRecovery"] }
    ).streamRecovery,
    modelCall,
  };
}
export function createAttemptStatusContext(
  context: ModelStatusContext,
  attempt: number,
): ModelStatusContext {
  return attempt <= 1 ? context : { ...context, requestId: crypto.randomUUID() };
}
type PublishOptions = {
  admissionTicket?: ModelStatusSink;
  failureError?: unknown;
  logger?: Logger;
  requestStatusSink?: ModelStatusSink;
  statusSink?: ModelStatusSink;
};
async function safePublish(
  sink: ModelStatusSink | undefined,
  event: ModelNetworkStatusEvent,
  logger?: Logger,
  failureError?: unknown,
  allowFailure = false,
): Promise<void> {
  if (!sink) return;
  try {
    if (
      allowFailure &&
      event.type === "model_request_failed" &&
      failureError !== undefined &&
      "publishFailure" in sink &&
      typeof sink.publishFailure === "function"
    )
      await sink.publishFailure(event, failureError);
    else await sink.publish(event);
  } catch (error) {
    logger?.warn("Model status sink rejected an event", {
      type: event.type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
export async function publishModelStatus(
  event: ModelNetworkStatusEvent,
  options: PublishOptions,
): Promise<void> {
  const sanitized = {
    ...event,
    requestHeaders: sanitizeModelNetworkHeaders(event.requestHeaders),
    responseHeaders: sanitizeModelNetworkHeaders(event.responseHeaders),
  } as ModelNetworkStatusEvent;
  const sinks: ModelStatusSink[] = [];
  if (options.admissionTicket) sinks.push(options.admissionTicket);
  if (options.requestStatusSink) sinks.push(options.requestStatusSink);
  if (options.statusSink && !sinks.includes(options.statusSink)) sinks.push(options.statusSink);
  await Promise.all(
    sinks.map((sink) =>
      safePublish(
        sink,
        sanitized,
        options.logger,
        options.failureError,
        sink === options.statusSink,
      ),
    ),
  );
}
export function admissionWaitPublishers(
  context: ModelStatusContext,
  attempt: number,
  options: PublishOptions,
): { onQueued: () => Promise<void>; onAdmitted: (queuedMs: number) => Promise<void> } {
  const base = { ...context, attempt, timestamp: new Date().toISOString() };
  return {
    onQueued: () =>
      publishModelStatus({ ...base, type: "model_request_queued" } as ModelNetworkStatusEvent, {
        ...options,
        admissionTicket: undefined,
      }),
    onAdmitted: (queuedMs) =>
      publishModelStatus(
        { ...base, type: "model_request_admitted", queuedMs } as ModelNetworkStatusEvent,
        { ...options, admissionTicket: undefined },
      ),
  };
}
export async function publishModelTelemetryMilestone(
  event: Extract<
    ModelNetworkStatusEvent,
    { type: "model_first_provider_event" | "model_first_content" | "model_first_text" }
  >,
  options: { logger?: Logger; statusSink?: ModelStatusSink },
): Promise<void> {
  await safePublish(options.statusSink, event, options.logger);
}
export function modelStatusContextToLogContext(
  context: ModelStatusContext | ModelNetworkStatusEvent,
  attempt: number,
): Record<string, unknown> {
  return {
    traceId: context.traceId,
    queryId: context.queryId,
    sessionId: context.sessionId,
    turnId: context.turnId,
    requestId: context.requestId,
    providerId: context.providerId,
    modelId: context.modelId,
    providerKind: context.providerKind,
    transport: context.transport,
    attempt,
    maxAttempts: context.maxAttempts,
  };
}
