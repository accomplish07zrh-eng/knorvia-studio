// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

/** OTLP/HTTP 导出的固定身份与批量上限；采样上限决定最坏情况下的开销。 */
const TRACE_CONSTANTS = {
  serviceName: "knorvia-desktop-renderer",
  maxSampleRatio: 0.2,
  maxBatchSpans: 32,
  maxBatchBytes: 256 * 1024,
} as const;

export const RENDERER_ACTION_TRACE_SERVICE_NAME = TRACE_CONSTANTS.serviceName;
export const RENDERER_ACTION_TRACE_MAX_SAMPLE_RATIO = TRACE_CONSTANTS.maxSampleRatio;
export const RENDERER_ACTION_TRACE_MAX_BATCH_SPANS = TRACE_CONSTANTS.maxBatchSpans;
export const RENDERER_ACTION_TRACE_MAX_BATCH_BYTES = TRACE_CONSTANTS.maxBatchBytes;

/** 空白分词；词在类型层保持字面量，枚举键才不会被抹成 string。 */
type Words<Source extends string> = Source extends `${infer Head} ${infer Rest}`
  ? [Head, ...Words<Rest>]
  : [Source];

const words = <const Source extends string>(source: Source): Words<Source> =>
  source.trim().split(/\s+/u) as Words<Source>;

const wordEnum = <const Source extends string>(source: Source) => z.enum(words(source));

/** 目录组是 UI 侧的稳定分区；新增分组要同时改采样配置的默认值。 */
export const rendererActionTraceGroupSchema = wordEnum(
  "core settings workbench extensions automation account",
);

export type RendererActionTraceGroup = z.output<typeof rendererActionTraceGroupSchema>;

const groupCount = words("core settings workbench extensions automation account").length;

const IDENTIFIER_CHARS = new RegExp("^[A-Za-z0-9._:-]{1,128}$", "u");
const VALUE_CHARS = new RegExp("^[A-Za-z0-9._:-]{1,64}$", "u");
const ANY_TEXT = new RegExp("^[\\s\\S]{1,128}$", "u");

const boundedText = (pattern: RegExp) => z.string().trim().regex(pattern);

const identifierSchema = () => boundedText(IDENTIFIER_CHARS);
const valueSchema = () => boundedText(VALUE_CHARS);
const uuid = () => z.string().uuid();
const hex = (length: 16 | 32) => z.string().regex(new RegExp(`^[0-9a-f]{${length}}$`, "u"));

const flag = () => z.boolean();
const optionalFlag = () => flag().optional();

const configShape = () => ({
  enabled: flag(),
  localTtftEnabled: optionalFlag(),
  sampleRatio: z.number().finite().min(0).max(RENDERER_ACTION_TRACE_MAX_SAMPLE_RATIO),
  enabledGroups: z.array(rendererActionTraceGroupSchema).max(groupCount),
  configVersion: boundedText(ANY_TEXT),
});

export const rendererActionTraceConfigSchema = z.object(configShape()).strict();

export type RendererActionTraceConfigV1 = z.output<typeof rendererActionTraceConfigSchema>;

const DISABLED_CONFIG_FIELDS: RendererActionTraceConfigV1 = {
  enabled: false,
  sampleRatio: 0,
  enabledGroups: [],
  configVersion: "disabled",
};

export const DISABLED_RENDERER_ACTION_TRACE_CONFIG: RendererActionTraceConfigV1 =
  DISABLED_CONFIG_FIELDS;

/** 可选项统一在此登记；必需项单独列出，避免两者混排后看不出必填边界。 */
const optionalAttributes = () => ({
  result_source: wordEnum(
    "local_commit shared_settings setting_service platform_result authority_ack optimistic_projection",
  ).optional(),
  failure_stage: identifierSchema().optional(),
  state_after: wordEnum("enabled disabled").optional(),
  configured: optionalFlag(),
  requires_restart: optionalFlag(),
  section_id: identifierSchema().optional(),
  value_after: valueSchema().optional(),
  workspace_kind: wordEnum("local remote").optional(),
  remote_kind: wordEnum("ssh wsl docker server").optional(),
  admission_result: wordEnum("accepted rejected stale duplicate noop not_applicable").optional(),
  automation_kind: wordEnum("scheduled off_peak").optional(),
});

const attributeShape = () => ({
  feature_id: identifierSchema(),
  action: identifierSchema(),
  catalog_group: rendererActionTraceGroupSchema,
  operation_kind: wordEnum("navigation preference command management destructive"),
  surface: identifierSchema(),
  trigger: wordEnum("button keyboard shortcut menu switch select drag"),
  outcome: wordEnum("completed failed rejected cancelled noop abandoned"),
  ...optionalAttributes(),
  action_id: uuid(),
});

export const rendererActionTraceAttributesSchema = z.object(attributeShape()).strict();

export type RendererActionTraceAttributes = z.output<typeof rendererActionTraceAttributesSchema>;

const spanWindowOk = (span: { startTimeUnixMs: number; endTimeUnixMs: number }): boolean =>
  span.endTimeUnixMs >= span.startTimeUnixMs;

const timestamp = () => z.number().finite().nonnegative();

const spanFields = () => ({
  traceId: hex(32),
  spanId: hex(16),
  name: z.literal("ui_action"),
  startTimeUnixMs: timestamp(),
  endTimeUnixMs: timestamp(),
  status: wordEnum("unset ok error"),
  attributes: rendererActionTraceAttributesSchema,
});

const spanObjectSchema = z.object(spanFields()).strict();

export const rendererActionTraceSpanSchema = spanObjectSchema.superRefine((span, context) => {
  if (spanWindowOk(span as { startTimeUnixMs: number; endTimeUnixMs: number })) return;
  context.addIssue({
    code: "custom",
    message: "endTimeUnixMs must be greater than or equal to startTimeUnixMs",
    path: ["endTimeUnixMs"],
  });
});

export type RendererActionTraceSpanV1 = z.output<typeof rendererActionTraceSpanSchema>;

const resourceShape = () => ({
  serviceName: z.literal(RENDERER_ACTION_TRACE_SERVICE_NAME),
  serviceVersion: identifierSchema(),
  deploymentEnvironment: wordEnum("development test production"),
  rendererInstanceId: identifierSchema(),
});

export const rendererActionTraceResourceSchema = z.object(resourceShape()).strict();

export type RendererActionTraceResourceV1 = z.output<typeof rendererActionTraceResourceSchema>;

const counter = () => z.number().int().nonnegative();

const batchFields = () => ({
  version: z.literal(1),
  rendererInstanceId: identifierSchema(),
  sequence: counter(),
  droppedSinceLastFlush: counter(),
  resource: rendererActionTraceResourceSchema,
  spans: z.array(rendererActionTraceSpanSchema).max(RENDERER_ACTION_TRACE_MAX_BATCH_SPANS),
});

const batchObjectSchema = z.object(batchFields()).strict();

type BatchWindow = { rendererInstanceId: string; resource: { rendererInstanceId: string } };

export const rendererActionTraceBatchSchema = batchObjectSchema.superRefine((batch, context) => {
  const checked = batch as BatchWindow;
  if (checked.resource.rendererInstanceId === checked.rendererInstanceId) return;
  context.addIssue({
    code: "custom",
    message: "rendererInstanceId must match the resource",
    path: ["resource", "rendererInstanceId"],
  });
});

export type RendererActionTraceBatchV1 = z.output<typeof rendererActionTraceBatchSchema>;
