// Compact Contracts - boundary payloads and active-chain helpers

import { z } from "zod";

import type { MessageId, PartId, ToolCallId, TraceId, TurnId } from "../interfaces/shared.js";

const COMPACT_TRIGGER_VALUES = [
  "manual",
  "auto",
  "partial",
  "reactive",
  "session_memory",
] as const satisfies readonly string[];

export const CompactTrigger = buildCompactValueTable(COMPACT_TRIGGER_VALUES);

export type CompactTrigger = (typeof COMPACT_TRIGGER_VALUES)[number];

const MICROCOMPACT_TRIGGER_VALUES = [
  "time_based",
  "token_pressure",
] as const satisfies readonly string[];

export const MicrocompactTrigger = buildCompactValueTable(MICROCOMPACT_TRIGGER_VALUES);

export type MicrocompactTrigger = (typeof MICROCOMPACT_TRIGGER_VALUES)[number];

const MICROCOMPACT_STRATEGY_VALUES = [
  "local_tool_result_clear",
] as const satisfies readonly string[];

export const MicrocompactStrategy = buildCompactValueTable(MICROCOMPACT_STRATEGY_VALUES);

export type MicrocompactStrategy = (typeof MICROCOMPACT_STRATEGY_VALUES)[number];

const COMPACT_PHASE_VALUES = [
  "standalone_turn",
  "pre_request",
  "mid_turn",
  "reactive",
] as const satisfies readonly string[];

export const CompactPhase = buildCompactValueTable(COMPACT_PHASE_VALUES);

export type CompactPhase = (typeof COMPACT_PHASE_VALUES)[number];

const COMPACT_REASON_VALUES = [
  "user_requested",
  "context_limit",
  "model_downshift",
  "provider_overflow",
] as const satisfies readonly string[];

export const CompactReason = buildCompactValueTable(COMPACT_REASON_VALUES);

export type CompactReason = (typeof COMPACT_REASON_VALUES)[number];

const COMPACT_STATUS_VALUES = [
  "started",
  "boundary_created",
  "summary_created",
  "completed",
  "failed",
] as const satisfies readonly string[];

export const CompactStatus = buildCompactValueTable(COMPACT_STATUS_VALUES);

export type CompactStatus = (typeof COMPACT_STATUS_VALUES)[number];

const C_OM_PA_CT_TI_ME_LI_NE_ST_AT_US_VALUES = [
  "started",
  "retrying",
  "skipped",
  "completed",
  "failed",
  "interrupted",
] as const satisfies readonly string[];

export const CompactTimelineStatus = buildCompactValueTable(C_OM_PA_CT_TI_ME_LI_NE_ST_AT_US_VALUES);

export type CompactTimelineStatus = (typeof C_OM_PA_CT_TI_ME_LI_NE_ST_AT_US_VALUES)[number];

const C_OM_PA_CT_TI_ME_LI_NE_DI_SP_LA_Y_VALUES = ["separator"] as const satisfies readonly string[];

export const CompactTimelineDisplay = buildCompactValueTable(
  C_OM_PA_CT_TI_ME_LI_NE_DI_SP_LA_Y_VALUES,
);

export type CompactTimelineDisplay = (typeof C_OM_PA_CT_TI_ME_LI_NE_DI_SP_LA_Y_VALUES)[number];

/** 失败原因的字面量联合；清单与联合同序、同集合。 */
export type CompactFailureReason =
  | "not_enough_messages"
  | "prompt_too_long"
  | "no_summary"
  | "api_error"
  | "cancelled"
  | "hook_failed"
  | "relink_failed"
  | "unknown";

/** 取值 → 常量键：`boundary_created` → `BoundaryCreated`。 */
type CompactValueKey<Value extends string> = Value extends `${infer Head}_${infer Tail}`
  ? `${Capitalize<Head>}${CompactValueKey<Tail>}`
  : Capitalize<Value>;

