// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

/** 词表统一用空白分隔的字符串登记：zod 需要元组，类型从同一处投影。 */
const words = (source: string): [string, ...string[]] =>
  source.trim().split(/\s+/u) as [string, ...string[]];

const wordsOf = (source: string): readonly string[] => words(source);

const enumWords = (source: string) => z.enum(words(source));

const strictShape = (shape: z.ZodRawShape) => z.object(shape).strict();

/** 六段流水线：顺序即因果顺序，缺失段落由导出侧据此判定。 */
export const LOCAL_TTFT_STAGES: readonly string[] = wordsOf(
  "renderer_prepare command_admission execution_wait request_prepare model_request output_return",
);

export const LOCAL_TTFT_PREPARATION_STAGES: readonly string[] = wordsOf(
  "context hooks persistence compaction mcp tools request_assembly",
);

const TTFT_BUCKETS: readonly number[] = [
  1, 5, 10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 30_000, 60_000, 300_000,
];

export const LOCAL_TTFT_BUCKETS_MS: number[] = [...TTFT_BUCKETS];

/** 上限与 TTL 集中登记，导出名逐个投影，避免数值散落在 schema 里。 */
const LIMITS = { details: 64, pending: 128, ttl: 300_000, clockErrorMs: 10, clockTtlMs: 60_000 };

export const LOCAL_TTFT_MAX_DETAILS = LIMITS.details;
export const LOCAL_TTFT_MAX_PENDING = LIMITS.pending;
export const LOCAL_TTFT_TTL_MS = LIMITS.ttl;
export const LOCAL_TTFT_CLOCK_MAX_ERROR_MS = LIMITS.clockErrorMs;
export const LOCAL_TTFT_CLOCK_TTL_MS = LIMITS.clockTtlMs;

const timestamp = () => z.number().finite().nonnegative();
const label = () => z.string().min(1).max(128);

const withOptional = (shape: z.ZodRawShape): z.ZodRawShape =>
  Object.fromEntries(
    Object.entries(shape).map(([key, value]) => [key, (value as z.ZodType).optional()]),
  );

/** facts 与 record 共用的归一化标识字段：都可缺省，缺省即不参与聚合。 */
const NORMALIZED_ID_FIELDS =
  "sessionId turnId productTurnId queryId requestId logicalCallId cliVersion provider model";

const normalizedOptional = (): z.ZodRawShape =>
  withOptional(Object.fromEntries(wordsOf(NORMALIZED_ID_FIELDS).map((field) => [field, label()])));

const detailStageSchema = enumWords(
  `${LOCAL_TTFT_PREPARATION_STAGES.join(" ")} attempt retry_wait user_confirmation`,
);

const detailWindowOk = (value: { start: number; end?: number }): boolean =>
  value.end === undefined || value.end >= value.start;

const detailShape = (): z.ZodRawShape => ({
  id: label(),
  stage: detailStageSchema,
  start: timestamp(),
  end: timestamp().optional(),
  outcome: enumWords("completed failed cancelled first_output").optional(),
  requestId: label().optional(),
  logicalCallId: label().optional(),
  role: enumWords("response preparation").optional(),
  source: enumWords("renderer cli"),
});

export const localTtftDetailSchema = strictShape(detailShape()).refine((value) =>
  detailWindowOk(value as { start: number; end?: number }),
);

export type LocalTtftDetail = z.output<typeof localTtftDetailSchema>;

export const localTtftContextSchema = z
  .object({ version: z.literal(1), observationId: z.string().uuid() })
  .strict();

export type LocalTtftContext = z.output<typeof localTtftContextSchema>;

export const localTtftClockSchema = z
  .object({ instanceId: label(), receivedAt: timestamp(), sentAt: timestamp() })
  .strict();

export type LocalTtftClock = z.output<typeof localTtftClockSchema>;

type Calibration = {
  instanceId: string;
  offsetMs: number;
  errorMs: number;
  measuredAt: number;
};

export type LocalTtftCalibration = Calibration;

const everyFinite = (values: readonly number[]): boolean => values.every(Number.isFinite);

/**
 * 时钟校准：往返时延对称假设下，网络时延是「墙钟区间」与「对端区间」之差。
 * 只有四个时间点都有限、区间不倒挂且估算网络误差不超过阈值时才产出校准值——
 * 否则宁可不校准，也不让错误的偏移污染后续所有 TTFT 数字。
 */
