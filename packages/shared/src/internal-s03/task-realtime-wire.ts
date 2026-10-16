// SPDX-License-Identifier: Apache-2.0
// Nested task meta stays open: unknown keys are stripped, while attribution is a declared field.
// Snapshot and list schemas do not apply the workspace-key rule; only the aggregate event does.
import { z } from "zod";
import type { RefinementCtx } from "zod";
import type { KnorviaTaskMigrationSource, KnorviaTaskMode } from "../task-types-core.js";
import { agentProviderSchema } from "../agent-policy.js";
import { knorviaPermissionResponseSchema } from "../protocol-legacy-types.js";
import { workspaceHookReviewDecisionSchema } from "../protocol-v4/workspace-hook-review.js";
import { errorAttributionSchema } from "../protocol-v4/snapshot.js";
import { looseShape, openShape, strictShape, unionOf, type WireField } from "./wire-fields.js";
import type {
  TaskOwnerCommandDelivery,
  TaskOwnerCommandRequest,
  TaskOwnerCommandResult,
  TaskRealtimeDeliveryPurpose,
  TaskRunLeaseAcquireRequest,
  TaskRunLeaseResult,
  TaskSnapshotInvalidatedEvent,
  TaskStreamMirrorTarget,
  WorkspaceTaskListInvalidatedEvent,
} from "../task-realtime.js";

// Field tables keep key order. The published type is the shared contract, which a wide shape cannot name.
function asWire<T>(schema: z.ZodType): z.ZodType<T> {
  return schema as unknown as z.ZodType<T>;
}

// Mirror events keep unknown keys. The output type has to admit `content` the way a passthrough object does.
type MirrorableWireEvent = {
  type: string;
  taskId: string;
  traceId: string;
  [extra: string]: unknown;
};

type UserMessageWire = {
  kind: "user_message";
  messageId: string;
  content: string;
  attachments?: unknown;
  timestamp: number;
};

type StreamEventWire = {
  kind: "stream_event";
  event: MirrorableWireEvent;
};

type PublishOpWire = UserMessageWire | StreamEventWire;
type MirrorOpWire = (UserMessageWire & { seq: number }) | (StreamEventWire & { seq: number });

type BatchEventWire = {
  type: "task_stream_mirror_batch";
  eventId: string;
  workspacePath: string;
  workspaceIdentity?: string;
  workspaceKey: string;
  traceId: string;
  createdAt: number;
  taskId: string;
  runId: string;
  ownerClientId?: string;
  ownerDeviceLabel?: string;
  batchSeq: number;
  fromSeq: number;
  toSeq: number;
  ops: MirrorOpWire[];
  terminal: boolean;
};

type RealtimeEventWire =
  | TaskSnapshotInvalidatedEvent
  | WorkspaceTaskListInvalidatedEvent
  | BatchEventWire;

type DeliveredEventWire = RealtimeEventWire & {
  originHostId: string;
  deliveryPurpose?: TaskRealtimeDeliveryPurpose;
};

const trimmed = z.string().trim().min(1);
const plain = z.string();
const whole = z.number().int().nonnegative();
const positive = z.number().int().positive();
const digestText = z.string().regex(/^[a-f0-9]{64}$/u);
const replayClient = z.literal("web-remote-replayable");

const TASK_MODES = [
  "yolo",
  "plan",
  "edit",
  "auto",
  "autoEdit",
  "build",
] as const satisfies readonly KnorviaTaskMode[];
const MIGRATION_SOURCES = ["claudeCode"] as const satisfies readonly KnorviaTaskMigrationSource[];
const TASK_STATUSES = ["running", "completed", "error"] as const;
const COMMAND_STATUSES = ["accepted", "running", "failed"] as const;
const ELICITATION_ACTIONS = ["accept", "decline", "cancel"] as const;

const REALTIME_REASON_GROUPS = [
  [
    "task_created",
    "user_message_saved",
    "assistant_message_saved",
    "task_status_changed",
    "task_meta_changed",
  ],
  ["task_model_changed", "task_title_changed"],
  ["task_pinned", "task_unpinned", "task_archived", "task_unarchived"],
  ["task_deleted", "stream_mirror_gap", "stream_mirror_owner_lost"],
] as const;

function wireEnum(values: readonly string[]) {
  return z.enum(values as unknown as [string, ...string[]]);
}

export const taskRealtimeReasonSchema = wireEnum(REALTIME_REASON_GROUPS.flat());
export const taskRealtimeDeliveryPurposeSchema = z.enum(["observer", "relay_owner"]);
export const taskRealtimeHostDeliveryKindSchema = z.enum(["desktop_window", "relay_bridge"]);