/** 由取值清单建常量表：键由取值推导，顺序即清单顺序。 */
function buildCompactValueTable<const Values extends readonly string[]>(
  values: Values,
): { readonly [Value in Values[number] as CompactValueKey<Value>]: Value } {
  return Object.fromEntries(
    values.map((value) => [toCompactValueKey(value), value] as const),
  ) as unknown as { readonly [Value in Values[number] as CompactValueKey<Value>]: Value };
}

/** 取值 → 常量键：`hook_failed` → `HookFailed`。 */
function toCompactValueKey(value: string): string {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
}

/** 失败原因取值清单：常量表由它推出。 */
const COMPACT_FAILURE_REASON_VALUES =
  "not_enough_messages prompt_too_long no_summary api_error cancelled hook_failed relink_failed unknown".split(
    " ",
  ) as readonly CompactFailureReason[];

export const CompactFailureReason = Object.fromEntries(
  COMPACT_FAILURE_REASON_VALUES.map((value) => [toCompactValueKey(value), value]),
) as unknown as {
  readonly NotEnoughMessages: "not_enough_messages";
  readonly PromptTooLong: "prompt_too_long";
  readonly NoSummary: "no_summary";
  readonly ApiError: "api_error";
  readonly Cancelled: "cancelled";
  readonly HookFailed: "hook_failed";
  readonly RelinkFailed: "relink_failed";
  readonly Unknown: "unknown";
};

/** 时间线 `status` 的取值 schema；抽成命名 const，避免链被折断。 */
const compactTimelineStatusValueSchema = z.enum([
  CompactTimelineStatus.Started,
  CompactTimelineStatus.Retrying,
  CompactTimelineStatus.Skipped,
  CompactTimelineStatus.Completed,
  CompactTimelineStatus.Failed,
  CompactTimelineStatus.Interrupted,
]);

/** 时间线 `trigger` 的取值 schema。 */
const compactTimelineTriggerValueSchema = z.enum([
  CompactTrigger.Manual,
  CompactTrigger.Auto,
  CompactTrigger.Partial,
  CompactTrigger.Reactive,
  CompactTrigger.SessionMemory,
]);

/** 时间线 `phase` 的取值 schema。 */
const compactTimelinePhaseValueSchema = z.enum([
  CompactPhase.StandaloneTurn,
  CompactPhase.PreRequest,
  CompactPhase.MidTurn,
  CompactPhase.Reactive,
]);

/** 时间线 `compactReason` 的取值 schema。 */
const compactTimelineReasonValueSchema = z.enum([
  CompactReason.UserRequested,
  CompactReason.ContextLimit,
  CompactReason.ModelDownshift,
  CompactReason.ProviderOverflow,
]);

/** 时间线 payload 的字段表：字段只声明一次，schema 由字段表构造。 */
const compactTimelinePayloadFields = {
  operationId: z.string().min(1),
  messageId: z.string().min(1),
  partId: z.string().min(1).optional(),
  status: compactTimelineStatusValueSchema,
  trigger: compactTimelineTriggerValueSchema,
  phase: compactTimelinePhaseValueSchema.optional(),
  compactReason: compactTimelineReasonValueSchema.optional(),
  display: z.literal(CompactTimelineDisplay.Separator).default(CompactTimelineDisplay.Separator),
  text: z.string().min(1).optional(),
  replace: z.boolean().optional(),
  reason: z.string().min(1).optional(),
  boundaryId: z.string().min(1).optional(),
  summaryMessageId: z.string().min(1).optional(),
  // compact 覆盖前缀的最后一条 transcript message；live/cold edit 判定必须同源。
  tailStartMessageId: z.string().min(1).optional(),
  sourceCommandId: z.string().min(1).optional(),
  preCompactTokenCount: z.number().int().nonnegative().optional(),
  postCompactTokenCount: z.number().int().nonnegative().optional(),
  truePostCompactTokenCount: z.number().int().nonnegative().optional(),
  attempt: z.number().int().positive().optional(),
  maxAttempts: z.number().int().positive().optional(),
  startedAt: z.number().int().nonnegative().optional(),
  endedAt: z.number().int().nonnegative().optional(),
};

