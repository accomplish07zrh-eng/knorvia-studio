import {
  knorviaApiRetryFromModelNetworkStatusPayload,
  knorviaApiRetryFromStreamRecoveryPayload,
  type KnorviaDeliveryKind,
  type KnorviaSessionEvent,
} from "@knorvia/shared";
import { SessionEventType, type PendingPermission, type SessionEvent } from "@knorvia/contracts";
import { projectRecord, type RecordRecipe } from "./message-record-projection.js";
import {
  buildProtocolPermissionOptions,
  toLegacyPermissionOptionsPolicy,
} from "./permission-options.js";
import { sessionRecord, sessionString } from "./session-projection-primitives.js";

type SourceTag = SessionEvent["type"];
type PublicTag = KnorviaSessionEvent["type"];
type PayloadProjection = (event: SessionEvent, payload: unknown) => unknown;
const RECOVERY_EVENTS = [
  SessionEventType.StreamRecoveryAnchorCreated,
  SessionEventType.StreamRecoveryStarted,
  SessionEventType.StreamRecoveryAnchorSelected,
  SessionEventType.StreamRecoveryRetryStarted,
  SessionEventType.StreamRecoveryTailDiscarded,
  SessionEventType.StreamRecoveryBlocked,
] as const;
// 兼容事件 vocabulary：family 描述表保留所有现有 tag，不作为原创权利证明。
const EVENT_FAMILIES: readonly (readonly [PublicTag, readonly SourceTag[]])[] = [
  ["session.created", [SessionEventType.SessionCreated]],
  ["session.resumed", [SessionEventType.SessionResumed]],
  ["session.titleUpdated", [SessionEventType.SessionTitleUpdated]],
  ["session.closed", [SessionEventType.SessionEnded]],
  ["turn.started", [SessionEventType.TurnStarted]],
  ["turn.steerQueued", [SessionEventType.TurnSteerQueued]],
  ["turn.steerDrained", [SessionEventType.TurnSteerDrained]],
  ["turn.completed", [SessionEventType.TurnComplete]],
  ["turn.failed", [SessionEventType.TurnError]],
  [
    "message.upserted",
    [
      SessionEventType.UserMessage,
      SessionEventType.AssistantMessage,
      SessionEventType.SystemMessage,
    ],
  ],
  ["model.streaming", [SessionEventType.ModelStreaming]],
  [
    "tool.updated",
    [
      SessionEventType.ToolCallScheduled,
      SessionEventType.ToolCallStarted,
      SessionEventType.ToolCallProgress,
      SessionEventType.ToolCallResult,
      SessionEventType.ToolCallError,
      SessionEventType.ToolBatchComplete,
    ],
  ],
  ["permission.requested", [SessionEventType.PermissionRequested]],
  ["permission.resolved", [SessionEventType.PermissionResolved, SessionEventType.PermissionDenied]],
  ["checkpoint.created", [SessionEventType.CheckpointCreated]],
  ["rewind.triggered", [SessionEventType.RewindTriggered]],
  ["streamRecovery.updated", RECOVERY_EVENTS],
];
const PUBLIC_TAGS = new Map<SourceTag, PublicTag>(
  EVENT_FAMILIES.flatMap(([publicTag, sources]) =>
    sources.map((source) => [source, publicTag] as const),
  ),
);
const PRIVATE_EVENTS = new Set<SourceTag>([
  SessionEventType.StreamingToolLedgerUpdated,
  SessionEventType.DynamicWorkflowRunProgress,
]);
const TOOL_STREAM_KINDS = new Set([
  "tool_input_start",
  "tool_input_delta",
  "tool_input_end",
  "tool_call",
]);
const REQUEST_FIELDS = [
  "providerId",
  "modelId",
  "temperature",
  "maxTokens",
  "toolCount",
  "iteration",
] as const;

function instant(value: unknown): number | string | undefined {
  if (value instanceof Date) {
    const milliseconds = value.getTime();
    return Number.isFinite(milliseconds) ? milliseconds : undefined;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim().length > 0) return value;
  return undefined;
}

function requestPayload(_event: SessionEvent, payload: unknown): Record<string, unknown> {
  const source = sessionRecord(payload);
  const messages = Array.isArray(source.messages) ? source.messages : [];
  const visible: Record<string, unknown> = { messageCount: messages.length };
  for (const field of REQUEST_FIELDS)
    if (source[field] !== undefined) visible[field] = source[field];
  return visible;
}

function retryPayload(
  payload: unknown,
  derive: (record: Record<string, unknown>) => unknown,
): Record<string, unknown> {
  const source = sessionRecord(payload);
  const retry = derive(source);
  if (retry === undefined) return source;
  const meta = sessionRecord(source._meta);
  const privateMeta = sessionRecord(meta.knorvia);
  const output = { ...source };
  output._meta = { ...meta, knorvia: { ...privateMeta, apiRetry: retry } };
  return output;
}