const WORKSPACE_KEY_RULE = "workspaceKey must match workspaceIdentity fallback rule";
const RUN_TRACE_RULE = "runId must match traceId";
const REMOTE_REVIEW_RULE = "remote workspace Hook review response requires workspaceIdentity";

type WorkspaceScope = {
  workspacePath: string;
  workspaceIdentity?: string;
};

type KeyedWorkspace = WorkspaceScope & { workspaceKey: string };

type TracedRun = { runId: string; traceId: string };

export function resolveWorkspaceKey(scope: WorkspaceScope): string {
  const trimmedIdentity = scope.workspaceIdentity?.trim();
  if (trimmedIdentity) return trimmedIdentity;
  return scope.workspacePath;
}

function report(ctx: RefinementCtx, path: string, message: string): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
}

function enforceWorkspaceKey(value: KeyedWorkspace, ctx: RefinementCtx): void {
  if (value.workspaceKey === resolveWorkspaceKey(value)) return;
  report(ctx, "workspaceKey", WORKSPACE_KEY_RULE);
}

function enforceRunTrace(value: TracedRun, ctx: RefinementCtx): void {
  if (value.runId === value.traceId) return;
  report(ctx, "runId", RUN_TRACE_RULE);
}

function enforceTarget(value: KeyedWorkspace & TracedRun, ctx: RefinementCtx): void {
  enforceWorkspaceKey(value, ctx);
  enforceRunTrace(value, ctx);
}

function enforceRealtimeEvent(
  value: KeyedWorkspace & { type: string; runId?: string; traceId?: string },
  ctx: RefinementCtx,
): void {
  enforceWorkspaceKey(value, ctx);
  if (value.type !== "task_stream_mirror_batch") return;
  if (value.runId === undefined || value.traceId === undefined) return;
  enforceRunTrace({ runId: value.runId, traceId: value.traceId }, ctx);
}

function enforceRemoteReview(
  value: { remoteSessionId?: string; workspaceIdentity?: string },
  ctx: RefinementCtx,
): void {
  if (!value.remoteSessionId || value.workspaceIdentity) return;
  report(ctx, "workspaceIdentity", REMOTE_REVIEW_RULE);
}

const changeFileFields: WireField[] = [
  ["path", plain],
  ["added", whole],
  ["removed", whole],
  ["writeCount", positive],
  ["lastTurnIndex", whole],
];

const changeSummaryFields: WireField[] = [
  ["fileCount", whole],
  ["added", whole],
  ["removed", whole],
  ["files", z.array(strictShape(changeFileFields))],
];

const lastErrorFields: WireField[] = [
  ["code", plain.optional()],
  ["message", plain.min(1)],
  ["traceId", trimmed.optional()],
  ["taskId", trimmed.optional()],
  ["attribution", errorAttributionSchema.optional()],
];

const taskMetaFields: WireField[] = [
  ["taskId", trimmed],
  ["traceId", trimmed],
  ["title", plain],
  ["titleOverridden", z.boolean().optional()],
  ["workspacePath", trimmed],
  ["workspaceIdentity", trimmed.optional()],
  ["createdAt", whole],
  ["updatedAt", whole],
  ["mode", z.enum(TASK_MODES)],
  ["model", plain.optional()],
  ["runtimeEpoch", whole.optional()],
  ["provider", agentProviderSchema.optional()],
  ["migrationSource", z.enum(MIGRATION_SOURCES).optional()],
  ["forkedFromTaskId", trimmed.optional()],
  ["unreadAt", whole.optional()],
  ["status", z.enum(TASK_STATUSES).optional()],
  ["lastError", openShape(lastErrorFields).optional()],
  ["changeSummary", strictShape(changeSummaryFields).optional()],
];

const taskMetaSchema = openShape(taskMetaFields);

const envelopeFields: WireField[] = [
  ["eventId", trimmed],
  ["workspacePath", trimmed],
  ["workspaceIdentity", trimmed.optional()],
  ["workspaceKey", trimmed],
  ["traceId", trimmed],
  ["createdAt", whole],
];

const invalidationFields: WireField[] = [
  ...envelopeFields,
  ["reason", taskRealtimeReasonSchema],
  [
    "streamWatermark",
    strictShape([
      ["runId", trimmed],
      ["opSeq", whole],
    ]).optional(),
  ],
];

export const taskSnapshotInvalidatedEventSchema = asWire<TaskSnapshotInvalidatedEvent>(
  strictShape([
    ...invalidationFields,
    ["type", z.literal("task_snapshot_invalidated")],
    ["taskId", trimmed],
  ]),
);