const compactTimelinePayloadInputSchema = z.object(compactTimelinePayloadFields).strict();

export const compactTimelinePayloadSchema = compactTimelinePayloadInputSchema.transform(
  ({ text: _legacyText, ...payload }) => payload,
);

export type CompactTimelinePayload = Omit<
  z.infer<typeof compactTimelinePayloadSchema>,
  "messageId" | "partId" | "summaryMessageId" | "tailStartMessageId"
> & {
  messageId: MessageId;
  partId?: PartId;
  summaryMessageId?: MessageId;
  tailStartMessageId?: MessageId;
};

export function parseCompactTimelinePayload(input: unknown): CompactTimelinePayload {
  return compactTimelinePayloadSchema.parse(input) as CompactTimelinePayload;
}

/** preservedSegment 的字段表。 */
const compactPreservedSegmentFields = {
  headMessageId: z.string().min(1),
  anchorMessageId: z.string().min(1),
  tailMessageId: z.string().min(1),
};

export const compactPreservedSegmentSchema = z.object(compactPreservedSegmentFields).strict();

export type CompactPreservedSegment = {
  headMessageId: MessageId;
  anchorMessageId: MessageId;
  tailMessageId: MessageId;
};

/** boundary payload 的字段表；取值枚举复用时间线抽出的命名 schema。 */
const compactBoundaryPayloadFields = {
  boundaryId: z.string().min(1),
  trigger: compactTimelineTriggerValueSchema,
  phase: compactTimelinePhaseValueSchema.optional(),
  compactReason: compactTimelineReasonValueSchema.optional(),
  summarySource: z.enum(["model", "session_memory"]).optional(),
  preCompactTokenCount: z.number().int().nonnegative(),
  postCompactTokenCount: z.number().int().nonnegative().optional(),
  truePostCompactTokenCount: z.number().int().nonnegative().optional(),
  autoCompactThreshold: z.number().int().nonnegative().optional(),
  willRetriggerNextTurn: z.boolean().optional(),
  summarizedMessageCount: z.number().int().nonnegative(),
  keptMessageCount: z.number().int().nonnegative().optional(),
  lastSummarizedMessageId: z.string().min(1).optional(),
  preservedSegment: compactPreservedSegmentSchema.optional(),
  summaryMessageIds: z.array(z.string().min(1)).default([]),
  attachmentMessageIds: z.array(z.string().min(1)).optional(),
  hookResultMessageIds: z.array(z.string().min(1)).optional(),
  preCompactDiscoveredTools: z.array(z.string().min(1)).optional(),
  customInstructions: z.boolean().optional(),
  traceId: z.string().min(1),
  turnId: z.string().min(1).optional(),
  spanId: z.string().min(1).optional(),
  parentSpanId: z.string().min(1).optional(),
};

export const compactBoundaryPayloadSchema = z.object(compactBoundaryPayloadFields).strict();

export type CompactBoundaryPayload = Omit<
  z.infer<typeof compactBoundaryPayloadSchema>,
  "lastSummarizedMessageId" | "preservedSegment" | "summaryMessageIds" | "traceId" | "turnId"
> & {
  lastSummarizedMessageId?: MessageId;
  preservedSegment?: CompactPreservedSegment;
  summaryMessageIds: MessageId[];
  traceId: TraceId;
  turnId?: TurnId;
};

