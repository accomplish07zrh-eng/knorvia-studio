// SPDX-License-Identifier: Apache-2.0
// Owner commands travel on the same workspace-key envelope as stream batches, with their own type tags.
import { z } from "zod";
import { knorviaPermissionResponseSchema } from "../protocol-legacy-types.js";
import { workspaceHookReviewDecisionSchema } from "../protocol-v4/workspace-hook-review.js";
import type {
  TaskOwnerCommandDelivery,
  TaskOwnerCommandRequest,
  TaskOwnerCommandResult,
} from "../task-realtime.js";
import { strictShape, unionOf, type WireField } from "./wire-fields.js";
import {
  asWire,
  attachmentSchema,
  enforceRemoteReview,
  enforceWorkspaceKey,
  plain,
  positive,
  trimmed,
  whole,
  wireEnum,
} from "./task-realtime-parts.js";

const COMMAND_STATUSES = ["accepted", "running", "failed"] as const;
const ELICITATION_ACTIONS = ["accept", "decline", "cancel"] as const;
const digestText = z.string().regex(/^[a-f0-9]{64}$/u);
const replayClient = z.literal("web-remote-replayable");

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
