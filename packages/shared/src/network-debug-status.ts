import type {
  InputId,
  QueryId,
  TraceId,
  KnorviaStreamEvent,
  KnorviaTaskNetworkDebugStatusType,
} from "./task-types-core.js";

function diagnosticType(value: unknown): KnorviaTaskNetworkDebugStatusType | undefined {
  switch (value) {
    case "model_request_started":
    case "model_request_completed":
    case "model_request_failed":
    case "model_retry_scheduled":
    case "model_stream_stalled":
      return value;
    default:
      return undefined;
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function integerValue(value: unknown, minimum: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum
    ? value
    : undefined;
}

function elapsedValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function headerValues(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(recordValue(value)).filter(([, entry]) => typeof entry === "string"),
  );
}

function suppliedField<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Partial<Record<K, V>>);
}

export function knorviaTaskNetworkDebugStatusFromPayload(params: {
  taskId: string;
  traceId: TraceId;
  inputId?: InputId;
  queryId?: QueryId;
  eventId?: string;
  payload: Record<string, unknown>;
}): Extract<
  KnorviaStreamEvent,
  {
    type: "task_network_debug_status";
  }
> | null {
  const statusType = diagnosticType(params.payload.type);
  if (statusType === undefined) {
    return null;
  }

  const payload = params.payload;
  const model = recordValue(payload.model);
  const requestHeaders = headerValues(payload.requestHeaders);
  const responseHeaders = headerValues(payload.responseHeaders);
  const requestId = textValue(payload.requestId);
  const attempt = integerValue(payload.attempt, 1);
  const timestamp = textValue(payload.timestamp);
  const queryId = params.queryId ?? (textValue(payload.queryId) as QueryId | undefined);
  const eventKey =
    params.eventId ??
    [
      params.traceId,
      params.inputId ?? "no-input",
      statusType,
      requestId ?? "no-request",
      attempt ?? "no-attempt",
      timestamp ?? "no-time",
    ].join(":");

  return {
    type: "task_network_debug_status",
    taskId: params.taskId,
    traceId: params.traceId,
    statusType,
    eventKey,
    requestHeaders,
    responseHeaders,
    requestHeaderCount:
      integerValue(payload.requestHeaderCount, 0) ?? Object.keys(requestHeaders).length,
    responseHeaderCount:
      integerValue(payload.responseHeaderCount, 0) ?? Object.keys(responseHeaders).length,
    ...suppliedField("inputId", params.inputId || undefined),
    ...suppliedField("queryId", queryId || undefined),
    ...suppliedField("eventId", params.eventId || undefined),
    ...suppliedField("requestId", requestId),
    ...suppliedField("providerKind", textValue(payload.providerKind)),
    ...suppliedField("providerId", textValue(model.providerId)),
    ...suppliedField("modelId", textValue(model.modelId)),
    ...suppliedField("transport", textValue(payload.transport)),
    ...suppliedField("baseURL", textValue(payload.baseURL)),
    ...suppliedField("querySource", textValue(payload.querySource)),
    ...suppliedField("reason", textValue(payload.reason)),
    ...suppliedField("message", textValue(payload.message)),
    ...suppliedField("timestamp", timestamp),
    ...suppliedField("attempt", attempt),
    ...suppliedField("maxAttempts", integerValue(payload.maxAttempts, 1)),
    ...suppliedField("nextAttempt", integerValue(payload.nextAttempt, 1)),
    ...suppliedField("statusCode", integerValue(payload.statusCode, 0)),
    ...suppliedField("durationMs", elapsedValue(payload.durationMs)),
    ...suppliedField("delayMs", elapsedValue(payload.delayMs)),
    ...suppliedField("idleMs", elapsedValue(payload.idleMs)),
    ...suppliedField("timeoutMs", elapsedValue(payload.timeoutMs)),
    ...suppliedField(
      "retryable",
      typeof payload.retryable === "boolean" ? payload.retryable : undefined,
    ),
  };
}