/** microcompact boundary payload 的字段表。 */
const microcompactBoundaryPayloadFields = {
  trigger: z.enum([MicrocompactTrigger.TimeBased, MicrocompactTrigger.TokenPressure]),
  strategy: z.enum([MicrocompactStrategy.LocalToolResultClear]),
  preMicrocompactTokenCount: z.number().int().nonnegative(),
  postMicrocompactTokenCount: z.number().int().nonnegative(),
  tokensSaved: z.number().int().nonnegative(),
  clearedToolCallIds: z.array(z.string().min(1)),
  keptToolCallIds: z.array(z.string().min(1)),
  clearedMessageCount: z.number().int().nonnegative(),
  traceId: z.string().min(1),
  turnId: z.string().min(1).optional(),
};

export const microcompactBoundaryPayloadSchema = z
  .object(microcompactBoundaryPayloadFields)
  .strict();

export type MicrocompactBoundaryPayload = Omit<
  z.infer<typeof microcompactBoundaryPayloadSchema>,
  "clearedToolCallIds" | "keptToolCallIds" | "traceId" | "turnId"
> & {
  clearedToolCallIds: ToolCallId[];
  keptToolCallIds: ToolCallId[];
  traceId: TraceId;
  turnId?: TurnId;
};

export interface CompactSummaryPayload {
  boundaryId: string;
  summary: string;
  summaryMessageId: MessageId;
  source: "model" | "session_memory";
}

export interface CompactProjectionInfo {
  boundaryId: string;
  trigger: CompactTrigger;
  phase?: CompactPhase;
  compactReason?: CompactReason;
  compactedAt: Date;
  preCompactTokenCount: number;
  postCompactTokenCount?: number;
  truePostCompactTokenCount?: number;
  summarizedMessageCount: number;
  keptMessageCount?: number;
  willRetriggerNextTurn?: boolean;
}

export interface CompactContextItem {
  id: string;
  compactBoundary?: CompactBoundaryPayload;
  isCompactSummary?: boolean;
}

export interface CompactPostContext<T> {
  boundaryMarker: T;
  summaryMessages: readonly T[];
  messagesToKeep?: readonly T[];
  attachments?: readonly T[];
  hookResults?: readonly T[];
}

export function parseCompactBoundaryPayload(input: unknown): CompactBoundaryPayload {
  return compactBoundaryPayloadSchema.parse(input) as CompactBoundaryPayload;
}

export function parseMicrocompactBoundaryPayload(input: unknown): MicrocompactBoundaryPayload {
  return microcompactBoundaryPayloadSchema.parse(input) as MicrocompactBoundaryPayload;
}

export function isCompactBoundaryItem(item: unknown): item is CompactContextItem & {
  compactBoundary: CompactBoundaryPayload;
} {
  if (typeof item !== "object" || item === null || !("compactBoundary" in item)) {
    return false;
  }

  const boundary = (item as { compactBoundary?: unknown }).compactBoundary;
  return compactBoundaryPayloadSchema.safeParse(boundary).success;
}

export function buildPostCompactItems<T>(postContext: CompactPostContext<T>): T[] {
  return [
    postContext.boundaryMarker,
    ...postContext.summaryMessages,
    ...(postContext.messagesToKeep ?? []),
    ...(postContext.attachments ?? []),
    ...(postContext.hookResults ?? []),
  ];
}

export function getItemsAfterLastCompactBoundary<T>(
  items: readonly T[],
  isBoundary: (item: T) => boolean = (item) => isCompactBoundaryItem(item),
): T[] {
  const boundaryIndex = items.findLastIndex(isBoundary);
  if (boundaryIndex < 0) {
    return [...items];
  }
  return items.slice(boundaryIndex);
}

export function annotateBoundaryWithPreservedSegment<T extends CompactContextItem>(
  boundary: T,
  preservedSegment: CompactPreservedSegment,
): T {
  if (!boundary.compactBoundary) {
    throw new Error("Cannot annotate a compact boundary on an item without compactBoundary");
  }

  return {
    ...boundary,
    compactBoundary: {
      ...boundary.compactBoundary,
      preservedSegment,
    },
  };
}
