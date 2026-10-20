// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import {
  ALIGNED_SOURCES,
  DETAIL_OUTCOMES,
  DETAIL_ROLES,
  EXCLUSION_REASONS,
  LOCAL_TTFT_BUCKETS_MS,
  LOCAL_TTFT_CLOCK_MAX_ERROR_MS,
  LOCAL_TTFT_CLOCK_TTL_MS,
  LOCAL_TTFT_DETAIL_EXTRA_STAGES,
  LOCAL_TTFT_MAX_DETAILS,
  LOCAL_TTFT_MAX_PENDING,
  LOCAL_TTFT_PREPARATION_STAGES,
  LOCAL_TTFT_STAGES,
  LOCAL_TTFT_TTL_MS,
  NORMALIZED_ID_FIELDS,
  OBSERVATION_SOURCES,
  OUTPUT_KINDS,
  RECORD_KINDS,
  RECORD_OUTCOMES,
  RECORD_QUALITIES,
  SEND_MODES,
  TERMINAL_OUTCOMES,
  VISIBILITY_STATES,
} from "./localTtft-data.js";

/*
 * 本地 TTFT 观测的线格式：桌面 renderer 采样、主进程聚合、CLI 侧对齐共用一套 schema。
 * 阶段序、上限与枚举取值集中在 ./localTtft-data.js，这里只写构造与校验。
 * 同一批字段在 facts / record / batch 里反复出现，因此先做一层小构造器再拼形状，
 * 既保证三处校验强度一致，也避免「改了一处忘了另一处」。
 */

export {
  LOCAL_TTFT_BUCKETS_MS,
  LOCAL_TTFT_CLOCK_MAX_ERROR_MS,
  LOCAL_TTFT_CLOCK_TTL_MS,
  LOCAL_TTFT_MAX_DETAILS,
  LOCAL_TTFT_MAX_PENDING,
  LOCAL_TTFT_PREPARATION_STAGES,
  LOCAL_TTFT_STAGES,
  LOCAL_TTFT_TTL_MS,
};

/** 把登记表的取值投影成 z.enum 需要的非空元组。 */
const enumValues = <Value extends string>(table: Readonly<Record<string, Value>>) =>
  Object.values(table) as [Value, ...Value[]];

const strictShape = <S extends z.ZodRawShape>(shape: S) => z.object(shape).strict();

/** 非负有限的时间点。 */
const timestamp = () => z.number().finite().nonnegative();
const optionalTimestamp = () => timestamp().optional();

/** 1–128 字符的标识文案。 */
const label = () => z.string().min(1).max(128);

const optionalLabel = () => label().optional();
const optionalFlag = () => z.boolean().optional();
const optionalInteger = () => z.number().int().nonnegative().optional();
const optionalEnum = <Values extends readonly [string, ...string[]]>(values: Values) =>
  z.enum(values).optional();

/** facts 与 record 共用的归一化标识字段：都可缺省，缺省即不参与聚合。 */
type OptionalLabels<Fields extends readonly string[]> = {
  [Field in Fields[number]]: z.ZodOptional<z.ZodString>;
};

const normalizedOptional = (): OptionalLabels<typeof NORMALIZED_ID_FIELDS> =>
  Object.fromEntries(
    NORMALIZED_ID_FIELDS.map((field) => [field, optionalLabel()]),
  ) as OptionalLabels<typeof NORMALIZED_ID_FIELDS>;

/** 每条观测记录都以「协议版本 + 观测 id」开头，context / facts / record 三处共用。 */
const OBSERVATION_HEAD = { version: z.literal(1), observationId: z.string().uuid() };

const outputKindField = () => z.enum(enumValues(OUTPUT_KINDS)).optional();
const sendModeField = () => optionalEnum(enumValues(SEND_MODES));

const detailWindowOk = (value: { start: number; end?: number }): boolean =>
  value.end === undefined || value.end >= value.start;

const detailShape = () => ({
  id: label(),
  stage: z.enum([...LOCAL_TTFT_PREPARATION_STAGES, ...LOCAL_TTFT_DETAIL_EXTRA_STAGES]),
  start: timestamp(),
  end: optionalTimestamp(),
  outcome: optionalEnum(enumValues(DETAIL_OUTCOMES)),
  requestId: optionalLabel(),
  logicalCallId: optionalLabel(),
  role: optionalEnum(enumValues(DETAIL_ROLES)),
  source: z.enum(enumValues(OBSERVATION_SOURCES)),
});

