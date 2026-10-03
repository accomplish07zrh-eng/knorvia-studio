import type { MessagePart } from "@knorvia/contracts";
import type { KnorviaMessagePart } from "@knorvia/shared";
import { projectRecord, type RecordRecipe } from "./message-record-projection.js";

type StoredCompaction = Extract<MessagePart, { type: "compaction" }>;
type StoredTimeline = Extract<MessagePart, { type: "timeline" }>;
type PublicTimeline = Extract<KnorviaMessagePart, { type: "timeline" }>;

const COMPACTION_METADATA: RecordRecipe<StoredCompaction, Record<string, unknown>> = [
  ["attempt", (part) => part.attempt],
  ["boundaryId", (part) => part.boundaryId],
  ["compactReason", (part) => part.compactReason],
  ["endedAt", (part) => part.time?.end],
  ["maxAttempts", (part) => part.maxAttempts],
  ["operationId", (part) => part.operationId],
  ["phase", (part) => part.phase],
  ["postCompactTokenCount", (part) => part.postCompactTokenCount],
  ["preCompactTokenCount", (part) => part.preCompactTokenCount],
  ["reason", (part) => part.reason],
  ["replace", (part) => part.replace],
  ["startedAt", (part) => part.time?.start],
  ["summaryMessageId", (part) => part.summaryMessageId],
  ["timelineStatus", (part) => part.timelineStatus],
  ["truePostCompactTokenCount", (part) => part.truePostCompactTokenCount],
  ["trigger", (part) => part.trigger],
];

export function projectCompactionMetadata(part: StoredCompaction): Record<string, unknown> {
  return projectRecord(part, COMPACTION_METADATA);
}

export const TIMELINE_FIELDS: RecordRecipe<
  StoredTimeline,
  Omit<PublicTimeline, "messageId" | "partId" | "sessionId">
> = [
  ["anchorMessageId", (part) => (part.anchorMessageId ? String(part.anchorMessageId) : undefined)],
  ["anchorTurnId", (part) => (part.anchorTurnId ? String(part.anchorTurnId) : undefined)],
  ["attempt", (part) => (part.timelineType === "context_compaction" ? part.attempt : undefined)],
  [
    "boundaryId",
    (part) => (part.timelineType === "context_compaction" ? part.boundaryId : undefined),
  ],
  [
    "compactReason",
    (part) => (part.timelineType === "context_compaction" ? part.compactReason : undefined),
  ],
  ["display", (part) => part.display],
  ["fromModel", (part) => (part.timelineType === "model_change" ? part.fromModel : undefined)],
  [
    "goalIteration",
    (part) => (part.timelineType === "goal_verification" ? part.goalIteration : undefined),
  ],
  [
    "maxAttempts",
    (part) => (part.timelineType === "context_compaction" ? part.maxAttempts : undefined),
  ],
  [
    "operationId",
    (part) => (part.timelineType === "context_compaction" ? part.operationId : undefined),
  ],
  [
    "parentSessionId",
    (part) => (part.timelineType === "session_fork" ? String(part.parentSessionId) : undefined),
  ],
  ["phase", (part) => (part.timelineType === "context_compaction" ? part.phase : undefined)],
  [
    "postCompactTokenCount",
    (part) => (part.timelineType === "context_compaction" ? part.postCompactTokenCount : undefined),
  ],
  [
    "preCompactTokenCount",
    (part) => (part.timelineType === "context_compaction" ? part.preCompactTokenCount : undefined),
  ],
  ["reason", (part) => (part.timelineType === "context_compaction" ? part.reason : undefined)],
  [
    "restoredFileCount",
    (part) => (part.timelineType === "session_fork" ? part.restoredFileCount : undefined),
  ],
  ["status", (part) => part.status],
  [
    "summaryMessageId",
    (part) =>
      part.timelineType === "context_compaction" && part.summaryMessageId
        ? String(part.summaryMessageId)
        : undefined,
  ],
  [
    "targetCheckpointId",
    (part) => (part.timelineType === "session_fork" ? part.targetCheckpointId : undefined),
  ],
  ["targetId", (part) => (part.timelineType === "goal_verification" ? part.targetId : undefined)],
  [
    "targetMessageId",
    (part) => (part.timelineType === "session_fork" ? String(part.targetMessageId) : undefined),
  ],
  ["time", (part) => part.time],
  ["timelineType", (part) => part.timelineType],
  ["toModel", (part) => (part.timelineType === "model_change" ? part.toModel : undefined)],
  ["trigger", (part) => (part.timelineType === "context_compaction" ? part.trigger : undefined)],
  [
    "truePostCompactTokenCount",
    (part) =>
      part.timelineType === "context_compaction" ? part.truePostCompactTokenCount : undefined,
  ],
  // 字面量返回类型维持 timeline 判别字段，不改变 payload 的隔离/读取次序。
  ["type", (): "timeline" => "timeline"],
  [
    "verification",
    (part) => (part.timelineType === "goal_verification" ? part.verification : undefined),
  ],
  [
    "verificationId",
    (part) => (part.timelineType === "goal_verification" ? part.verificationId : undefined),
  ],
];
