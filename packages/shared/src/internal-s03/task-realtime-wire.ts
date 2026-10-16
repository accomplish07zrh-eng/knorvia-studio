// SPDX-License-Identifier: Apache-2.0
// Nested task meta stays open: unknown keys are stripped, while attribution is a declared field.
// Snapshot and list schemas do not apply the workspace-key rule; only the aggregate event does.
// Mirror events keep unknown keys. The output type has to admit `content` the way a passthrough object does.
import { z } from "zod";
import type { KnorviaTaskMigrationSource, KnorviaTaskMode } from "../task-types-core.js";
import { agentProviderSchema } from "../agent-policy.js";
import { errorAttributionSchema } from "../protocol-v4/snapshot.js";
import type {
  TaskRealtimeDeliveryPurpose,
  TaskRunLeaseAcquireRequest,
  TaskRunLeaseResult,
  TaskSnapshotInvalidatedEvent,
  TaskStreamMirrorTarget,
  WorkspaceTaskListInvalidatedEvent,
} from "../task-realtime.js";
import { looseShape, openShape, strictShape, unionOf, type WireField } from "./wire-fields.js";
import {
  asWire,
  attachmentSchema,
  enforceRealtimeEvent,
  enforceTarget,
  plain,
  positive,
  trimmed,
  whole,
  wireEnum,
} from "./task-realtime-parts.js";

export { resolveWorkspaceKey } from "./task-realtime-parts.js";
export {
  taskOwnerCommandDeliverySchema,
  taskOwnerCommandErrorCodeSchema,
  taskOwnerCommandRequestSchema,
  taskOwnerCommandResultSchema,
} from "./task-owner-command-wire.js";

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

export const taskRealtimeReasonSchema = wireEnum(REALTIME_REASON_GROUPS.flat());
export const taskRealtimeDeliveryPurposeSchema = z.enum(["observer", "relay_owner"]);
export const taskRealtimeHostDeliveryKindSchema = z.enum(["desktop_window", "relay_bridge"]);

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