export const localTtftDetailSchema = strictShape(detailShape()).refine((value) =>
  detailWindowOk(value as { start: number; end?: number }),
);

export type LocalTtftDetail = z.output<typeof localTtftDetailSchema>;

export const localTtftContextSchema = z.object(OBSERVATION_HEAD).strict();

export type LocalTtftContext = z.output<typeof localTtftContextSchema>;

export const localTtftClockSchema = z
  .object({ instanceId: label(), receivedAt: timestamp(), sentAt: timestamp() })
  .strict();

export type LocalTtftClock = z.output<typeof localTtftClockSchema>;

export interface LocalTtftCalibration {
  instanceId: string;
  offsetMs: number;
  errorMs: number;
  measuredAt: number;
}

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
): LocalTtftCalibration | undefined => {
  const samples = [start, end, clock.receivedAt, clock.sentAt];
  if (!everyFinite(samples)) return undefined;

  const wallClock = end - start;
  const peerClock = clock.sentAt - clock.receivedAt;
  if (wallClock < 0 || peerClock < 0) return undefined;

  const asymmetry = wallClock - peerClock;
  if (asymmetry < 0) return undefined;

  const errorMs = asymmetry / 2;
  if (errorMs > LOCAL_TTFT_CLOCK_MAX_ERROR_MS) return undefined;

  const offsetMs = (start + end - clock.receivedAt - clock.sentAt) / 2;
  return {
    instanceId: clock.instanceId,
    offsetMs: Math.round(offsetMs),
    errorMs: Math.round(errorMs),
    measuredAt: end,
  };
};

export const localTtftOutputKindSchema = z.enum(enumValues(OUTPUT_KINDS));

export type LocalTtftOutputKind = z.output<typeof localTtftOutputKindSchema>;

const detailsField = () => z.array(localTtftDetailSchema).max(LOCAL_TTFT_MAX_DETAILS).optional();

const factsShape = () => ({
  ...OBSERVATION_HEAD,
  instanceId: label(),
  commandId: label(),
  ...normalizedOptional(),
  details: detailsField(),
  truncated: optionalFlag(),
  revision: optionalInteger(),
  sendMode: sendModeField(),
  clockInvalid: optionalFlag(),
  receivedAt: timestamp(),
  admittedAt: optionalTimestamp(),
  executionAt: optionalTimestamp(),
  requestAt: optionalTimestamp(),
  outputAt: optionalTimestamp(),
  outputKind: outputKindField(),
  terminal: optionalEnum(enumValues(TERMINAL_OUTCOMES)),
  excluded: optionalEnum(enumValues(EXCLUSION_REASONS)),
});

export const localTtftFactsSchema = strictShape(factsShape());

export type LocalTtftFacts = z.output<typeof localTtftFactsSchema>;

const intervalWindowOk = (value: { start: number; end: number }): boolean =>
  value.end >= value.start;

export const localTtftIntervalSchema = strictShape({
  stage: z.enum(LOCAL_TTFT_STAGES),
  start: timestamp(),
  end: timestamp(),
  source: z.enum(enumValues(ALIGNED_SOURCES)),
}).refine((value) => intervalWindowOk(value as { start: number; end: number }));

const recordWindowOk = (value: { start: number; end: number }): boolean => value.end >= value.start;

const visibilityChangeSchema = strictShape({ at: timestamp(), foreground: z.boolean() });

const recordShape = () => ({
  ...OBSERVATION_HEAD,
  commandId: optionalLabel(),
  ...normalizedOptional(),
  cliInstanceId: optionalLabel(),
  checkpointId: optionalLabel(),
  kind: z.enum(enumValues(RECORD_KINDS)),
  outcome: z.enum(enumValues(RECORD_OUTCOMES)),
  start: timestamp(),
  end: timestamp(),
  firstOutputKind: outputKindField(),
  quality: z.enum(enumValues(RECORD_QUALITIES)),
  clockErrorMs: optionalTimestamp(),
  intervals: z.array(localTtftIntervalSchema).max(6),
  details: detailsField(),
  truncated: optionalFlag(),
  sendMode: sendModeField(),
  visibility: optionalEnum(enumValues(VISIBILITY_STATES)),
  visibilityChanges: z.array(visibilityChangeSchema).max(32).optional(),
  userWaitMs: optionalTimestamp(),
  executionMs: optionalTimestamp(),
  timingReliable: optionalFlag(),
  cliTimingReliable: optionalFlag(),
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