export const workspaceTaskListInvalidatedEventSchema = asWire<WorkspaceTaskListInvalidatedEvent>(
  strictShape([
    ...invalidationFields,
    ["type", z.literal("workspace_task_list_invalidated")],
    ["taskId", trimmed.optional()],
    ["taskMeta", taskMetaSchema.optional()],
  ]),
);

function mediaFields(kind: "image" | "video" | "pdf"): WireField[] {
  return [
    ["kind", z.literal(kind)],
    ["filename", plain],
    ["mimeType", plain],
    ["sizeBytes", whole.optional()],
    ["dataBase64", plain.optional()],
    ["localPath", plain.optional()],
  ];
}

const audioFields: WireField[] = [
  ["kind", z.literal("audio")],
  ["filename", plain],
  ["mimeType", plain],
  ["dataBase64", plain.optional()],
  ["localPath", plain.optional()],
];

const fileFields: WireField[] = [
  ["kind", z.literal("file")],
  ["filename", plain],
  ["mimeType", plain],
  ["sizeBytes", whole],
  ["dataBase64", plain.optional()],
  ["textContent", plain.optional()],
  ["localPath", plain.optional()],
];

const attachmentSchema = unionOf("kind", [
  strictShape(mediaFields("image")),
  strictShape(audioFields),
  strictShape(mediaFields("video")),
  strictShape(mediaFields("pdf")),
  strictShape(fileFields),
]);

const mirrorableEvent = looseShape([
  ["type", trimmed],
  ["taskId", trimmed],
  ["traceId", trimmed],
]);

const userMessageFields: WireField[] = [
  ["kind", z.literal("user_message")],
  ["messageId", trimmed],
  ["content", plain],
  ["attachments", z.array(attachmentSchema).optional()],
  ["timestamp", z.number().finite()],
];

const streamEventFields: WireField[] = [
  ["kind", z.literal("stream_event")],
  ["event", mirrorableEvent],
];

function withSequence(fields: readonly WireField[]): WireField[] {
  return [...fields, ["seq", positive]];
}

export const taskStreamMirrorPublishOpSchema = asWire<PublishOpWire>(
  unionOf("kind", [strictShape(userMessageFields), strictShape(streamEventFields)]),
);

export const taskStreamMirrorOpSchema = asWire<MirrorOpWire>(
  unionOf("kind", [
    strictShape(withSequence(userMessageFields)),
    strictShape(withSequence(streamEventFields)),
  ]),
);

const mirrorTargetFields: WireField[] = [
  ["workspacePath", trimmed],
  ["workspaceIdentity", trimmed.optional()],
  ["workspaceKey", trimmed],
  ["taskId", trimmed],
  ["runId", trimmed],
  ["traceId", trimmed],
  ["ownerClientId", trimmed.optional()],
  ["ownerDeviceLabel", trimmed.optional()],
];

export const taskStreamMirrorTargetSchema = asWire<TaskStreamMirrorTarget>(
  strictShape(mirrorTargetFields, enforceTarget),
);
export const taskRunLeaseTargetSchema = taskStreamMirrorTargetSchema;

export const taskRunLeaseAcquireRequestSchema = asWire<TaskRunLeaseAcquireRequest>(
  strictShape([...mirrorTargetFields, ["leaseRequestId", trimmed]], enforceTarget),
);

export const taskRunLeaseResultSchema = asWire<TaskRunLeaseResult>(
  unionOf("acquired", [
    strictShape([
      ["leaseRequestId", trimmed],
      ["acquired", z.literal(true)],
      ["ownerHostId", trimmed],
    ]),
    strictShape([
      ["leaseRequestId", trimmed],
      ["acquired", z.literal(false)],
      ["ownerHostId", trimmed],
      ["reason", z.literal("owned_by_other_host")],
    ]),
  ]),
);

const batchFields: WireField[] = [
  ...envelopeFields,
  ["type", z.literal("task_stream_mirror_batch")],
  ["taskId", trimmed],
  ["runId", trimmed],
  ["ownerClientId", trimmed.optional()],
  ["ownerDeviceLabel", trimmed.optional()],
  ["batchSeq", positive],
  ["fromSeq", positive],
  ["toSeq", positive],
  ["ops", z.array(taskStreamMirrorOpSchema)],
  ["terminal", z.boolean()],
];

const eventBranches = [
  taskSnapshotInvalidatedEventSchema,
  workspaceTaskListInvalidatedEventSchema,
  strictShape(batchFields),
];

export const taskRealtimeEventSchema = asWire<RealtimeEventWire>(
  unionOf("type", eventBranches, enforceRealtimeEvent),
);

const deliveryTail: WireField[] = [
  ["originHostId", trimmed],
  ["deliveryPurpose", taskRealtimeDeliveryPurposeSchema.optional()],
];