function permissionPayload(_event: SessionEvent, payload: unknown): Record<string, unknown> {
  const { display: _display, optionsPolicy, ...source } = sessionRecord(payload);
  const toolName = sessionString(source.toolName) ?? "unknown";
  const output = { ...source };
  output.options = buildProtocolPermissionOptions({
    input: source.input,
    suggestedPermissionUpdates: Array.isArray(source.suggestedPermissionUpdates)
      ? (source.suggestedPermissionUpdates as PendingPermission["suggestedPermissionUpdates"])
      : undefined,
    optionsPolicy: toLegacyPermissionOptionsPolicy(optionsPolicy),
    toolName,
  });
  return output;
}

const PAYLOADS = new Map<SourceTag, PayloadProjection>([
  [SessionEventType.ModelRequest, requestPayload],
  [
    SessionEventType.ModelNetworkStatus,
    (_event, payload) => retryPayload(payload, knorviaApiRetryFromModelNetworkStatusPayload),
  ],
  [
    SessionEventType.ToolCallStarted,
    (event, payload) => {
      const source = sessionRecord(payload);
      const output = { ...source };
      output.startedAt = instant(source.startedAt) ?? event.timestamp.getTime();
      output.kind = "started";
      return output;
    },
  ],
  [SessionEventType.PermissionRequested, permissionPayload],
  [
    SessionEventType.PermissionDenied,
    (_event, payload) => ({ ...sessionRecord(payload), decision: "deny" }),
  ],
]);
for (const tag of RECOVERY_EVENTS)
  PAYLOADS.set(tag, (_event, payload) =>
    retryPayload(payload, knorviaApiRetryFromStreamRecoveryPayload),
  );
for (const [tag, kind] of [
  [SessionEventType.ToolCallScheduled, "scheduled"],
  [SessionEventType.ToolCallProgress, "progress"],
  [SessionEventType.ToolCallResult, "result"],
  [SessionEventType.ToolCallError, "error"],
  [SessionEventType.ToolBatchComplete, "batch"],
] as const)
  PAYLOADS.set(tag, (_event, payload) => ({ ...(payload as Record<string, unknown>), kind }));

interface Envelope {
  event: SessionEvent;
  deliveryKind?: KnorviaDeliveryKind;
  options: { seq?: number };
}
const ENVELOPE: RecordRecipe<Envelope, KnorviaSessionEvent> = [
  ["deliveryKind", (input) => input.deliveryKind],
  ["eventId", (input) => String(input.event.id)],
  [
    "payload",
    (input) => {
      const payload = input.event.payload;
      const project = PAYLOADS.get(input.event.type);
      return project ? project(input.event, payload) : payload;
    },
  ],
  ["seq", (input) => input.options.seq ?? input.event.sequenceNumber],
  ["sessionId", (input) => String(input.event.sessionId)],
  ["timestamp", (input) => input.event.timestamp.getTime()],
  ["traceId", (input) => String(input.event.traceId)],
  ["turnId", (input) => (input.event.turnId ? String(input.event.turnId) : undefined)],
  ["type", (input) => PUBLIC_TAGS.get(input.event.type) ?? "session.updated"],
];

export function shouldExposeSessionEventToProtocol(event: SessionEvent): boolean {
  if (PRIVATE_EVENTS.has(event.type)) return false;
  if (event.type !== SessionEventType.ModelStreaming) return true;
  const payload = sessionRecord(event.payload);
  const kind = sessionString(payload.kind);
  const delta = sessionString(payload.delta);
  if (kind === "text_delta" || kind === "reasoning_delta") return Boolean(delta);
  return kind !== undefined && TOOL_STREAM_KINDS.has(kind);
}

export function mapSessionEvent(
  event: SessionEvent,
  deliveryKind?: KnorviaDeliveryKind,
  options: { seq?: number } = {},
): KnorviaSessionEvent {
  return projectRecord({ event, deliveryKind, options }, ENVELOPE);
}

export function mapSessionEventForProtocol(
  event: SessionEvent,
  deliveryKind?: KnorviaDeliveryKind,
  options: { seq?: number } = {},
): KnorviaSessionEvent | null {
  return shouldExposeSessionEventToProtocol(event)
    ? mapSessionEvent(event, deliveryKind, options)
    : null;
}

export function mapSessionEvents(
  events: readonly SessionEvent[],
  deliveryKind?: KnorviaDeliveryKind,
): KnorviaSessionEvent[] {
  const visible: KnorviaSessionEvent[] = [];
  events.forEach((event) => {
    const projected = mapSessionEventForProtocol(event, deliveryKind);
    if (projected !== null) visible.push(projected);
  });
  return visible;
}