export const calibrateLocalTtftClock = (
  start: number,
  end: number,
  clock: LocalTtftClock,
): Calibration | undefined => {
  const samples = [start, end, clock.receivedAt, clock.sentAt];
  if (!everyFinite(samples)) return undefined;

  const wallClock = end - start;
  const peerClock = clock.sentAt - clock.receivedAt;
  if (wallClock < 0 || peerClock < 0) return undefined;

  const asymmetry = wallClock - peerClock;
  if (asymmetry < 0) return undefined;

  const errorMs = asymmetry / 2;
  if (errorMs > LIMITS.clockErrorMs) return undefined;

  const offsetMs = (start + end - clock.receivedAt - clock.sentAt) / 2;
  return {
    instanceId: clock.instanceId,
    offsetMs: Math.round(offsetMs),
    errorMs: Math.round(errorMs),
    measuredAt: end,
  };
};

export const localTtftOutputKindSchema = enumWords("text reasoning tool");

export type LocalTtftOutputKind = z.output<typeof localTtftOutputKindSchema>;

const optionalInteger = () => z.number().int().nonnegative().optional();

const factsShape = (): z.ZodRawShape => ({
  version: z.literal(1),
  observationId: z.string().uuid(),
  instanceId: label(),
  commandId: label(),
  ...normalizedOptional(),
  details: z.array(localTtftDetailSchema).max(LIMITS.details).optional(),
  truncated: z.boolean().optional(),
  revision: optionalInteger(),
  sendMode: enumWords("idle queued guided").optional(),
  clockInvalid: z.boolean().optional(),
  receivedAt: timestamp(),
  admittedAt: timestamp().optional(),
  executionAt: timestamp().optional(),
  requestAt: timestamp().optional(),
  outputAt: timestamp().optional(),
  outputKind: localTtftOutputKindSchema.optional(),
  terminal: enumWords("completed failed cancelled rejected interrupted").optional(),
  excluded: enumWords("busy retry unsupported failed capacity").optional(),
});

export const localTtftFactsSchema = strictShape(factsShape());

export type LocalTtftFacts = z.output<typeof localTtftFactsSchema>;

const intervalWindowOk = (value: { start: number; end: number }): boolean =>
  value.end >= value.start;

export const localTtftIntervalSchema = strictShape({
  stage: enumWords(LOCAL_TTFT_STAGES.join(" ")),
  start: timestamp(),
  end: timestamp(),
  source: enumWords("renderer cli aligned"),
}).refine((value) => intervalWindowOk(value as { start: number; end: number }));

const RECORD_KINDS = enumWords("start first_output first_text no_text excluded checkpoint");

const RECORD_OUTCOME_WORDS = [
  "success busy retry unsupported failed cancelled",
  "background expired capacity recovery",
  // 桌面 continuous 缓冲溢出/投影重建后的 online snapshot；不是手机 replayable 恢复。
  "resync clock_invalid",
  "rejected interrupted guided unclosed",
];

const RECORD_OUTCOMES = enumWords(RECORD_OUTCOME_WORDS.join(" "));

const recordWindowOk = (value: { start: number; end: number }): boolean => value.end >= value.start;

const visibilityChangeSchema = strictShape({ at: timestamp(), foreground: z.boolean() });

const recordExtraIds = (): z.ZodRawShape => ({
  cliInstanceId: label().optional(),
  checkpointId: label().optional(),
});

const recordShape = (): z.ZodRawShape => ({
  version: z.literal(1),
  observationId: z.string().uuid(),
  commandId: label().optional(),
  ...normalizedOptional(),
  ...recordExtraIds(),
  kind: RECORD_KINDS,
  outcome: RECORD_OUTCOMES,
  start: timestamp(),
  end: timestamp(),
  firstOutputKind: localTtftOutputKindSchema.optional(),
  quality: enumWords("complete missing clock_invalid"),
  clockErrorMs: timestamp().optional(),
  intervals: z.array(localTtftIntervalSchema).max(6),
  details: z.array(localTtftDetailSchema).max(LIMITS.details).optional(),
  truncated: z.boolean().optional(),
  sendMode: enumWords("idle queued guided").optional(),
  visibility: enumWords("foreground background background_returned").optional(),
  visibilityChanges: z.array(visibilityChangeSchema).max(32).optional(),
  userWaitMs: timestamp().optional(),
  executionMs: timestamp().optional(),
  timingReliable: z.boolean().optional(),
  cliTimingReliable: z.boolean().optional(),
});

export const localTtftRecordSchema = strictShape(recordShape()).refine((value) =>
  recordWindowOk(value as { start: number; end: number }),
);

export type LocalTtftRecord = z.output<typeof localTtftRecordSchema>;

const sequenceNumber = () => z.number().int().nonnegative();

export const localTtftBatchSchema = strictShape({
  version: z.literal(1),
  rendererInstanceId: label(),
  sequence: sequenceNumber(),
  records: z.array(localTtftRecordSchema).max(32),
  dropped: sequenceNumber(),
});

export type LocalTtftBatch = z.output<typeof localTtftBatchSchema>;

/** 渲染器时间基准：与 performance.now() 同源，但可跨进程比较。 */
export const localTtftNow = (): number => performance.timeOrigin + performance.now();