export const taskRealtimeDeliveredEventSchema = asWire<DeliveredEventWire>(
  unionOf(
    "type",
    [
      strictShape([
        ...invalidationFields,
        ["type", z.literal("task_snapshot_invalidated")],
        ["taskId", trimmed],
        ...deliveryTail,
      ]),
      strictShape([
        ...invalidationFields,
        ["type", z.literal("workspace_task_list_invalidated")],
        ["taskId", trimmed.optional()],
        ["taskMeta", taskMetaSchema.optional()],
        ...deliveryTail,
      ]),
      strictShape([...batchFields, ...deliveryTail]),
    ],
    enforceRealtimeEvent,
  ),
);

const ownerBase: WireField[] = [
  ["commandRequestId", trimmed],
  ["workspacePath", trimmed],
  ["workspaceIdentity", trimmed.optional()],
  ["workspaceKey", trimmed],
  ["taskId", trimmed],
  ["runId", trimmed],
];

function ownerFields(type: string, extra: readonly WireField[] = []): WireField[] {
  return [...ownerBase, ["type", z.literal(type)], ...extra];
}

const runtimeBase: WireField[] = [
  ["commandId", trimmed],
  ["taskId", trimmed],
  ["traceId", trimmed],
  ["workspacePath", trimmed],
  ["workspaceIdentity", trimmed.optional()],
  ["workspaceKey", trimmed],
  ["status", z.enum(COMMAND_STATUSES)],
  ["createdAt", whole],
  ["updatedAt", whole],
  ["clientId", trimmed.optional()],
  ["clientLabel", trimmed.optional()],
  ["error", plain.optional()],
];

const runtimeCommandSchema = unionOf("type", [
  strictShape([
    ...runtimeBase,
    ["type", z.literal("send_prompt")],
    ["content", plain],
    ["attachments", z.array(attachmentSchema).optional()],
    ["automationId", trimmed.optional()],
  ]),
]);

type OwnerVariant = { fields: WireField[]; check?: typeof enforceRemoteReview };

const ownerVariants: readonly OwnerVariant[] = [
  { fields: ownerFields("stop_generation") },
  {
    fields: ownerFields("respond_permission", [
      ["permissionRequestId", trimmed],
      ["optionId", trimmed],
      ["response", knorviaPermissionResponseSchema],
    ]),
  },
  {
    fields: ownerFields("respond_elicitation", [
      ["elicitationRequestId", trimmed],
      ["action", z.enum(ELICITATION_ACTIONS)],
      ["content", z.record(z.string(), z.unknown()).optional()],
    ]),
  },
  {
    fields: ownerFields("respond_workspace_hook_review", [
      ["remoteSessionId", trimmed.optional()],
      ["sessionId", trimmed],
      ["bundleDigest", digestText],
      ["reviewFlowId", trimmed],
      ["generation", positive],
      ["interactionId", trimmed],
      ["decision", workspaceHookReviewDecisionSchema],
    ]),
    check: enforceRemoteReview,
  },
  {
    fields: ownerFields("enqueue_task_command", [["taskCommand", runtimeCommandSchema]]),
  },
  {
    fields: ownerFields("promote_task_command", [
      ["commandId", trimmed],
      ["clientMode", replayClient],
    ]),
  },
  {
    fields: ownerFields("cancel_task_command", [
      ["commandId", trimmed],
      ["clientMode", replayClient],
    ]),
  },
];

function ownerSchemas(extra: readonly WireField[]) {
  return ownerVariants.map((variant) => strictShape([...variant.fields, ...extra], variant.check));
}

export const taskOwnerCommandRequestSchema = asWire<TaskOwnerCommandRequest>(
  unionOf("type", ownerSchemas([]), enforceWorkspaceKey),
);
export const taskOwnerCommandDeliverySchema = asWire<TaskOwnerCommandDelivery>(
  unionOf("type", ownerSchemas([["requesterHostId", trimmed]]), enforceWorkspaceKey),
);

export const taskOwnerCommandErrorCodeSchema = wireEnum([
  "NO_ACTIVE_TASK_OWNER",
  "STALE_TASK_OWNER_COMMAND",
  "OWNER_COMMAND_FAILED",
]);

export const taskOwnerCommandResultSchema = asWire<TaskOwnerCommandResult>(
  unionOf("success", [
    strictShape([
      ["commandRequestId", trimmed],
      ["success", z.literal(true)],
      ["taskCommand", runtimeCommandSchema.optional()],
    ]),
    strictShape([
      ["commandRequestId", trimmed],
      ["success", z.literal(false)],
      ["error", plain],
      ["code", taskOwnerCommandErrorCodeSchema.optional()],
    ]),
  ]),
);
